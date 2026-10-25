import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
import { getConfig, attachSettingsListeners, detachSettingsListeners } from '../src/config.js';
import { assert, test, run } from './fixtures/gjs.js';
import { initializePreferences, createSettingsFixture, trackWindow, findWidget, captureDraw, createPixelReader, waitUntil } from './fixtures/preferences.js';

await initializePreferences();
const { createShadowEditor } = await import('../src/settings/components/shadowEditor.js');
const { createShadowPreview } = await import('../src/settings/components/shadowPreview.js');
const { default: ContentShadows } = await import('../src/settings/contentShadowsPage.js');
const { default: Gradients } = await import('../src/settings/gradientsPage.js');
const { default: Behavior } = await import('../src/settings/behavioursPage.js');

const createShadowFixture = t => {
    const { settings, schema } = createSettingsFixture(t);
    let changes = 0;
    const handlers = attachSettingsListeners(settings, () => changes++);
    t.after(() => detachSettingsListeners(settings, handlers));
    const picker = createShadowEditor(settings);
    const { value: preview, draw } = captureDraw(() => createShadowPreview(settings));
    const editor = picker.widget;
    const sample = preview.widget.get_last_child();
    const sampleContent = sample.get_last_child();
    const iconClockRow = sampleContent.get_first_child();
    const iconButton = iconClockRow.get_first_child();
    const previewIcon = iconButton.get_child();
    const clock = iconClockRow.get_last_child();
    const sampleText = sampleContent.get_first_child().get_next_sibling();
    const textClick = sampleText.observe_controllers().get_item(0);
    const styleSwitch = sampleContent.get_last_child();
    const contents = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    contents.append(picker.widget);
    contents.append(preview.widget);
    trackWindow(t, new Gtk.Window({ child: contents }));
    const pixel = createPixelReader(t, draw, 240, 72);
    return {
        settings, schema, picker, preview, editor, sample, sampleContent, iconButton, previewIcon,
        clock, sampleText, textClick, styleSwitch, pixel, get changes() { return changes; }
    };
};

test('shadow defaults are preserved', t => {
    const fixture = createShadowFixture(t);
    const { settings } = fixture;
    assert(getConfig(settings).shadowBlur === 3, 'Default blur');
    assert(getConfig(settings).shadowOffsetY === 0, 'Default Y');
});

test('preview text and icons cycle without changing the captured clock', t => {
    const fixture = createShadowFixture(t);
    const { preview, iconButton, previewIcon, clock, sampleText, textClick } = fixture;
    const capturedTime = clock.get_label();
    assert(/^\d{2}:\d{2}$/.test(capturedTime), 'Clock shows captured current time');
    assert(sampleText instanceof Gtk.Label && sampleText.get_label() === 'Normal', 'Sample starts with the state as plain text');
    assert(textClick instanceof Gtk.GestureClick, 'Text has a click gesture');
    for (const expected of ['AaBbCc', 'Gradient', 'Lorem Ipsum', 'Normal']) {
        textClick.emit('released', 1, 0, 0);
        assert(sampleText.get_label() === expected, 'Text cycles and wraps');
        preview.refresh();
        assert(sampleText.get_label() === expected, 'Refresh preserves the selected text');
    }
    for (let i = 0; i < 50; i++) {
        const previousIcon = previewIcon.get_icon_name();
        iconButton.emit('clicked');
        assert(previewIcon.get_icon_name() !== previousIcon, 'Click selects a different icon');
    }
    preview.refresh();
    assert(clock.get_label() === capturedTime, 'Refresh preserves captured time');
});

test('preview styles cycle independently of saved settings', t => {
    const fixture = createShadowFixture(t);
    const { settings, schema, preview, sampleText, textClick, styleSwitch } = fixture;
    const settingsBeforePreview = new Map(schema.list_keys().map(key => [key, settings.get_value(key)]));
    assert(preview.widget.get_first_child().get_first_child().get_label() === 'Preview · Normal', 'Initial style label');
    styleSwitch.emit('clicked');
    assert(preview.widget.get_first_child().get_first_child().get_label() === 'Preview · Window Nearby', 'Cycle to nearby window');
    assert(sampleText.get_label() === 'Window Nearby', 'Default sample follows the state');
    settings.set_string('style-trigger', 'maximized');
    preview.refresh();
    assert(sampleText.get_label() === 'Window Maximized', 'Default sample follows the trigger');
    settings.set_string('style-trigger', 'proximity');
    preview.refresh();
    textClick.emit('released', 1, 0, 0);
    assert(sampleText.get_label() === 'AaBbCc', 'Sample can be selected in any state');
    styleSwitch.emit('clicked');
    assert(preview.widget.get_first_child().get_first_child().get_label() === 'Preview · Overview', 'Cycle to overview');
    assert(sampleText.get_label() === 'AaBbCc', 'Switching states preserves the selected sample');
    for (let i = 0; i < 3; i++)
        textClick.emit('released', 1, 0, 0);
    assert(sampleText.get_label() === 'Overview', 'Sample cycle returns to the current state');
    for (const [key, value] of settingsBeforePreview)
        assert(settings.get_value(key).equal(value), `Preview switch changed ${key}`);
    const settingsBeforeCycle = new Map(schema.list_keys().map(key => [key, settings.get_value(key)]));
    styleSwitch.emit('clicked');
    assert(preview.widget.get_first_child().get_first_child().get_label() === 'Preview · Normal', 'Cycle back to normal');
    for (const [key, value] of settingsBeforeCycle)
        assert(settings.get_value(key).equal(value), `Preview switch changed ${key}`);
});

for (const behavior of ['keep-gradient', 'keep-theme', 'apply-style']) {
    for (const direction of ['vertical', 'horizontal']) {
        test(`overview preview ${behavior}, ${direction}`, t => {
            const fixture = createShadowFixture(t);
            const { settings, preview, sample, styleSwitch, pixel } = fixture;
            styleSwitch.emit('clicked');
            styleSwitch.emit('clicked');
            settings.set_strv('colors', ['rgb(255,0,0)', 'rgb(0,0,255)']);
            settings.set_string('overview-behavior', behavior);
            settings.set_strv('overview-colors', ['rgba(0,255,0,0.4)', 'rgba(0,0,255,0.2)']);
            const mainDirection = direction === 'vertical' ? 'horizontal' : 'vertical';
            settings.set_string('gradient-direction', mainDirection);
            settings.set_string('overview-gradient-direction', direction);
            preview.refresh();
            assert(sample.get_tooltip_text().includes('cannot be reproduced') === (behavior === 'keep-theme'), 'Overview theme preview is identified');
            if (behavior === 'keep-theme') {
                assert(pixel(20, 30)[0] !== pixel(30, 30)[0], 'Theme preview shows the checkerboard');
                return;
            }
            const selectedDirection = behavior === 'apply-style' ? direction : mainDirection;
            const start = selectedDirection === 'vertical' ? pixel(120, 8) : pixel(15, 36);
            const end = selectedDirection === 'vertical' ? pixel(120, 64) : pixel(225, 36);
            const channel = behavior === 'apply-style' ? 1 : 0;
            assert(start[channel] > start[2] && end[2] > end[channel], 'Overview preview uses the selected gradient, opacity and direction');
        });
    }
}

test('shadow editor bindings persist offsets, colour and blur while preview stays usable', t => {
    const fixture = createShadowFixture(t);
    const { settings, picker, editor, sample } = fixture;
    settings.set_boolean('content-shadows', false);
    assert(sample.is_sensitive() && !editor.is_sensitive(), 'Preview stays usable with shadows disabled');
    settings.set_boolean('content-shadows', true);
    const x = editor.get_child_at(2, 0);
    const y = editor.get_child_at(2, 1);
    x.set_value(-6);
    y.set_value(6);
    assert(getConfig(settings).shadowOffsetX === -6 && getConfig(settings).shadowOffsetY === 6, 'Picker persists offsets');
    settings.set_int('shadow-offset-x', 3);
    assert(x.get_value() === 3, 'External settings update picker');
    settings.set_string('shadow-color', 'rgba(255,0,0,0.25)');
    settings.set_int('shadow-blur', 12);
    picker.refresh();
    assert(getConfig(settings).shadowColor === 'rgba(255,0,0,0.25)', 'Colour preserves alpha');
    assert(getConfig(settings).shadowBlur === 12 && fixture.changes >= 5, 'Shadow settings notify runtime');
    editor.get_child_at(0, 3).emit('clicked');
    assert(x.get_value() === 0 && y.get_value() === 0, 'Centre persists zero offsets');
});

for (const [title, startTitle, endTitle, key] of [
    ['Gradient Direction', 'Gradient Start Colour', 'Gradient End Colour', 'gradient-direction'],
    ['Alternate Gradient Direction', 'Alternate Gradient Start Colour', 'Alternate Gradient End Colour', 'maximized-gradient-direction'],
    ['Overview Gradient Direction', 'Overview Gradient Start Colour', 'Overview Gradient End Colour', 'overview-gradient-direction']
]) {
    test(`${title} updates endpoint alignment and actual allocation`, t => {
        const { settings } = createSettingsFixture(t);
        const preferences = trackWindow(t, new Adw.PreferencesWindow());
        const page = new ContentShadows(preferences, settings);
        assert(page.title === 'Content Shadows', 'Shadows have their own tab');
        preferences.add(page);
        const gradientPage = new Gradients(preferences, settings);
        assert(gradientPage.title === 'Gradients', 'Gradients have their own tab');
        preferences.add(gradientPage);
        preferences.set_visible_page(gradientPage);
        settings.set_string('maximized-behavior', 'apply-style');
        settings.set_string('overview-behavior', 'apply-style');
        preferences.present();
        const row = findWidget(gradientPage, widget => widget instanceof Adw.ComboRow && widget.get_title() === title);
        const start = findWidget(gradientPage, widget => widget instanceof Gtk.Button && widget.get_tooltip_text() === startTitle);
        const end = findWidget(gradientPage, widget => widget instanceof Gtk.Button && widget.get_tooltip_text() === endTitle);
        for (const selected of [1, 0, 1, 0]) {
            row.set_selected(selected);
            const vertical = selected === 0;
            assert(settings.get_string(key) === (vertical ? 'vertical' : 'horizontal'), 'Direction dropdown saves setting');
            assert(start.get_halign() === (vertical ? Gtk.Align.CENTER : Gtk.Align.START), 'Start horizontal alignment updates immediately');
            assert(start.get_valign() === (vertical ? Gtk.Align.START : Gtk.Align.CENTER), 'Start vertical alignment updates immediately');
            assert(end.get_halign() === (vertical ? Gtk.Align.CENTER : Gtk.Align.END), 'End horizontal alignment updates immediately');
            assert(end.get_valign() === (vertical ? Gtk.Align.END : Gtk.Align.CENTER), 'End vertical alignment updates immediately');
            const positionsMatch = () => {
                const startBox = start.get_allocation();
                const endBox = end.get_allocation();
                return vertical ? startBox.x === endBox.x && startBox.y < endBox.y
                    : startBox.y === endBox.y && startBox.x < endBox.x;
            };
            waitUntil(positionsMatch);
            assert(positionsMatch(), 'Allocated button positions follow direction');
        }
    });
}

test('content shadow reset confirms, cancels and restores every default', t => {
    const { settings } = createSettingsFixture(t);
    const preferences = trackWindow(t, new Adw.PreferencesWindow());
    const page = new ContentShadows(preferences, settings);
    preferences.add(page);
    settings.set_int('shadow-blur', 12);
    settings.set_string('shadow-color', 'rgba(255,0,0,0.25)');
    settings.set_boolean('content-shadows', true);
    settings.set_int('shadow-offset-x', -4);
    settings.set_int('shadow-offset-y', 5);
    const reset = findWidget(page, widget => widget instanceof Gtk.Button && widget.get_tooltip_text() === 'Reset panel content shadows?');
    assert(reset !== null, 'Content Shadows exposes reset');
    preferences.set_visible_page(page);
    preferences.present();
    reset.emit('clicked');
    let confirmation = preferences.get_visible_dialog();
    assert(confirmation instanceof Adw.AlertDialog, 'Reset requires confirmation');
    assert(getConfig(settings).shadowOffsetX === -4, 'Opening dialog does not reset');
    confirmation.emit('response', 'cancel');
    confirmation.force_close();
    assert(getConfig(settings).shadowOffsetX === -4 && getConfig(settings).shadowBlur === 12, 'Cancel preserves appearance');
    reset.emit('clicked');
    confirmation = preferences.get_visible_dialog();
    confirmation.emit('response', 'reset');
    confirmation.force_close();
    const config = getConfig(settings);
    assert(config.shadowOffsetX === 0 && config.shadowOffsetY === 0, 'Reset centres offsets');
    assert(config.shadowBlur === 3 && config.shadowColor === 'rgba(0, 0, 0, 0.6)', 'Reset restores blur and colour including opacity');
    assert(!config.contentShadows, 'Reset restores the disabled toggle default');
});

test('menu switch binds both ways and remains usable when interaction is disabled', t => {
    const { settings } = createSettingsFixture(t);
    const sectionsWindow = trackWindow(t, new Adw.PreferencesWindow());
    const gradients = new Gradients(sectionsWindow, settings);
    const behavior = new Behavior(sectionsWindow, settings);
    sectionsWindow.add(gradients);
    sectionsWindow.add(behavior);
    sectionsWindow.present();
    const menuSwitch = findWidget(behavior, widget =>
        widget instanceof Adw.SwitchRow && widget.title === 'Top Bar Style Settings');
    assert(menuSwitch && !menuSwitch.active, 'Top bar menu switch defaults to off');
    menuSwitch.active = true;
    assert(settings.get_boolean('top-bar-style-settings'), 'Switch enables top bar menu setting');
    settings.set_boolean('top-bar-style-settings', false);
    assert(!menuSwitch.active, 'External setting updates switch');
    settings.set_string('maximized-behavior', 'keep-gradient');
    assert(menuSwitch.is_sensitive(), 'Menu switch remains usable with trigger settings disabled');
});

const sections = [
    ['Reset main gradient?', 'gradients', {
        colors: new GLib.Variant('as', ['rgb(255,0,0)', 'rgb(0,0,255)']),
        'gradient-direction': new GLib.Variant('s', 'horizontal')
    }],
    ['Reset window interaction?', 'gradients', {
        'maximized-behavior': new GLib.Variant('s', 'keep-theme'),
        'maximized-colors': new GLib.Variant('as', ['rgb(0,128,0)', 'rgb(255,255,255)']),
        'maximized-gradient-direction': new GLib.Variant('s', 'vertical')
    }],
    ['Reset window interaction?', 'behavior', {
        'style-trigger': new GLib.Variant('s', 'maximized'),
        'proximity-distance': new GLib.Variant('i', 79)
    }],
    ['Reset transitions?', 'behavior', {
        'proximity-transition': new GLib.Variant('b', false),
        'overview-transition': new GLib.Variant('b', true)
    }]
];

for (const [title, pageName, changes] of sections) {
    test(`${pageName}: ${title} resets only the selected section`, t => {
        const { settings, schema } = createSettingsFixture(t);
        const sectionsWindow = trackWindow(t, new Adw.PreferencesWindow());
        const gradients = new Gradients(sectionsWindow, settings);
        const behavior = new Behavior(sectionsWindow, settings);
        sectionsWindow.add(gradients);
        sectionsWindow.add(behavior);
        sectionsWindow.present();
        const root = pageName === 'gradients' ? gradients : behavior;
        for (const [key, value] of Object.entries(changes))
            settings.set_value(key, value);
        const before = new Map(schema.list_keys().map(key => [key, settings.get_value(key)]));
        const button = findWidget(root, widget => widget instanceof Gtk.Button && widget.get_tooltip_text() === title);
        assert(button !== null, `Missing ${title}`);
        button.emit('clicked');
        let dialog = sectionsWindow.get_visible_dialog();
        dialog.emit('response', 'cancel');
        dialog.force_close();
        for (const [key, value] of before)
            assert(settings.get_value(key).equal(value), `Cancel changed ${key}`);
        button.emit('clicked');
        dialog = sectionsWindow.get_visible_dialog();
        dialog.emit('response', 'reset');
        dialog.force_close();
        for (const [key, value] of before) {
            const expected = key in changes ? settings.get_default_value(key) : value;
            assert(settings.get_value(key).equal(expected), `${title} incorrectly changed ${key}`);
        }
    });
}

run();
