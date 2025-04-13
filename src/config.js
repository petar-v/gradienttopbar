import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const SETTINGS_GSCHEMA =
  'org.gnome.shell.extensions.org.pshow.gradienttopbar';

const SETTINGS_GSCHEMA_PATH = `/${SETTINGS_GSCHEMA.replaceAll('.', '/')}/`;

// Settings keys
export const MAXIMIZED_BEHAVIOR = 'maximized-behavior';
export const GRADIENT_DIRECTION = 'gradient-direction';
export const MAXIMIZED_GRADIENT_DIRECTION = 'maximized-gradient-direction';
export const COLORS = 'colors';
export const MAXIMIZED_COLORS = 'maximized-colors';

/**
 * Gets the complete configuration object from settings
 *
 * @param {Gio.Settings} settings - The settings object
 * @returns {Object} The complete configuration object
 */
export const getConfig = settings => {
    const maximizedBehavior = settings.get_string(MAXIMIZED_BEHAVIOR);
    const colors = settings.get_value(COLORS).deep_unpack();
    const gradientDirection = settings.get_string(GRADIENT_DIRECTION);
    const maximizedColors = settings.get_value(MAXIMIZED_COLORS).deep_unpack();
    const maximizedGradientDirection = settings.get_string(MAXIMIZED_GRADIENT_DIRECTION);

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
        }
    };
};

/**
 * Gets the maximized behavior setting
 *
 * @param {Gio.Settings} settings - The settings object
 * @returns {string} The maximized behavior value
 */
export const getMaximizedBehavior = settings => {
    return settings.get_string(MAXIMIZED_BEHAVIOR);
};

/**
 * Sets the maximized behavior setting
 *
 * @param {Gio.Settings} settings - The settings object
 * @param {string} value - The maximized behavior value to set
 */
export const setMaximizedBehavior = (settings, value) => {
    settings.set_string(MAXIMIZED_BEHAVIOR, value);
};

/**
 * Gets the gradient direction setting
 *
 * @param {Gio.Settings} settings - The settings object
 * @returns {string} The gradient direction value
 */
export const getGradientDirection = settings => {
    return settings.get_string(GRADIENT_DIRECTION);
};

/**
 * Sets the gradient direction setting
 *
 * @param {Gio.Settings} settings - The settings object
 * @param {string} value - The gradient direction value to set
 */
export const setGradientDirection = (settings, value) => {
    settings.set_string(GRADIENT_DIRECTION, value);
};

/**
 * Gets the maximized gradient direction setting
 *
 * @param {Gio.Settings} settings - The settings object
 * @returns {string} The maximized gradient direction value
 */
export const getMaximizedGradientDirection = settings => {
    return settings.get_string(MAXIMIZED_GRADIENT_DIRECTION);
};

/**
 * Sets the maximized gradient direction setting
 *
 * @param {Gio.Settings} settings - The settings object
 * @param {string} value - The maximized gradient direction value to set
 */
export const setMaximizedGradientDirection = (settings, value) => {
    settings.set_string(MAXIMIZED_GRADIENT_DIRECTION, value);
};

/**
 * Gets the colors setting
 *
 * @param {Gio.Settings} settings - The settings object
 * @returns {Array} Array containing start and end color values
 */
export const getColors = settings => {
    return settings.get_value(COLORS).deep_unpack();
};

/**
 * Sets the colors for the gradient
 *
 * @param {Gio.Settings} settings - The settings object
 * @param {string} startRgba - The start color in RGBA format
 * @param {string} endRgba - The end color in RGBA format
 */
export const saveColors = (settings, startRgba, endRgba) => {
    settings.set_strv(COLORS, [startRgba, endRgba]);
};

/**
 * Gets the maximized colors setting
 *
 * @param {Gio.Settings} settings - The settings object
 * @returns {Array} Array containing start and end maximized color values
 */
export const getMaximizedColors = settings => {
    return settings.get_value(MAXIMIZED_COLORS).deep_unpack();
};

/**
 * Sets the colors for the maximized gradient
 *
 * @param {Gio.Settings} settings - The settings object
 * @param {string} startRgba - The start color in RGBA format
 * @param {string} endRgba - The end color in RGBA format
 */
export const saveMaximizedColors = (settings, startRgba, endRgba) => {
    settings.set_strv(MAXIMIZED_COLORS, [startRgba, endRgba]);
};

/**
 * Attaches listeners for all settings changes
 *
 * @param {Gio.Settings} settings - The settings object
 * @param {Function} listener - The callback function to call when settings change
 */
export const attachSettingsListeners = (settings, listener) => {
    settings.connect(`changed::${GRADIENT_DIRECTION}`, listener);
    settings.connect(`changed::${MAXIMIZED_BEHAVIOR}`, listener);
    settings.connect(`changed::${COLORS}`, listener);
    settings.connect(`changed::${MAXIMIZED_COLORS}`, listener);
    settings.connect(`changed::${MAXIMIZED_GRADIENT_DIRECTION}`, listener);
};

/**
 * Detaches listeners for all settings changes
 *
 * @param {Gio.Settings} settings - The settings object
 * @param {Function} listener - The callback function that was attached
 */
export const detachSettingsListeners = (settings, listener) => {
    settings.disconnect(`changed::${GRADIENT_DIRECTION}`, listener);
    settings.disconnect(`changed::${MAXIMIZED_BEHAVIOR}`, listener);
    settings.disconnect(`changed::${COLORS}`, listener);
    settings.disconnect(`changed::${MAXIMIZED_COLORS}`, listener);
    settings.disconnect(`changed::${MAXIMIZED_GRADIENT_DIRECTION}`, listener);
};

/**
 * Exports all settings to a file
 *
 * @param {Gio.File} file - The file to export settings to
 */
export const exportSettingsToFile = file => {
    const raw = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
    const out = Gio.BufferedOutputStream.new_sized(raw, 4096);

    const settings = GLib.spawn_command_line_sync(
        `dconf dump ${SETTINGS_GSCHEMA_PATH}`
    )[1];
    out.write_all(settings, null);
    out.close(null);
};

/**
 * Loads settings from a file
 *
 * @param {Gio.File} settingsFile - The file to load settings from
 */
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
