import { panel } from 'resource:///org/gnome/shell/ui/main.js';

import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

const GRADIENT_CLASS = 'panel-gradient';
const MAXIMIZED_GRADIENT_CLASS = 'panel-maximized-gradient';

let transitionActor = null;

const allocateTransitionActor = () => {
    const box = new Clutter.ActorBox();
    box.x2 = panel.width;
    box.y2 = panel.height;
    transitionActor.allocate(box);
};

const generateCss = config => {
    const { gradientDirection, colors, maximizedGradientDirection, maximizedColors } = config;
    return `.${GRADIENT_CLASS} {
            background-color: transparent;
            background-gradient-direction: ${gradientDirection};
            background-gradient-start: ${colors.start};
            background-gradient-end: ${colors.end};
          }
          .${MAXIMIZED_GRADIENT_CLASS} {
            background-color: transparent;
            background-gradient-direction: ${maximizedGradientDirection};
            background-gradient-start: ${maximizedColors.start};
            background-gradient-end: ${maximizedColors.end};
          }`;
};

const getUserStylesheet = extensionPath =>
    Gio.File.new_for_path(`${extensionPath}/user-stylesheet.css`);

const saveUserCss = (file, stylesheet) => {
    const outStream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
    const outDataStream = Gio.DataOutputStream.new(outStream);
    outDataStream.put_string(stylesheet, null);
    outDataStream.close(null);
};

export const applyGradientStyle = (config, extensionPath) => {
    const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
    const userStylesheet = getUserStylesheet(extensionPath);

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

export const unloadGradientStylesheet = extensionPath => {
    const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
    theme.unload_stylesheet(getUserStylesheet(extensionPath));
};

export const setGradientTransition = progress => {
    if (!transitionActor) {
        transitionActor = new St.Widget({
            style_class: MAXIMIZED_GRADIENT_CLASS,
            reactive: false
        });
        panel.insert_child_at_index(transitionActor, 0);
        panel.connectObject(
            'notify::allocation',
            allocateTransitionActor,
            transitionActor
        );
        allocateTransitionActor();
    }

    transitionActor.opacity = Math.round(progress * 255);
};

export const removeGradientTransition = () => {
    transitionActor?.destroy();
    transitionActor = null;
};

export const toggleGradient = (enabled, useAlternateStyle = false) => {
    // Remove all styles first
    panel.remove_style_class_name(GRADIENT_CLASS);
    panel.remove_style_class_name(MAXIMIZED_GRADIENT_CLASS);

    if (enabled)
        panel.add_style_class_name(useAlternateStyle ? MAXIMIZED_GRADIENT_CLASS : GRADIENT_CLASS);
};
