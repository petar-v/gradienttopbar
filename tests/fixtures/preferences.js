import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import GdkPixbuf from 'gi://GdkPixbuf';
import Cairo from 'cairo';
import { SETTINGS_GSCHEMA } from '../../src/config.js';
import { assert } from './gjs.js';

export const initializePreferences = async () => {
    assert(GLib.getenv('GSETTINGS_BACKEND') === 'memory', 'Use the memory backend to protect saved preferences');
    Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
    const { ExtensionPreferences } = await import('resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js');
    ExtensionPreferences.lookupByURL = () => ({ gettext: text => text });
    Gtk.init();
};

export const createSettingsFixture = t => {
    assert(GLib.getenv('GSETTINGS_BACKEND') === 'memory', 'Use GSETTINGS_BACKEND=memory to protect saved preferences');
    const directory = GLib.dir_make_tmp('gradient-settings-test-XXXXXX');
    const schemaName = `${SETTINGS_GSCHEMA}.gschema.xml`;
    t.after(() => {
        for (const name of [schemaName, 'gschemas.compiled']) {
            const file = Gio.File.new_for_path(`${directory}/${name}`);
            if (file.query_exists(null))
                file.delete(null);
        }
        Gio.File.new_for_path(directory).delete(null);
    });
    Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_parent()
        .get_child(`src/schemas/${schemaName}`)
        .copy(Gio.File.new_for_path(`${directory}/${schemaName}`), Gio.FileCopyFlags.NONE, null, null);
    const [, , stderr, status] = GLib.spawn_sync(null, ['glib-compile-schemas', '--strict', directory], null, GLib.SpawnFlags.SEARCH_PATH, null);
    assert(status === 0, `Schema compilation failed: ${new TextDecoder().decode(stderr)}`);
    const schema = Gio.SettingsSchemaSource.new_from_directory(directory, Gio.SettingsSchemaSource.get_default(), false).lookup(SETTINGS_GSCHEMA, false);
    const settings = new Gio.Settings({ settings_schema: schema });
    // A fixed schema path shares the memory backend, so reset it between sequential cases.
    schema.list_keys().forEach(key => settings.reset(key));
    t.after(() => schema.list_keys().forEach(key => settings.reset(key)));
    return { settings, schema };
};

export const trackWindow = (t, window) => {
    let closed = false;
    window.connect('close-request', () => {
        closed = true;
        return false;
    });
    t.after(() => {
        if (!closed) {
            window.close();
            if (!closed)
                window.emit('close-request');
        }
    });
    return window;
};

export const patch = (t, object, key, value) => {
    const previous = object[key];
    t.after(() => { object[key] = previous; });
    object[key] = value;
};

export const findWidget = (widget, predicate) => {
    if (predicate(widget))
        return widget;
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) {
        const result = findWidget(child, predicate);
        if (result)
            return result;
    }
    return null;
};

export const captureDraw = create => {
    let draw;
    const original = Gtk.DrawingArea.prototype.set_draw_func;
    Gtk.DrawingArea.prototype.set_draw_func = function (callback) {
        draw = callback;
        original.call(this, callback);
    };
    try {
        return { value: create(), get draw() { return draw; } };
    } finally {
        Gtk.DrawingArea.prototype.set_draw_func = original;
    }
};

export const createPixelReader = (t, draw, width, height) => {
    const directory = GLib.dir_make_tmp('gradient-pixels-test-XXXXXX');
    const filename = `${directory}/preview.png`;
    t.after(() => {
        if (GLib.file_test(filename, GLib.FileTest.EXISTS))
            GLib.unlink(filename);
        GLib.rmdir(directory);
    });
    return (x, y) => {
        const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
        draw(null, new Cairo.Context(surface), width, height);
        surface.writeToPNG(filename);
        const image = GdkPixbuf.Pixbuf.new_from_file(filename);
        const offset = y * image.rowstride + x * image.n_channels;
        return image.get_pixels().slice(offset, offset + image.n_channels);
    };
};

export const waitUntil = (predicate, timeoutMs = 1000) => {
    const loop = new GLib.MainLoop(null, false);
    const deadline = GLib.get_monotonic_time() + timeoutMs * 1000;
    let error;
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
        try {
            if (!predicate() && GLib.get_monotonic_time() < deadline)
                return GLib.SOURCE_CONTINUE;
        } catch (caught) {
            error = caught;
        }
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
    loop.run();
    if (error)
        throw error;
};
