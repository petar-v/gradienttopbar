import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const SETTINGS_GSCHEMA =
  'org.gnome.shell.extensions.org.pshow.gradienttopbar';

const SETTINGS_GSCHEMA_PATH = `/${SETTINGS_GSCHEMA.replaceAll('.', '/')}/`;

export const getConfig = settings => {
    const isOpaqueOnMaximized = settings.get_boolean('opaque-on-maximized');
    const colors = settings.get_value('colors').deep_unpack();
    const gradientDirection = settings.get_string('gradient-direction');

    return {
        isOpaqueOnMaximized,
        gradientDirection,
        colors: {
            start: colors[0],
            end: colors[1]
        }
    };
};

export const saveColors = (settings, startRgba, endRgba) => {
    settings.set_strv('colors', [startRgba, endRgba]);
};

export const attachSettingsListeners = (settings, listener) => {
    settings.connect('changed::gradient-direction', listener);
    settings.connect('changed::opaque-on-maximized', listener);
    settings.connect('changed::colors', listener);
};

export const detachSettingsListeners = (settings, listener) => {
    settings.disconnect('changed::gradient-direction', listener);
    settings.disconnect('changed::opaque-on-maximized', listener);
    settings.disconnect('changed::colors', listener);
};

export const exportSettingsToFile = file => {
    const raw = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
    const out = Gio.BufferedOutputStream.new_sized(raw, 4096);

    const settings = GLib.spawn_command_line_sync(`dconf dump ${SETTINGS_GSCHEMA_PATH}`)[1];
    out.write_all(
        settings,
        null
    );
    out.close(null);
};

export const loadSettingsFromFile = settingsFile => {
    const [success_, pid_, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
        null,
        ['dconf', 'load', SETTINGS_GSCHEMA_PATH],
        null,
        GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
        null
    );

    const outputStream = new Gio.UnixOutputStream({
        fd: stdin,
        close_fd: true
    });
    GLib.close(stdout);
    GLib.close(stderr);

    outputStream.splice(
        settingsFile.read(null),
        Gio.OutputStreamSpliceFlags.CLOSE_SOURCE |
        Gio.OutputStreamSpliceFlags.CLOSE_TARGET,
        null
    );
};
