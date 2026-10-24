import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { DEFAULT_PROXIMITY_DISTANCE } from './constants.js';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

export const SETTINGS_GSCHEMA =
  'org.gnome.shell.extensions.org.pshow.gradienttopbar';

const SETTINGS_GSCHEMA_PATH = `/${SETTINGS_GSCHEMA.replaceAll('.', '/')}/`;

// Settings keys
export const MAXIMIZED_BEHAVIOR = 'maximized-behavior';
export const STYLE_TRIGGER = 'style-trigger';
export const PROXIMITY_DISTANCE = 'proximity-distance';
export const PROXIMITY_TRANSITION = 'proximity-transition';
export const TOP_BAR_STYLE_SETTINGS = 'top-bar-style-settings';
export const GRADIENT_DIRECTION = 'gradient-direction';
export const MAXIMIZED_GRADIENT_DIRECTION = 'maximized-gradient-direction';
export const COLORS = 'colors';
export const CONTENT_SHADOWS = 'content-shadows';
export const SHADOW_COLOR = 'shadow-color';
export const SHADOW_BLUR = 'shadow-blur';
export const SHADOW_OFFSET_X = 'shadow-offset-x';
export const SHADOW_OFFSET_Y = 'shadow-offset-y';
export const MAXIMIZED_COLORS = 'maximized-colors';
export const OVERVIEW_BEHAVIOR = 'overview-behavior';
export const OVERVIEW_TRANSITION = 'overview-transition';
export const OVERVIEW_COLORS = 'overview-colors';
export const OVERVIEW_GRADIENT_DIRECTION = 'overview-gradient-direction';

/**
 * Gets the complete configuration object from settings
 *
 * @param {Gio.Settings} settings - The settings object
 * @returns {Object} The complete configuration object
 */
export const getConfig = settings => {
    const maximizedBehavior = getMaximizedBehavior(settings);
    const styleTrigger = getStyleTrigger(settings);
    const proximityDistance = getProximityDistance(settings);
    const proximityTransition = getProximityTransition(settings);
    const contentShadows = settings.get_boolean(CONTENT_SHADOWS);
    const colors = settings.get_value(COLORS).deep_unpack();
    const gradientDirection = settings.get_string(GRADIENT_DIRECTION);
    const maximizedColors = settings.get_value(MAXIMIZED_COLORS).deep_unpack();
    const maximizedGradientDirection = settings.get_string(MAXIMIZED_GRADIENT_DIRECTION);
    const overviewColors = settings.get_strv(OVERVIEW_COLORS);
    const validOverviewPair = overviewColors.length === 2;

    return {
        maximizedBehavior,
        styleTrigger,
        proximityDistance,
        proximityTransition,
        contentShadows,
        shadowColor: getShadowColor(settings),
        shadowBlur: settings.get_int(SHADOW_BLUR),
        shadowOffsetX: settings.get_int(SHADOW_OFFSET_X),
        shadowOffsetY: settings.get_int(SHADOW_OFFSET_Y),
        gradientDirection,
        colors: {
            start: colors[0],
            end: colors[1]
        },
        maximizedGradientDirection,
        overviewBehavior: settings.get_string(OVERVIEW_BEHAVIOR),
        overviewTransition: settings.get_boolean(OVERVIEW_TRANSITION),
        overviewGradientDirection: validOverviewPair
            ? settings.get_string(OVERVIEW_GRADIENT_DIRECTION) : gradientDirection,
        overviewColors: {
            start: validOverviewPair ? overviewColors[0] : colors[0],
            end: validOverviewPair ? overviewColors[1] : colors[1]
        },
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

export const getStyleTrigger = settings => settings.get_string(STYLE_TRIGGER);

export const setStyleTrigger = (settings, value) => {
    settings.set_string(STYLE_TRIGGER, value);
};

export const getProximityDistance = settings =>
    settings?.get_int(PROXIMITY_DISTANCE) ?? DEFAULT_PROXIMITY_DISTANCE;

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

export const getShadowColor = settings => settings.get_string(SHADOW_COLOR);

export const getShadowOffsets = settings =>
    [settings.get_int(SHADOW_OFFSET_X), settings.get_int(SHADOW_OFFSET_Y)];

export const setShadowColor = (settings, color) => settings.set_string(SHADOW_COLOR, color);

export const setShadowOffsets = (settings, x, y) => {
    settings.set_int(SHADOW_OFFSET_X, x);
    settings.set_int(SHADOW_OFFSET_Y, y);
};

export const setOverviewBehavior = (settings, value) => settings.set_string(OVERVIEW_BEHAVIOR, value);

export const bindSetting = (settings, key, object, property, flags = Gio.SettingsBindFlags.DEFAULT) => {
    settings.bind(key, object, property, flags);
};

export const resetSettings = (settings, keys) => {
    keys.forEach(key => settings.reset(key));
};

export const attachSettingListener = (settings, key, listener) => settings.connect(`changed::${key}`, listener);

/**
 * Attaches listeners for all settings changes
 *
 * @param {Gio.Settings} settings - The settings object
 * @param {Function} listener - The callback function to call when settings change
 */
export const attachSettingsListeners = (settings, listener) => {
    return [
        GRADIENT_DIRECTION,
        MAXIMIZED_BEHAVIOR,
        STYLE_TRIGGER,
        PROXIMITY_DISTANCE,
        PROXIMITY_TRANSITION,
        CONTENT_SHADOWS,
        SHADOW_COLOR,
        SHADOW_BLUR,
        SHADOW_OFFSET_X,
        SHADOW_OFFSET_Y,
        COLORS,
        MAXIMIZED_COLORS,
        MAXIMIZED_GRADIENT_DIRECTION,
        OVERVIEW_BEHAVIOR,
        OVERVIEW_TRANSITION,
        OVERVIEW_COLORS,
        OVERVIEW_GRADIENT_DIRECTION
    ].map(key => attachSettingListener(settings, key, listener));
};

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
