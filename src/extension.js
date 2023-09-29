import Meta from 'gi://Meta';
import {
    Extension
} from 'resource:///org/gnome/shell/extensions/extension.js';
import { applyGradientStyle, toggleGradient } from './gradient.js';
import {
    getConfig,
    attachSettingsListeners,
    detachSettingsListeners
} from './config.js';

const { BOTH } = Meta.MaximizeFlags;
const isMaximized = window => window.get_maximized() === BOTH; // TODO: what if the window starts as maximized dimensions but is not "snapped"?

// TODO: separate the window states from the main extension
export default class GradientTopBar extends Extension {
    constructor(metadata) {
        super(metadata);

        // gradient state
        this.isGradientEnabled = false;

        // window event listeners IDs
        this.windowCreatedId = null;
        this.workspaceSwitchId = null;
        this.windowDestroyedId = null;

        // window states
        this.workspace = global.get_workspace_manager().get_active_workspace();
        this.maximizedWindows = new Set();
        this.monitoredWindows = {};

        // event listener callbacks
        this.onWindowSizeChange = window => {
            if (isMaximized(window))
                this.maximizedWindows.add(window.get_id());
            else
                this.maximizedWindows.delete(window.get_id());

            this.modifyTopBar();
        };

        this.onWorkspaceChanged = workspaceManager => {
            this.workspace = workspaceManager.get_active_workspace();
            this.modifyTopBar();
        };

        this.onWindowDestroy = (_, windowActor) => {
            const windowId = windowActor.get_meta_window().get_id();
            this.maximizedWindows.delete(windowId);
            delete this.monitoredWindows[windowId];
            this.modifyTopBar();
        };

        this.onSettingsChanged = settings => {
            const config = getConfig(settings);
            applyGradientStyle(config, this.path);

            const { isOpaqueOnMaximized } = config;

            if (isOpaqueOnMaximized) {
                this.enableMaximizedListeners();
            } else {
                this.disableMaximizedListeners();
                this.toggleGradient(true);
            }
        };

        this.monitorSizeChange = win => {
            // this is probably not the proper event to listen to but there was no "maximize" event
            // so this gets triggered every time there is a window resize. This is NOT optimal :(
            this.monitoredWindows[win.get_id()] = win.connect(
                'size-changed',
                this.onWindowSizeChange
            );
        };

        this.onWindowCreate = (_, window) => {
            if (window.can_maximize())
                this.monitorSizeChange(window);

            if (isMaximized(window))
                this.maximizedWindows.add(window.get_id());

            this.modifyTopBar();
        };
    }

    modifyTopBar() {
        const workspaceWindowIds = this.workspace
        .list_windows()
        .map(win => win.get_id());

        const lacksWorkspaceMaximizedWindow =
        workspaceWindowIds.find(workspaceWindowId =>
            this.maximizedWindows.has(workspaceWindowId)
        ) === undefined;

        this.toggleGradient(lacksWorkspaceMaximizedWindow);
    }

    enableMaximizedListeners() {
        if (!this.windowCreatedId) {
            // listen for window created events and attach a size change event listener
            this.windowCreatedId = global.display.connect('window-created', this.onWindowCreate);
        }
        if (!this.windowDestroyedId) {
            this.windowDestroyedId = global.window_manager.connect(
                'destroy',
                this.onWindowDestroy
            );
        }
        global.display
        .list_all_windows()
        .filter(window => this.monitoredWindows[window.get_id()] === undefined)
        .forEach(this.monitorSizeChange);

        if (!this.workspaceSwitchId) {
        // keep a reference to the current workspace
            this.workspaceSwitchId = global
          .get_workspace_manager()
          .connect('workspace-switched', this.onWorkspaceChanged);
        }
    }

    disableMaximizedListeners() {
        if (this.windowCreatedId) {
            global.display.disconnect(this.windowCreatedId);
            this.windowCreatedId = null;
        }
        if (this.workspaceSwitchId) {
            global.get_workspace_manager().disconnect(this.workspaceSwitchId);
            this.workspaceSwitchId = null;
        }
        if (this.windowDestroyedId) {
            global.window_manager.disconnect(this.windowDestroyedId);
            this.windowDestroyedId = null;
        }
        global.display.list_all_windows().forEach(window => {
            window.disconnect(this.monitoredWindows[window.get_id()]);
        });
        this.monitoredWindows = {};
    }

    toggleGradient(enabled) {
        if (this.isGradientEnabled === enabled)
            return;

        toggleGradient(enabled);
        this.isGradientEnabled = enabled;
    }

    enable() {
        this._settings = this.getSettings();

        attachSettingsListeners(this._settings, this.onSettingsChanged);

        const config = getConfig(this._settings);
        const { isOpaqueOnMaximized } = config;
        if (isOpaqueOnMaximized)
            this.enableMaximizedListeners();

        // initially set up the gradient
        applyGradientStyle(config, this.path);
        this.toggleGradient(true);
    }

    disable() {
        this.disableMaximizedListeners();
        this.toggleGradient(false);
        detachSettingsListeners(this.getSettings(), this.onSettingsChanged);
        this._settings = null;
    }
}
