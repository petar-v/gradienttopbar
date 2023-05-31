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

let isFaded = false;
function createGradient(config) {
  const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();

  // generate a stylesheet based on the user preferences. note: this is somewhat of a hack.
  // I couldn't figure out how to dynamically alter classes. I could have used Main.panel.set_style
  // but I found this interferes with other extensions and becomes a mess to maintian.
  // unload the previous version
  theme.unload_stylesheet(USER_STYLESHEET);
  // save the current version
  saveUserCss(USER_STYLESHEET, generateCss(config));
  // load again
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
