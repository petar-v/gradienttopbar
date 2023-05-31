const Main = imports.ui.main;
const { Meta } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();

const { BOTH } = Meta.MaximizeFlags;
const isMaximized = (window) => window.get_maximized() === BOTH;

const { createGradient } = Extension.imports.gradient;
const {
  SETTINGS_GSCHEMA,
  getConfig,
  attachSettingsListeners,
  detachSettingsListeners,
} = Extension.imports.config;

const maximizedWindows = new Set();
let workspace = null;
let gradient = null;

const modifyTopBar = () => {
  const workspaceWindowIds = workspace
    .list_windows()
    .map((win) => win.get_id());

  const lacksWorkspaceMaximizedWindow =
    workspaceWindowIds.find((workspaceWindowId) =>
      maximizedWindows.has(workspaceWindowId)
    ) === undefined;

  gradient(lacksWorkspaceMaximizedWindow);
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

let settings;
function init() {
  workspace = global.get_workspace_manager().get_active_workspace();
}

// TODO: refucktor all of that.
let windowCreatedId;
let workspaceSwitchId;
let windowDestroyedId;
let monitoredWindows = {};

const onWindowDestroy = (_, windowActor) => {
  const windowId = windowActor.get_meta_window().get_id();
  maximizedWindows.delete(windowId);
  delete monitoredWindows[windowId];
  modifyTopBar();
};

const addWindowEventListeners = (window) => {
  const onResize = window.connect("size-changed", onWindowSizeChange);
  monitoredWindows[window.get_id()] = [onResize, onClose];
};
const enableMaximizedListeners = () => {
  if (!windowCreatedId) {
    // listen for window created events and attach a size change event listener
    windowCreatedId = global.display.connect("window-created", (_, win) => {
      if (win.can_maximize()) {
        // this is probably not the proper event to listen to but there was no "maximize" event
        // so this gets triggered every time there is a window resize. This is NOT optimal :(
        monitoredWindows[win.get_id()] = win.connect(
          "size-changed",
          onWindowSizeChange
        );
      }
    });
  }
  if (!windowDestroyedId) {
    windowDestroyedId = global.window_manager.connect(
      "destroy",
      onWindowDestroy
    );
  }
  global.display
    .list_all_windows()
    .filter((window) => monitoredWindows[window.get_id()] === undefined)
    .forEach((window) => {
      monitoredWindows[window.get_id()] = window.connect(
        "size-changed",
        onWindowSizeChange
      );
    });

  if (!workspaceSwitchId) {
    // keep a reference to the current workspace
    workspaceSwitchId = global
      .get_workspace_manager()
      .connect("workspace-switched", onWorkspaceChanged);
  }
};
const disableMaximizedListeners = () => {
  if (windowCreatedId) {
    global.display.disconnect(windowCreatedId);
    windowCreatedId = null;
  }
  if (workspaceSwitchId) {
    global.get_workspace_manager().disconnect(workspaceSwitchId);
    workspaceSwitchId = null;
  }
  if (windowDestroyedId) {
    global.window_manager.disconnect(windowDestroyedId);
    windowDestroyedId = null;
  }
  global.display.list_all_windows().forEach((window) => {
    window.disconnect(monitoredWindows[window.get_id()]);
  });
  monitoredWindows = {};
};

const onSettingsChanged = (settings) => {
  const config = getConfig(settings);
  gradient = createGradient(config);
  global.log("Gradient with " + config.gradientDirection + " dir created");
  const { isOpaqueOnMaximized } = config;

  if (isOpaqueOnMaximized) {
    enableMaximizedListeners();
  } else {
    disableMaximizedListeners();
    gradient(true);
  }
};

function enable() {
  settings = ExtensionUtils.getSettings(SETTINGS_GSCHEMA);

  attachSettingsListeners(settings, onSettingsChanged);

  const config = getConfig(settings);
  const { isOpaqueOnMaximized } = config;
  if (isOpaqueOnMaximized) {
    enableMaximizedListeners();
  }
  // initially set up the gradient
  gradient = createGradient(config);
  gradient(true);
}

function disable() {
  disableMaximizedListeners();
  gradient(false);
  detachSettingsListeners(settings, onSettingsChanged);
  settings = null;
  gradient = null;
}
