const Main = imports.ui.main;

const GRADIENT_CLASS = "panel-gradient";
const CORNER_GRADIENT_CLASS = "corner-gradient";

let isFaded = false;

function toggleGradient(enabled) {
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
