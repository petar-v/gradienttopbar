// Based on the original extension at https://extensions.gnome.org/extension/1264/gradient-top-bar/

const Main = imports.ui.main;

const GRADIENT_CLASS = "panel-gradient";
const CORNER_GRADIENT_CLASS = "corner-gradient";

const toggleCorners = (enable) =>
  [Main.panel._leftCorner, Main.panel._rightCorner].forEach(
    (corner) =>
      corner &&
      corner[enable ? "add_style_class_name" : "remove_style_class_name"](
        CORNER_GRADIENT_CLASS
      )
  );

function enable() {
  Main.panel.actor.add_style_class_name(GRADIENT_CLASS);
  toggleCorners(true);
}

function disable() {
  Main.panel.actor.remove_style_class_name(GRADIENT_CLASS);
  toggleCorners(false);
}
