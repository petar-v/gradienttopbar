// Run with GSETTINGS_BACKEND=memory and GNOME Shell typelib/library paths.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw';

import { getConfig, attachSettingsListeners, detachSettingsListeners, SETTINGS_GSCHEMA } from '../src/config.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(GLib.getenv('GSETTINGS_BACKEND') === 'memory', 'Use the memory backend to protect saved preferences');
Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
const { ExtensionPreferences } = await import('resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js');
ExtensionPreferences.lookupByURL = () => ({ gettext: text => text });
const { default: Appearance } = await import('../src/settings/appearancePage.js');
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
    const page = new Appearance(window, settings);
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
    const behavior = find(page, widget => widget instanceof Adw.ComboRow && widget.title === 'When overview is open');
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
        const expected = key.startsWith('overview-') ? settings.get_default_value(key) : value;
        assert(settings.get_value(key).equal(expected), `Overview reset changed the wrong setting: ${key}`);
    }
    detachSettingsListeners(settings, handlers);
    window.close();
    print('Overview defaults, preferences, notifications, isolation and reset passed');
} finally {
    for (const name of [schemaName, 'gschemas.compiled'])
        Gio.File.new_for_path(`${directory}/${name}`).delete(null);
    Gio.File.new_for_path(directory).delete(null);
}
