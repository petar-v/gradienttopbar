import St from 'gi://St';
import Gio from 'gi://Gio';
import { TRANSITION_DURATION_MS, OVERVIEW_ENTER_DURATION_MS, OVERVIEW_EXIT_DURATION_MS } from './transitionTimings.js';

/** @type {Record<import('./appearance.js').AppearanceName, string>} */
export const GRADIENT_CLASSES = {
    main: 'panel-gradient',
    alternate: 'panel-maximized-gradient',
    overview: 'panel-overview-gradient'
};
export const BLENDING_CLASS = 'panel-background-blending';
export const RESTORING_CLASS = 'panel-background-restoring';


// TODO: use the util functions to generate the css or maybe we keep this readable idk
/**
 * @param {string} className
 * @param {import('./appearance.js').GradientDefinition} gradient
 */
// eslint-disable-next-line no-unused-vars -- Retained CSS generation helper.
const gradientRule = (className, { colors, direction }) => `
          .${className} {
            background-color: transparent;
            background-gradient-direction: ${direction};
            background-gradient-start: ${colors.start};
            background-gradient-end: ${colors.end};
          }`;

// eslint-disable-next-line no-unused-vars -- Retained CSS generation helper.
const panelSelectors = (...descendants) => descendants.flatMap(descendant =>
    Object.values(GRADIENT_CLASSES).map(className => `#panel.${className} ${descendant}`)
).join(',\n');

const generateCss = config => {
    const { main, alternate, overview } = config.gradients;
    const shadow = `${config.shadowOffsetX}px ${config.shadowOffsetY}px ${config.shadowBlur}px ${config.shadowColor}`;
    const contentShadows = config.contentShadows ? `
          #panel.${GRADIENT_CLASSES.main} .panel-button,
          #panel.${GRADIENT_CLASSES.alternate} .panel-button,
          #panel.${GRADIENT_CLASSES.overview} .panel-button,
          #panel.${GRADIENT_CLASSES.main} .panel-button StLabel,
          #panel.${GRADIENT_CLASSES.alternate} .panel-button StLabel,
          #panel.${GRADIENT_CLASSES.overview} .panel-button StLabel {
            text-shadow: ${shadow};
          }
          #panel.${GRADIENT_CLASSES.main} .panel-button StIcon,
          #panel.${GRADIENT_CLASSES.alternate} .panel-button StIcon,
          #panel.${GRADIENT_CLASSES.overview} .panel-button StIcon {
            icon-shadow: ${shadow};
          }
          #panel.${GRADIENT_CLASSES.main} .workspace-dot,
          #panel.${GRADIENT_CLASSES.alternate} .workspace-dot,
          #panel.${GRADIENT_CLASSES.overview} .workspace-dot {
            box-shadow: ${shadow};
          }` : '';
    return `#panel {
            transition-duration: ${config.overviewTransition ? TRANSITION_DURATION_MS : OVERVIEW_EXIT_DURATION_MS}ms;
          }
          #panel:overview {
            transition-duration: ${config.overviewTransition ? TRANSITION_DURATION_MS : OVERVIEW_ENTER_DURATION_MS}ms;
          }
          #panel.${BLENDING_CLASS} {
            background-color: transparent;
            background-gradient-direction: none;
            background-image: none;
            border-color: transparent;
            box-shadow: none;
            transition-duration: 0ms;
          }
          #panel.${RESTORING_CLASS} {
            transition-duration: 0ms;
          }
          .${GRADIENT_CLASSES.main} {
            background-color: transparent;
            background-gradient-direction: ${main.direction};
            background-gradient-start: ${main.colors.start};
            background-gradient-end: ${main.colors.end};
          }
          .${GRADIENT_CLASSES.alternate} {
            background-color: transparent;
            background-gradient-direction: ${alternate.direction};
            background-gradient-start: ${alternate.colors.start};
            background-gradient-end: ${alternate.colors.end};
          }
          .${GRADIENT_CLASSES.overview} {
            background-color: transparent;
            background-gradient-direction: ${overview.direction};
            background-gradient-start: ${overview.colors.start};
            background-gradient-end: ${overview.colors.end};
          }${contentShadows}`;
};

/*
 * Locate the generated stylesheet so loading, replacement and unloading use the same file.
 */
// FIXME: this is a hack to get the path to the user-stylesheet.css file
const getUserStylesheet = () => Gio.File.new_for_uri(import.meta.url)
    .get_parent()
    .get_parent()
    .get_child('user-stylesheet.css');

/*
 * Replace the generated CSS file so the theme can load the latest settings.
 */
const writeStylesheetCss = (file, stylesheet) => {
    const outStream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
    const outDataStream = Gio.DataOutputStream.new(outStream);
    outDataStream.put_string(stylesheet, null);
    outDataStream.close(null);
};

/*
 * Regenerate and reload the stylesheet after settings change, avoiding inline panel styles that clash with other extensions.
 */
let loadedStylesheet = null;

export const applyGradientStylesheet = config => {
    const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
    const css = generateCss(config);
    if (loadedStylesheet?.theme === theme && loadedStylesheet.css === css)
        return false;
    const userStylesheet = getUserStylesheet();

    // generate a stylesheet based on the user preferences. note: this is somewhat of a hack.
    // I couldn't figure out how to dynamically alter classes. I could have used Main.panel.set_style
    // but I found this interferes with other extensions and becomes a mess to maintain.
    // unload the previous version
    // save the current version
    writeStylesheetCss(userStylesheet, css);
    loadedStylesheet = null;
    theme.unload_stylesheet(userStylesheet);
    // load again
    theme.load_stylesheet(userStylesheet);
    loadedStylesheet = { theme, css };
    return true;
};

/*
 * Remove the generated stylesheet from the theme when the extension is disabled.
 */
export const unloadGradientStylesheet = () => {
    loadedStylesheet = null;
    const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
    theme.unload_stylesheet(getUserStylesheet());
};

