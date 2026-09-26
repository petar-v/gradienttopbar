import { panel } from 'resource:///org/gnome/shell/ui/main.js';

import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

const GRADIENT_CLASS = 'panel-gradient';
const MAXIMIZED_GRADIENT_CLASS = 'panel-maximized-gradient';
const TRANSITION_DURATION_MS = 200;

let transitionActor = null;
let appliedGradientClass = null;

const allocateTransitionActor = () => {
    const box = new Clutter.ActorBox();
    box.x2 = panel.width;
    box.y2 = panel.height;
    transitionActor.allocate(box);
};

const getTransitionActor = styleClass => {
    if (!transitionActor) {
        transitionActor = new St.Widget({
            style_class: styleClass,
            opacity: 0,
            reactive: false
        });
        panel.insert_child_at_index(transitionActor, 0);
        panel.connectObject(
            'notify::allocation',
            allocateTransitionActor,
            transitionActor
        );
        allocateTransitionActor();
    } else {
        transitionActor.set_style_class_name(styleClass);
    }

    return transitionActor;
};

const setTransitionProgress = (styleClass, progress) => {
    const actor = getTransitionActor(styleClass);
    actor.remove_transition('opacity');
    actor.opacity = Math.round(progress * 255);
};

const generateCss = config => {
    const { gradientDirection, colors, maximizedGradientDirection, maximizedColors } = config;
    return `#panel {
            transition-duration: ${TRANSITION_DURATION_MS}ms;
          }
          .${GRADIENT_CLASS} {
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
    if (!transitionActor && progress === 0)
        return;

    getTransitionActor(MAXIMIZED_GRADIENT_CLASS).ease({
        opacity: Math.round(progress * 255),
        duration: TRANSITION_DURATION_MS,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD
    });
};

export const scrubAlternateGradient = progress => {
    setTransitionProgress(MAXIMIZED_GRADIENT_CLASS, progress);
};

export const scrubOriginalTheme = progress => {
    setTransitionProgress(GRADIENT_CLASS, 1 - progress);
};

export const finishOriginalThemeTransition = showGradient => {
    if (!transitionActor || !showGradient) {
        removeGradientTransition();
        return;
    }

    const actor = transitionActor;
    actor.ease({
        opacity: 0,
        duration: TRANSITION_DURATION_MS,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: () => {
            if (transitionActor === actor)
                removeGradientTransition();
        }
    });
};

export const removeGradientTransition = () => {
    transitionActor?.destroy();
    transitionActor = null;
};

export const toggleGradient = (enabled, useAlternateStyle = false) => {
    let gradientClass = null;
    if (enabled)
        gradientClass = useAlternateStyle ? MAXIMIZED_GRADIENT_CLASS : GRADIENT_CLASS;

    if (gradientClass === appliedGradientClass)
        return;

    if (appliedGradientClass)
        panel.remove_style_class_name(appliedGradientClass);

    if (gradientClass)
        panel.add_style_class_name(gradientClass);

    appliedGradientClass = gradientClass;
};
