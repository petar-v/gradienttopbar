const Main = imports.ui.main;
const { Meta } = imports.gi;

const GRADIENT_CLASS = "panel-gradient";
const CORNER_GRADIENT_CLASS = "corner-gradient";

let isFaded = false;
const toggleGradient = (enabled) => {
  if (enabled === isFaded) return;
  const actionCall = enabled
    ? "add_style_class_name"
    : "remove_style_class_name";
  Main.panel.actor[actionCall](GRADIENT_CLASS);
  [Main.panel._leftCorner, Main.panel._rightCorner].forEach(
    (corner) => corner && corner[actionCall](CORNER_GRADIENT_CLASS)
  );

  isFaded = enabled;
};

const { BOTH } = Meta.MaximizeFlags;
const isMaximized = (window) => window.get_maximized() === BOTH;

const maximizedWindows = new Set();
let workspace = null;

const modifyTopBar = () => {
  const workspaceWindowIds = workspace
    .list_windows()
    .map((win) => win.get_id());

  log("mofigying top bar --------------------------------------------------");

  log("workspaceWindowIds", workspaceWindowIds);
  log("maximizedWindows", maximizedWindows.size);

  const lacksWorkspaceMaximizedWindow =
    workspaceWindowIds.find((workspaceWindowId) =>
      maximizedWindows.has(workspaceWindowId)
    ) === undefined;

  log("enabled", lacksWorkspaceMaximizedWindow);

  toggleGradient(lacksWorkspaceMaximizedWindow);
};

const onWindowSizeChange = (window) => {
  if (isMaximized(window)) {
    maximizedWindows.add(window.get_id());
    log("maximized window",  window.get_title());
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
    /**
    * This is a hack to prevent this extension from interfering with Desktop Icons NG.
    * For more information, please see :
    * https://www.reddit.com/r/pop_os/comments/utrdzl/00bdhf_on_the_alttab_app_list/
    * https://askubuntu.com/questions/1345101/what-is-72-27bdh-and-0-27bdh
    * https://unix.stackexchange.com/questions/680497/can-someone-explain-what-is-this-non-clickable-permanent-window-called-0-35bd
    */
    const isDesktopIconsNG = win.get_title() === "@!0,0;BDHF";
    if(isDesktopIconsNG) {
      return;
    }

    // attach an event listener only to maximizable windows
    if (win.can_maximize()) {
      // this is probably not the proper event to listen to but there was no "maximize" event
      // so this gets triggered every time there is a window resize. This is NOT optimal :(
      win.connect("size-changed", onWindowSizeChange);
    }
  });

  // keep a reference to the current workspace
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
