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
let workspace = null;

const modifyTopBar = () => {
  const workspaceWindowIds = workspace
    .list_windows()
    .map((win) => win.get_id());

  const lacksWorkspaceMaximizedWindow =
    workspaceWindowIds.find((workspaceWindowId) =>
      maximizedWindows.has(workspaceWindowId)
    ) === undefined;

  toggleGradient(lacksWorkspaceMaximizedWindow);
};

const onWindowSizeChange = (window) => {
  if (isMaximized(window)) {
    maximizedWindows.add(window.get_id());
  } else {
    maximizedWindows.delete(window.get_id());
  }
  modifyTopBar();
};

const onWorkspaceChanged = (workspaceManager) => {
  workspace = workspaceManager.get_active_workspace();
  modifyTopBar();
};

function init() {
  workspace = global.get_workspace_manager().get_active_workspace();
}

let windowCreatedId;
let workspaceSwitchId;
function enable() {
  // listen for window created events and attach a size change event listener
  windowCreatedId = global.display.connect("window-created", (_, win) => {
    if (win.can_maximize()) {
      win.connect("size-changed", onWindowSizeChange);
    }
  });

  workspaceSwitchId = global
    .get_workspace_manager()
    .connect("workspace-switched", onWorkspaceChanged);

  // initially set up the gradient
  toggleGradient(true);
}

function disable() {
  global.display.disconnect(windowCreatedId);
  global.get_workspace_manager().disconnect(workspaceSwitchId);

  toggleGradient(false);
}
