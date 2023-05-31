const Main = imports.ui.main;
const St = imports.gi.St;
const Gio = imports.gi.Gio;

const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();

const GRADIENT_CLASS = "panel-gradient";
const CORNER_GRADIENT_CLASS = "corner-gradient";
const USER_STYLESHEET = Gio.File.new_for_path(
  Extension.path + "/user-stylesheet.css"
);

const generateCss = (config) => {
  const colorStart = config.colors.start;
  const colorEnd = config.colors.end;
  const direction = config.gradientDirection;
  return `.${GRADIENT_CLASS} {
            background-color: transparent;
            background-gradient-direction: ${direction};
            background-gradient-start: rgba(${colorStart.color}, ${colorStart.opacity});
            background-gradient-end: rgba(${colorEnd.color}, ${colorEnd.opacity});
          }`;
};

const saveUserCss = (file, stylesheet) => {
  const outStream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
  const outDataStream = Gio.DataOutputStream.new(outStream);
  outDataStream.put_string(stylesheet, null);
  outDataStream.close(null);
};

let isFaded = false;
function createGradient(config) {
  const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();

  theme.unload_stylesheet(USER_STYLESHEET);
  saveUserCss(USER_STYLESHEET, generateCss(config));
  theme.load_stylesheet(USER_STYLESHEET);

  return (enabled) => {
    if (enabled === isFaded) return;
    const actionCall = enabled
      ? "add_style_class_name"
      : "remove_style_class_name";
    Main.panel.actor[actionCall](GRADIENT_CLASS); // fIXME: this is deprecated
    [Main.panel._leftCorner, Main.panel._rightCorner].forEach(
      (corner) => corner && corner[actionCall](CORNER_GRADIENT_CLASS)
    );
    isFaded = enabled;
  };
}
