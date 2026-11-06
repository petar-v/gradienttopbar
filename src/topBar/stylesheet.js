import St from 'gi://St';
import Gio from 'gi://Gio';
import { APPEARANCE_STATE, getAppearance, isShellOverviewStyleSupported } from './appearance.js';
import { OVERVIEW_ENTER_DURATION_MS, OVERVIEW_EXIT_DURATION_MS, WINDOW_ENTER_DURATION_MS, WINDOW_EXIT_DURATION_MS, WORKSPACE_SWITCH_DURATION_MS } from './transitionTimings.js';

/** @type {Record<import('./appearance.js').AppearanceName, string>} */
export const GRADIENT_CLASSES = {
    main: 'panel-gradient',
    alternate: 'panel-maximized-gradient',
    overview: 'panel-overview-gradient'
};
export const CSS_OVERVIEW_CLASS = 'panel-css-overview';
export const BLENDING_CLASS = 'panel-background-blending';
export const RESTORING_CLASS = 'panel-background-restoring';
export const NATIVE_DURATION_CLASSES = Object.fromEntries([
    0, WINDOW_ENTER_DURATION_MS, WINDOW_EXIT_DURATION_MS, WORKSPACE_SWITCH_DURATION_MS,
    OVERVIEW_ENTER_DURATION_MS, OVERVIEW_EXIT_DURATION_MS
].map(duration => [duration, `panel-native-duration-${duration}`]));

/**
 * @param {string} selector
 * @param {import('./appearance.js').GradientDefinition} gradient
 */
const gradientRule = (selector, { colors, direction }) => `
          ${selector} {
            background-color: transparent;
            background-gradient-direction: ${direction};
            background-gradient-start: ${colors.start};
            background-gradient-end: ${colors.end};
          }`;

const panelSelectors = (selectors, ...descendants) => descendants.flatMap(descendant =>
    selectors.map(selector => `${selector} ${descendant}`)
).join(',\n');

const generateCss = config => {
    const { main, alternate, overview } = config.gradients;
    const isShellOverviewSupported = isShellOverviewStyleSupported(config);
    const overviewSelector = `#panel.${CSS_OVERVIEW_CLASS}:overview`;
    const shadowSelectors = Object.values(GRADIENT_CLASSES).map(name => `#panel.${name}`);
    if (isShellOverviewSupported)
        shadowSelectors.push(overviewSelector);
    const shellRules = isShellOverviewSupported ? `
          #panel.${CSS_OVERVIEW_CLASS} {
            transition-duration: ${OVERVIEW_EXIT_DURATION_MS}ms;
          }
          ${overviewSelector} {
            transition-duration: ${OVERVIEW_ENTER_DURATION_MS}ms;
          }${gradientRule(overviewSelector, getAppearance(config, APPEARANCE_STATE.OVERVIEW))}` : '';
    const shadow = `${config.shadowOffsetX}px ${config.shadowOffsetY}px ${config.shadowBlur}px ${config.shadowColor}`;
    const contentShadows = config.contentShadows ? `
          ${panelSelectors(shadowSelectors, '.panel-button', '.panel-button StLabel')} {
            text-shadow: ${shadow};
          }
          ${panelSelectors(shadowSelectors, '.panel-button StIcon')} {
            icon-shadow: ${shadow};
          }
          ${panelSelectors(shadowSelectors, '.workspace-dot')} {
            box-shadow: ${shadow};
          }` : '';
    return `#panel {
            transition-duration: ${OVERVIEW_EXIT_DURATION_MS}ms;
          }
          #panel:overview {
            transition-duration: ${OVERVIEW_ENTER_DURATION_MS}ms;
          }
          ${Object.entries(NATIVE_DURATION_CLASSES).map(([duration, className]) => `#panel.${className} {
            transition-duration: ${duration}ms;
          }`).join('\n')}
          ${shellRules}
          #panel.${BLENDING_CLASS}, #panel.${BLENDING_CLASS}:overview {
            background-color: transparent;
            background-gradient-direction: none;
            background-image: none;
            border-color: transparent;
            box-shadow: none;
            transition-duration: 0ms;
          }
          #panel.${RESTORING_CLASS}, #panel.${RESTORING_CLASS}:overview {
            transition-duration: 0ms;
          }${gradientRule(`.${GRADIENT_CLASSES.main}`, main)}${gradientRule(`.${GRADIENT_CLASSES.alternate}`, alternate)}${gradientRule(`.${GRADIENT_CLASSES.overview}`, overview)}${contentShadows}`;
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
    const previous = loadedStylesheet;
    writeStylesheetCss(userStylesheet, css);
    loadedStylesheet = null;
    theme.unload_stylesheet(userStylesheet);
    // load again
    try {
        theme.load_stylesheet(userStylesheet);
    } catch (error) {
        if (previous) {
            try {
                writeStylesheetCss(userStylesheet, previous.css);
                theme.load_stylesheet(userStylesheet);
                loadedStylesheet = { theme, css: previous.css };
            } catch (restoreError) {
                throw new AggregateError([error, restoreError], `Stylesheet replacement failed: ${error.message}; restoration failed: ${restoreError.message}`, { cause: restoreError });
            }
        }
        throw error;
    }
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

