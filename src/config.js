import Gio from 'gi://Gio';

import { normalizeColor } from './colors.js';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');

export const SETTINGS_GSCHEMA =
  'org.gnome.shell.extensions.org.pshow.gradienttopbar';

const SETTINGS_GSCHEMA_PATH = `/${SETTINGS_GSCHEMA.replaceAll('.', '/')}/`;

// Keep historical settings keys for compatibility with existing preferences.
export const WINDOW_BEHAVIOR_KEY = 'maximized-behavior';
export const STYLE_TRIGGER_KEY = 'style-trigger';
export const PROXIMITY_DISTANCE = 'proximity-distance';
export const PROXIMITY_TRANSITION = 'proximity-transition';
export const TOP_BAR_STYLE_SETTINGS = 'top-bar-style-settings';
export const GRADIENT_DIRECTION_KEY = 'gradient-direction';
export const ALTERNATE_GRADIENT_DIRECTION_KEY = 'maximized-gradient-direction';
export const COLORS = 'colors';
export const CONTENT_SHADOWS = 'content-shadows';
export const SHADOW_COLOR = 'shadow-color';
export const SHADOW_BLUR = 'shadow-blur';
export const SHADOW_OFFSET_X = 'shadow-offset-x';
export const SHADOW_OFFSET_Y = 'shadow-offset-y';
export const ALTERNATE_COLORS_KEY = 'maximized-colors';
export const OVERVIEW_BEHAVIOR_KEY = 'overview-behavior';
export const OVERVIEW_TRANSITION = 'overview-transition';
export const OVERVIEW_COLORS = 'overview-colors';
export const OVERVIEW_GRADIENT_DIRECTION = 'overview-gradient-direction';

/**
 * @param {Gio.Settings} settings
 * @param {string} colorsKey
 * @param {string} directionKey
 * @param {import('./gradient/appearance.js').GradientDefinition|null} fallback
 * @returns {import('./gradient/appearance.js').GradientDefinition}
 */
const readGradient = (settings, colorsKey, directionKey, fallback = null) => {
    let colors = settings.get_strv(colorsKey).map(normalizeColor);
    if (colors.length !== 2 || colors.includes(null)) {
        if (fallback)
            return fallback;
        colors = settings.settings_schema.get_key(colorsKey).get_default_value().deep_unpack().map(normalizeColor);
    }
    return {
        colors: { start: colors[0], end: colors[1] },
        direction: settings.get_string(directionKey)
    };
};

/**
 * Gets the complete configuration object from settings
 *
 * @param {Gio.Settings} settings - The settings object
 */
export const getConfig = settings => {
    const main = readGradient(settings, COLORS, GRADIENT_DIRECTION_KEY);

    return {
        windowBehavior: getWindowBehavior(settings),
        styleTrigger: getStyleTrigger(settings),
        proximityDistance: getProximityDistance(settings),
        proximityTransition: getProximityTransition(settings),
        contentShadows: settings.get_boolean(CONTENT_SHADOWS),
        shadowColor: getShadowColor(settings),
        shadowBlur: settings.get_int(SHADOW_BLUR),
        shadowOffsetX: settings.get_int(SHADOW_OFFSET_X),
        shadowOffsetY: settings.get_int(SHADOW_OFFSET_Y),
        gradients: {
            main,
            alternate: readGradient(settings, ALTERNATE_COLORS_KEY, ALTERNATE_GRADIENT_DIRECTION_KEY, main),
            overview: readGradient(settings, OVERVIEW_COLORS, OVERVIEW_GRADIENT_DIRECTION, main)
        },
        overviewBehavior: settings.get_string(OVERVIEW_BEHAVIOR_KEY),
        overviewTransition: settings.get_boolean(OVERVIEW_TRANSITION)
    };
};

/**
 * Gets the window interaction behavior setting
 *
 * @param {Gio.Settings} settings - The settings object
 * @returns {string} The window interaction behavior value
 */
export const getWindowBehavior = settings => {
    return settings.get_string(WINDOW_BEHAVIOR_KEY);
};

/**
 * Sets the window interaction behavior setting
 *
 * @param {Gio.Settings} settings - The settings object
 * @param {string} value - The window interaction behavior value to set
 */
export const setWindowBehavior = (settings, value) => {
    settings.set_string(WINDOW_BEHAVIOR_KEY, value);
};

export const getStyleTrigger = settings => settings.get_string(STYLE_TRIGGER_KEY);

export const setStyleTrigger = (settings, value) => {
    settings.set_string(STYLE_TRIGGER_KEY, value);
};

export const getProximityDistance = settings =>
    settings.get_int(PROXIMITY_DISTANCE);

export const setProximityDistance = (settings, value) => {
    settings.set_int(PROXIMITY_DISTANCE, value);
};

export const getProximityTransition = settings =>
    settings.get_boolean(PROXIMITY_TRANSITION);

export const setProximityTransition = (settings, value) => {
    settings.set_boolean(PROXIMITY_TRANSITION, value);
};


/**
 * Sets the gradient direction setting
 *
 * @param {Gio.Settings} settings - The settings object
 * @param {string} key - The gradient direction settings key
 * @param {string} value - The gradient direction value to set
 */
export const setGradientDirection = (settings, key, value) => {
    settings.set_string(key, value);
};

/**
 * Sets the colors for the gradient
 *
 * @param {Gio.Settings} settings - The settings object
 * @param {string} key - The gradient colors settings key
 * @param {{start: string, end: string}} colors - The start and end colors in RGBA format
 */
export const saveGradientColors = (settings, key, colors) => {
    settings.set_strv(key, [colors.start, colors.end]);
};

export const getTopBarStyleSettings = settings => settings.get_boolean(TOP_BAR_STYLE_SETTINGS);

export const getShadowColor = settings =>
    normalizeColor(settings.get_string(SHADOW_COLOR)) ??
    normalizeColor(settings.get_default_value(SHADOW_COLOR).deep_unpack());

export const getSettingRange = (settings, key) =>
    settings.settings_schema.get_key(key).get_range().deep_unpack()[1].deep_unpack();

export const getShadowOffsets = settings =>
    [settings.get_int(SHADOW_OFFSET_X), settings.get_int(SHADOW_OFFSET_Y)];

export const setShadowColor = (settings, color) => settings.set_string(SHADOW_COLOR, color);

export const setShadowOffsets = (settings, x, y) => {
    settings.set_int(SHADOW_OFFSET_X, x);
    settings.set_int(SHADOW_OFFSET_Y, y);
};

export const setOverviewBehavior = (settings, value) => settings.set_string(OVERVIEW_BEHAVIOR_KEY, value);

export const bindSetting = (settings, key, object, property, flags = Gio.SettingsBindFlags.DEFAULT) => {
    settings.bind(key, object, property, flags);
};

export const resetSettings = (settings, keys) => {
    keys.forEach(key => settings.reset(key));
};

export const attachSettingListener = (settings, key, listener) => settings.connect(`changed::${key}`, listener);

/**
 * Attaches listeners for the requested settings (all runtime settings by default).
 *
 * @param {Gio.Settings} settings - The settings object
 * @param {Function} listener - The callback function to call when settings change
 */
export const attachSettingsListeners = (settings, listener, keys = [
    GRADIENT_DIRECTION_KEY,
    WINDOW_BEHAVIOR_KEY,
    STYLE_TRIGGER_KEY,
    PROXIMITY_DISTANCE,
    PROXIMITY_TRANSITION,
    CONTENT_SHADOWS,
    SHADOW_COLOR,
    SHADOW_BLUR,
    SHADOW_OFFSET_X,
    SHADOW_OFFSET_Y,
    COLORS,
    ALTERNATE_COLORS_KEY,
    ALTERNATE_GRADIENT_DIRECTION_KEY,
    OVERVIEW_BEHAVIOR_KEY,
    OVERVIEW_TRANSITION,
    OVERVIEW_COLORS,
    OVERVIEW_GRADIENT_DIRECTION
]) => keys.map(key => attachSettingListener(settings, key, listener));

/**
 * Detaches listeners for all settings changes
 *
 * @param {Gio.Settings} settings - The settings object
 * @param {number[]} handlerIds - The signal handler IDs returned when attaching
 */
export const detachSettingsListeners = (settings, handlerIds) => {
    handlerIds.forEach(id => settings.disconnect(id));
};

/**
 * Exports all settings to a file
 *
 * @param {Gio.File} file - The file to export settings to
 */
export const exportSettingsToFile = async file => {
    const process = Gio.Subprocess.new(
        ['dconf', 'dump', SETTINGS_GSCHEMA_PATH],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    );
    const [stdout, stderr] = await process.communicate_utf8_async(null, null);

    if (!process.get_successful())
        throw new Error(stderr.trim() || 'Failed to export settings');

    const raw = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
    const out = Gio.BufferedOutputStream.new_sized(raw, 4096);
    out.write_all(new TextEncoder().encode(stdout), null);
    out.close(null);
};

/**
 * Loads settings from a file
 *
 * @param {Gio.File} settingsFile - The file to load settings from
 */
export const loadSettingsFromFile = async settingsFile => {
    const [contents] = await settingsFile.load_contents_async(null);
    const input = new TextDecoder('utf-8', { fatal: true }).decode(contents);
    const process = Gio.Subprocess.new(
        ['dconf', 'load', SETTINGS_GSCHEMA_PATH],
        Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    );
    const [, stderr] = await process.communicate_utf8_async(input, null);

    if (!process.get_successful())
        throw new Error(stderr.trim() || 'Failed to import settings');
};
