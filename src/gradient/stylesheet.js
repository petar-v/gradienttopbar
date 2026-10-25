import St from 'gi://St';
import Gio from 'gi://Gio';

export const GRADIENT_CLASS = 'panel-gradient';
export const MAXIMIZED_GRADIENT_CLASS = 'panel-maximized-gradient';
export const OVERVIEW_GRADIENT_CLASS = 'panel-overview-gradient';
export const BLENDING_CLASS = 'panel-background-blending';
export const RESTORING_CLASS = 'panel-background-restoring';
export const TRANSITION_DURATION_MS = 200;

const generateCss = config => {
    const { gradientDirection, colors, maximizedGradientDirection, maximizedColors } = config;
    const shadow = `${config.shadowOffsetX}px ${config.shadowOffsetY}px ${config.shadowBlur}px ${config.shadowColor}`;
    const contentShadows = config.contentShadows ? `
          #panel.${GRADIENT_CLASS} .panel-button,
          #panel.${MAXIMIZED_GRADIENT_CLASS} .panel-button,
          #panel.${OVERVIEW_GRADIENT_CLASS} .panel-button,
          #panel.${GRADIENT_CLASS} .panel-button StLabel,
          #panel.${MAXIMIZED_GRADIENT_CLASS} .panel-button StLabel,
          #panel.${OVERVIEW_GRADIENT_CLASS} .panel-button StLabel {
            text-shadow: ${shadow};
          }
          #panel.${GRADIENT_CLASS} .panel-button StIcon,
          #panel.${MAXIMIZED_GRADIENT_CLASS} .panel-button StIcon,
          #panel.${OVERVIEW_GRADIENT_CLASS} .panel-button StIcon {
            icon-shadow: ${shadow};
          }
          #panel.${GRADIENT_CLASS} .workspace-dot,
          #panel.${MAXIMIZED_GRADIENT_CLASS} .workspace-dot,
          #panel.${OVERVIEW_GRADIENT_CLASS} .workspace-dot {
            box-shadow: ${shadow};
          }` : '';
    return `#panel {
            transition-duration: ${TRANSITION_DURATION_MS}ms;
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
          }
          .${OVERVIEW_GRADIENT_CLASS} {
            background-color: transparent;
            background-gradient-direction: ${config.overviewGradientDirection};
            background-gradient-start: ${config.overviewColors.start};
            background-gradient-end: ${config.overviewColors.end};
          }${contentShadows}`;
};

/*
 * Locate the generated stylesheet so loading, replacement and unloading use the same file.
 */
const getUserStylesheet = extensionPath =>
    Gio.File.new_for_path(`${extensionPath}/user-stylesheet.css`);

/*
 * Replace the generated CSS file so the theme can load the latest settings.
 */
const saveUserCss = (file, stylesheet) => {
    const outStream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
    const outDataStream = Gio.DataOutputStream.new(outStream);
    outDataStream.put_string(stylesheet, null);
    outDataStream.close(null);
};

/*
 * Regenerate and reload the stylesheet after settings change, avoiding inline panel styles that clash with other extensions.
 */
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

/*
 * Remove the generated stylesheet from the theme when the extension is disabled.
 */
export const unloadGradientStylesheet = extensionPath => {
    const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
    theme.unload_stylesheet(getUserStylesheet(extensionPath));
};

