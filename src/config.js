export const SETTINGS_GSCHEMA = 'org.gnome.shell.extensions.org.pshow.gradienttopbar';

export function getConfig(settings) {
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
}

export function saveColors(settings, startRgba, endRgba) {
    settings.set_strv('colors', [startRgba, endRgba]);
}

export function attachSettingsListeners(settings, listener) {
    settings.connect('changed::gradient-direction', listener);
    settings.connect('changed::opaque-on-maximized', listener);
    settings.connect('changed::colors', listener);
}

export function detachSettingsListeners(settings, listener) {
    settings.disconnect('changed::gradient-direction', listener);
    settings.disconnect('changed::opaque-on-maximized', listener);
    settings.disconnect('changed::colors', listener);
}
