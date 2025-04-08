import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const SETTINGS_GSCHEMA =
  'org.gnome.shell.extensions.org.pshow.gradienttopbar';

const SETTINGS_GSCHEMA_PATH = `/${SETTINGS_GSCHEMA.replaceAll('.', '/')}/`;

export const getConfig = settings => {
    const maximizedBehavior = settings.get_string('maximized-behavior');
    const colors = settings.get_value('colors').deep_unpack();
    const gradientDirection = settings.get_string('gradient-direction');
    const maximizedColors = settings.get_value('maximized-colors').deep_unpack();
    const maximizedGradientDirection = settings.get_string('maximized-gradient-direction');
    const cornerRadius = settings.get_int('corner-radius');
    const maximizedCornerRadius = settings.get_int('maximized-corner-radius');

    return {
        maximizedBehavior,
        gradientDirection,
        colors: {
            start: colors[0],
            end: colors[1]
        },
        maximizedGradientDirection,
        maximizedColors: {
            start: maximizedColors[0],
            end: maximizedColors[1]
        },
        cornerRadius,
        maximizedCornerRadius
    };
};

export const saveColors = (settings, startRgba, endRgba) => {
    settings.set_strv('colors', [startRgba, endRgba]);
};

export const saveMaximizedColors = (settings, startRgba, endRgba) => {
    settings.set_strv('maximized-colors', [startRgba, endRgba]);
};

export const saveCornerRadius = (settings, radius) => {
    settings.set_int('corner-radius', radius);
};

export const saveMaximizedCornerRadius = (settings, radius) => {
    settings.set_int('maximized-corner-radius', radius);
};

export const attachSettingsListeners = (settings, listener) => {
    settings.connect('changed::gradient-direction', listener);
    settings.connect('changed::maximized-behavior', listener);
    settings.connect('changed::colors', listener);
    settings.connect('changed::maximized-colors', listener);
    settings.connect('changed::maximized-gradient-direction', listener);
    settings.connect('changed::corner-radius', listener);
    settings.connect('changed::maximized-corner-radius', listener);
};

export const detachSettingsListeners = (settings, listener) => {
    settings.disconnect('changed::gradient-direction', listener);
    settings.disconnect('changed::maximized-behavior', listener);
    settings.disconnect('changed::colors', listener);
    settings.disconnect('changed::maximized-colors', listener);
    settings.disconnect('changed::maximized-gradient-direction', listener);
    settings.disconnect('changed::corner-radius', listener);
    settings.disconnect('changed::maximized-corner-radius', listener);
};

export const exportSettingsToFile = file => {
    const raw = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
    const out = Gio.BufferedOutputStream.new_sized(raw, 4096);

    const settings = GLib.spawn_command_line_sync(
        `dconf dump ${SETTINGS_GSCHEMA_PATH}`
    )[1];
    out.write_all(settings, null);
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
