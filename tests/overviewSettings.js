// Run with GSETTINGS_BACKEND=memory and GNOME Shell typelib/library paths.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw';
import { normalizeColor } from '../src/colors.js';

import { getConfig, attachSettingsListeners, detachSettingsListeners, SETTINGS_GSCHEMA } from '../src/config.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(GLib.getenv('GSETTINGS_BACKEND') === 'memory', 'Use the memory backend to protect saved preferences');
Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
const { ExtensionPreferences } = await import('resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js');
ExtensionPreferences.lookupByURL = () => ({ gettext: text => text });
const { default: Gradients } = await import('../src/settings/gradientsPage.js');
const { default: Behavior } = await import('../src/settings/behavioursPage.js');
const directory = GLib.dir_make_tmp('overview-settings-test-XXXXXX');
const schemaName = `${SETTINGS_GSCHEMA}.gschema.xml`;
Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child(`src/schemas/${schemaName}`)
    .copy(Gio.File.new_for_path(`${directory}/${schemaName}`), Gio.FileCopyFlags.NONE, null, null);
GLib.spawn_sync(null, ['glib-compile-schemas', '--strict', directory], null, GLib.SpawnFlags.SEARCH_PATH, null);
try {
    const schema = Gio.SettingsSchemaSource.new_from_directory(directory, Gio.SettingsSchemaSource.get_default(), false).lookup(SETTINGS_GSCHEMA, false);
    const settings = new Gio.Settings({ settings_schema: schema });
    assert(getConfig(settings).overviewBehavior === 'keep-gradient', 'Upgrade must keep the main gradient in overview');
    Gtk.init();
    const window = new Adw.PreferencesWindow();
    const page = new Gradients(window, settings);
    assert(page.title === 'Gradients', 'Gradient settings have their own tab');
    window.add(page);
    window.present();
    const find = (widget, predicate) => {
        if (predicate(widget)) return widget;
        for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) {
            const result = find(child, predicate);
            if (result) return result;
        }
        return null;
    };
    const behaviorPage = new Behavior(window, settings);
    window.add(behaviorPage);
    const transitions = find(behaviorPage, widget => widget instanceof Adw.PreferencesGroup && widget.title === 'Transitions');
    const proximityBlend = find(transitions, widget => widget instanceof Adw.SwitchRow && widget.title === 'Blend as windows approach');
    const overviewBlend = find(transitions, widget => widget instanceof Adw.SwitchRow && widget.title === 'Blend with overview gestures');
    assert(proximityBlend && overviewBlend, 'Both blending controls belong to Transitions');
    assert(!find(page, widget => widget instanceof Adw.SwitchRow && widget.title === 'Blend with overview gestures'), 'Overview blending moved out of Gradients');
    overviewBlend.active = true;
    assert(settings.get_boolean('overview-transition'), 'Overview blending writes its setting');
    settings.set_boolean('overview-transition', false);
    assert(!overviewBlend.active, 'Overview blending refreshes from settings');
    settings.set_string('maximized-behavior', 'keep-gradient');
    settings.set_string('style-trigger', 'proximity');
    assert(!proximityBlend.is_sensitive() && overviewBlend.is_sensitive(), 'Disabled window interaction leaves overview blending available');
    settings.set_string('maximized-behavior', 'keep-theme');
    assert(proximityBlend.is_sensitive(), 'Window blending is available with proximity interaction');
    settings.set_string('style-trigger', 'maximized');
    assert(!proximityBlend.is_sensitive(), 'Window blending is unavailable with maximized interaction');
    const behavior = find(page, widget => widget instanceof Adw.ComboRow && widget.title === 'When overview is open');
    const gradients = [
        ['Gradient Direction', 'Gradient Start Colour', 'colors', 'gradient-direction'],
        ['Alternate Gradient Direction', 'Alternate Gradient Start Colour', 'maximized-colors', 'maximized-gradient-direction'],
        ['Overview Gradient Direction', 'Overview Gradient Start Colour', 'overview-colors', 'overview-gradient-direction']
    ];
    const chooseRgba = Gtk.ColorDialog.prototype.choose_rgba;
    const finishRgba = Gtk.ColorDialog.prototype.choose_rgba_finish;
    try {
        Gtk.ColorDialog.prototype.choose_rgba = function (_parent, _initial, _cancellable, callback) {
            callback(this, null);
        };
        Gtk.ColorDialog.prototype.choose_rgba_finish = () => ({ to_string: () => 'rgb(12,34,56)' });
        for (const [title, startTitle, colorsKey, directionKey] of gradients) {
            const row = find(page, widget => widget instanceof Adw.ComboRow && widget.title === title);
            assert(row, `${title} exists`);
            row.selected = 1;
            assert(settings.get_string(directionKey) === 'horizontal', `${title} writes its own direction`);
            settings.set_string(directionKey, 'vertical');
            assert(row.selected === 0, `${title} refreshes from settings`);
            const beforeColors = new Map(gradients.map(([, , key]) => [key, settings.get_value(key)]));
            const button = find(page, widget => widget instanceof Gtk.Button && widget.tooltip_text === startTitle);
            assert(button, `${startTitle} exists`);
            button.emit('clicked');
            assert(settings.get_strv(colorsKey)[0] === 'rgb(12,34,56)', `${startTitle} writes its own colour`);
            assert(normalizeColor(settings.get_strv(colorsKey)[1]) === normalizeColor(beforeColors.get(colorsKey).deep_unpack()[1]), `${startTitle} preserves the other endpoint's colour and alpha`);
            for (const [key, value] of beforeColors) {
                if (key !== colorsKey)
                    assert(settings.get_value(key).equal(value), `${startTitle} leaves ${key} unchanged`);
            }
        }
    } finally {
        Gtk.ColorDialog.prototype.choose_rgba = chooseRgba;
        Gtk.ColorDialog.prototype.choose_rgba_finish = finishRgba;
    }
    const direction = find(page, widget => widget instanceof Adw.ComboRow && widget.title === 'Overview Gradient Direction');
    assert(behavior && direction, 'Overview exposes its behavior and direction controls');
    assert(!direction.is_visible(), 'Custom controls start hidden');
    behavior.selected = 2;
    assert(getConfig(settings).overviewBehavior === 'apply-style' && direction.is_visible(), 'Custom selection enables the editor');
    direction.selected = 1;
    assert(getConfig(settings).overviewGradientDirection === 'horizontal', 'Direction persists');
    const originalMain = settings.get_value('colors');
    const originalAlternate = settings.get_value('maximized-colors');
    const changed = [];
    const handlers = attachSettingsListeners(settings, (_settings, key) => changed.push(key));
    settings.set_strv('overview-colors', ['rgba(255,0,0,0.4)', 'rgba(0,0,255,0.2)']);
    settings.set_string('overview-gradient-direction', 'vertical');
    settings.set_string('overview-behavior', 'keep-theme');
    assert(behavior.selected === 1 && direction.selected === 0 && !direction.is_visible(), 'External settings refresh controls');
    assert(changed.includes('overview-colors') && changed.includes('overview-gradient-direction') && changed.includes('overview-behavior'), 'All overview settings notify runtime');
    behavior.selected = 2;
    assert(getConfig(settings).overviewColors.start === 'rgba(255,0,0,0.4)', 'Switching modes preserves saved colours and opacity');
    assert(settings.get_value('colors').equal(originalMain) && settings.get_value('maximized-colors').equal(originalAlternate), 'Overview edits leave other gradients intact');
    settings.set_strv('overview-colors', []);
    assert(getConfig(settings).overviewColors.start === getConfig(settings).colors.start, 'Malformed colour pair falls back to main');
    settings.set_strv('overview-colors', ['invalid', 'rgba(0,0,255,0.2)']);
    assert(getConfig(settings).overviewColors.start === getConfig(settings).colors.start, 'Invalid overview colour falls back to main');
    settings.set_string('overview-gradient-direction', 'horizontal');
    const before = new Map(schema.list_keys().map(key => [key, settings.get_value(key)]));
    const reset = find(page, widget => widget instanceof Gtk.Button && widget.tooltip_text === 'Reset overview appearance?');
    assert(reset, 'Overview has the same reset affordance as other appearance groups');
    window.present();
    reset.emit('clicked');
    let dialog = window.get_visible_dialog();
    dialog.emit('response', 'cancel');
    dialog.force_close();
    assert(settings.get_string('overview-behavior') === 'apply-style', 'Cancelling reset preserves overview');
    reset.emit('clicked');
    dialog = window.get_visible_dialog();
    dialog.emit('response', 'reset');
    dialog.force_close();
    for (const [key, value] of before) {
        const expected = key.startsWith('overview-') && key !== 'overview-transition' ? settings.get_default_value(key) : value;
        assert(settings.get_value(key).equal(expected), `Overview reset changed the wrong setting: ${key}`);
    }
    detachSettingsListeners(settings, handlers);

    const distance = find(behaviorPage, widget => widget instanceof Adw.SpinRow && widget.title === 'Proximity distance');
    const waitForDistanceSave = () => {
        const loop = new GLib.MainLoop(null, false);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => { loop.quit(); return GLib.SOURCE_REMOVE; });
        loop.run();
    };
    distance.set_value(65);
    settings.set_int('proximity-distance', 80);
    assert(distance.value === 80, 'External distance changes replace pending edits in the row');
    waitForDistanceSave();
    assert(settings.get_int('proximity-distance') === 80, 'A pending edit cannot overwrite an external distance change');

    settings.reset('proximity-distance');
    const defaultDistance = settings.get_int('proximity-distance');
    distance.set_value(65);
    const resetInteraction = find(behaviorPage, widget => widget instanceof Gtk.Button && widget.tooltip_text === 'Reset window interaction?');
    resetInteraction.emit('clicked');
    dialog = window.get_visible_dialog();
    dialog.emit('response', 'reset');
    dialog.force_close();
    assert(distance.value === defaultDistance, 'Reset discards an edit even when the saved distance was already default');
    waitForDistanceSave();
    assert(settings.get_int('proximity-distance') === defaultDistance, 'No stale edit is saved after reset');

    distance.set_value(70);
    window.close();
    assert(settings.get_int('proximity-distance') === 70, 'Closing preferences immediately commits the pending distance');
    waitForDistanceSave();
    assert(settings.get_int('proximity-distance') === 70, 'Closing leaves no stale distance save');
    print('Overview defaults, preferences, notifications, isolation and reset passed');
} finally {
    for (const name of [schemaName, 'gschemas.compiled'])
        Gio.File.new_for_path(`${directory}/${name}`).delete(null);
    Gio.File.new_for_path(directory).delete(null);
}
