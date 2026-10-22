// Run with GSETTINGS_BACKEND=memory and GNOME Shell typelib/library paths.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

imports.gi.versions.Gtk = '4.0';
const { default: Gtk } = await import('gi://Gtk');
Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
// Standalone test has no extension manager; only translation lookup is stubbed.
const { ExtensionPreferences } = await import('resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js');
ExtensionPreferences.lookupByURL = () => ({ gettext: text => text });
const { createOffsetPicker } = await import('../src/settings/components/offsetPicker.js');
const { getConfig, attachSettingsListeners, detachSettingsListeners, SETTINGS_GSCHEMA } = await import('../src/config.js');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(GLib.getenv('GSETTINGS_BACKEND') === 'memory', 'Use GSETTINGS_BACKEND=memory to protect saved preferences');
const directory = GLib.dir_make_tmp('gradient-shadow-test-XXXXXX');
const schemaName = `${SETTINGS_GSCHEMA}.gschema.xml`;
const source = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child(`src/schemas/${schemaName}`);
source.copy(Gio.File.new_for_path(`${directory}/${schemaName}`), Gio.FileCopyFlags.NONE, null, null);
GLib.spawn_sync(null, ['glib-compile-schemas', '--strict', directory], null, GLib.SpawnFlags.SEARCH_PATH, null);
try {
    const schema = Gio.SettingsSchemaSource.new_from_directory(directory, Gio.SettingsSchemaSource.get_default(), false).lookup(SETTINGS_GSCHEMA, false);
    const settings = new Gio.Settings({ settings_schema: schema });
    let changes = 0;
    const handlers = attachSettingsListeners(settings, () => changes++);
    assert(getConfig(settings).shadowBlur === 3, 'Default blur');
    assert(getConfig(settings).shadowOffsetY === 1, 'Default Y');
    Gtk.init();
    const picker = createOffsetPicker(settings);
    const controls = picker.widget.get_last_child();
    const x = controls.get_first_child().get_last_child();
    const y = controls.get_first_child().get_next_sibling().get_last_child();
    x.set_value(-6);
    y.set_value(6);
    assert(getConfig(settings).shadowOffsetX === -6 && getConfig(settings).shadowOffsetY === 6, 'Picker persists offsets');
    settings.set_int('shadow-offset-x', 3);
    assert(x.get_value() === 3, 'External settings update picker');
    settings.set_string('shadow-color', 'rgba(255,0,0,0.25)');
    settings.set_int('shadow-blur', 12);
    picker.refresh();
    assert(getConfig(settings).shadowColor === 'rgba(255,0,0,0.25)', 'Colour preserves alpha');
    assert(getConfig(settings).shadowBlur === 12 && changes >= 5, 'Shadow settings notify runtime');
    controls.get_first_child().get_next_sibling().get_next_sibling().emit('clicked');
    assert(x.get_value() === 0 && y.get_value() === 0, 'Centre persists zero offsets');
    const window = new Gtk.Window({ child: picker.widget });
    window.present();
    const loop = new GLib.MainLoop(null, false);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => { window.destroy(); loop.quit(); return GLib.SOURCE_REMOVE; });
    loop.run();
    const { default: Adw } = await import('gi://Adw');
    const { default: Appearance } = await import('../src/settings/appearancePage.js');
    const preferences = new Adw.PreferencesWindow();
    preferences.add(new Appearance(preferences, settings));
    preferences.present();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => { preferences.close(); loop.quit(); return GLib.SOURCE_REMOVE; });
    loop.run();
    detachSettingsListeners(settings, handlers);
    print('Shadow settings, bindings, preview drawing and reset passed');
} finally {
    for (const name of [schemaName, 'gschemas.compiled'])
        Gio.File.new_for_path(`${directory}/${name}`).delete(null);
    Gio.File.new_for_path(directory).delete(null);
}
