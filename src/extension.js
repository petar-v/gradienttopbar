const Main = imports.ui.main;
const { Meta } = imports.gi;

const GRADIENT_CLASS = "panel-gradient";
const CORNER_GRADIENT_CLASS = "corner-gradient";

let isFaded = false;
const toggleGradient = (enabled) => {
  if (enabled === isFaded) {
    return;
  }
  const actionCall = enabled
    ? "add_style_class_name"
    : "remove_style_class_name";
  Main.panel.actor[actionCall](GRADIENT_CLASS);
  [Main.panel._leftCorner, Main.panel._rightCorner].forEach(
    (corner) => corner && corner[actionCall](CORNER_GRADIENT_CLASS)
  );

  isFaded = enabled;
};

const { HORIZONTAL, VERTICAL, BOTH } = Meta.MaximizeFlags;
const isMaximized = (window) => window.get_maximized() === BOTH;

const maximizedWindows = new Set();

const onWindowSizeChange = (window) => {
  if (isMaximized(window)) {
    maximizedWindows.add(window.get_id());
  } else {
    maximizedWindows.delete(window.get_id());
  }
  toggleGradient(maximizedWindows.size === 0);
};

let windowCreatedId;
function enable() {
  windowCreatedId = global.display.connect("window-created", (_, win) => {
    if (win.can_maximize()) {
      win.connect("size-changed", onWindowSizeChange);
    }
  });
  toggleGradient(true);
}

function disable() {
  global.display.disconnect(windowCreatedId);
  toggleGradient(false);
}
