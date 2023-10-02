import { panel } from 'resource:///org/gnome/shell/ui/main.js';

import St from 'gi://St';
import Gio from 'gi://Gio';

const GRADIENT_CLASS = 'panel-gradient';
const CORNER_GRADIENT_CLASS = 'corner-gradient';

const generateCss = config => {
    const { gradientDirection, colors } = config;
    return `.${GRADIENT_CLASS} {
            background-color: transparent;
            background-gradient-direction: ${gradientDirection};
            background-gradient-start: ${colors.start};
            background-gradient-end: ${colors.end};
          }`;
};

const saveUserCss = (file, stylesheet) => {
    const outStream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
    const outDataStream = Gio.DataOutputStream.new(outStream);
    outDataStream.put_string(stylesheet, null);
    outDataStream.close(null);
};

export const applyGradientStyle = (config, extensionPath) => {
    const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
    const userStylesheet = Gio.File.new_for_path(`${extensionPath}/user-stylesheet.css`);

    // generate a stylesheet based on the user preferences. note: this is somewhat of a hack.
    // I couldn't figure out how to dynamically alter classes. I could have used Main.panel.set_style
    // but I found this interferes with other extensions and becomes a mess to maintain.
    // unload the previous version
    theme.unload_stylesheet(userStylesheet);
    // save the current version
    saveUserCss(userStylesheet, generateCss(config));
    // load again
    theme.load_stylesheet(userStylesheet);
};

export const toggleGradient = enabled => {
    const actionCall = enabled
        ? 'add_style_class_name'
        : 'remove_style_class_name';
    panel[actionCall](GRADIENT_CLASS);
    [panel._leftCorner, panel._rightCorner].forEach(
        corner => corner && corner[actionCall](CORNER_GRADIENT_CLASS)
    );
};
