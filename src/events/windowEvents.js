import Meta from 'gi://Meta';
import { overview } from 'resource:///org/gnome/shell/ui/main.js';

import EventManager from './eventManager.js';
import { areSameState } from './states.js';
import { MAXIMIZATION_TYPE } from '../constants.js';

const { VERTICAL, HORIZONTAL, BOTH } = Meta.MaximizeFlags;

const SIZE_CHANGE_EVENT = 'size-changed';
const WORKSPACE_CHANGE_EVENT = 'workspace-switched';
const WINDOW_CREATE_EVENT = 'window-created';
const WINDOW_DESTROY_EVENT = 'destroy';
const WINDOW_MINIMIZED_EVENT = 'minimize';
const WINDOW_RAISED_EVENT = 'unminimize';

const WINDOW_EXIT_MONITOR = 'window-left-monitor';
// const WINDOW_REMOVED_FROM_WORKSPACE = 'window-removed';
// const WINDOW_ADDED_TO_WORKSPACE = 'window-added';
const WINDOW_WORKSPACE_CHANGED = 'workspace-changed';

const OVERVIEW_SHOWING = 'showing';
const OVERVIEW_HIDING = 'hiding';

// FIXME: this causes the overview to close on login
const isDesktopIconsNG = window => window.customJS_ding !== undefined; // this is to ignore "Desktop Icons NG"'s window hacks

// Check if window is full screen or monitor sized
const isFullScreen = window => window.is_monitor_sized() || window.is_screen_sized();

/**
 * Determines if a window is maximized or full-screen
 *
 * @param {Meta.Window} window - The window to check
 * @param {string} maximizationType - Maximization type definition
 * @returns {boolean} True if the window is maximized or full-screen
 */
const isMaximized = (window, maximizationType = MAXIMIZATION_TYPE.BOTH) => {
    // Ignore Desktop Icons NG windows
    if (isDesktopIconsNG(window))
        return false;

    const windowMaximizeState = window.get_maximized();

    switch (maximizationType) {
        case MAXIMIZATION_TYPE.BOTH:
            return windowMaximizeState === BOTH || isFullScreen(window);
        case MAXIMIZATION_TYPE.VERTICAL:
            return windowMaximizeState === VERTICAL || windowMaximizeState === BOTH;
        case MAXIMIZATION_TYPE.HORIZONTAL:
            return windowMaximizeState === HORIZONTAL || windowMaximizeState === BOTH;
        case MAXIMIZATION_TYPE.ANY:
            return windowMaximizeState === VERTICAL ||
                   windowMaximizeState === HORIZONTAL ||
                   windowMaximizeState === BOTH || isFullScreen(window);
        default:
            return windowMaximizeState === BOTH;
    }
};

/**
 * Manages window events and tracks window state changes
 * Used to detect maximized windows and trigger appropriate UI updates
 */
export default class WindowEvents {
    /**
     * Creates a new WindowEvents instance
     *
     * @param {Meta.Display} display - The GNOME Shell display
     * @param {Meta.WindowManager} windowManager - The GNOME Shell window manager
     * @param {Meta.WorkspaceManager} workspaceManager - The GNOME Shell workspace manager
     */
    constructor(display, windowManager, workspaceManager) {
        this.display = display;
        this.windowManager = windowManager;
        this.workspaceManager = workspaceManager;

        this.eventManager = new EventManager();

        this.stateChangeCallback = () => {};

        this.workspace = null;
        this.inOverview = false;
        this.maximizedWindows = new Set();
        this.maximizationType = MAXIMIZATION_TYPE.BOTH; // Default value
        this.lastState = null;
    }

    /**
     * Sets the callback function to be called when window state changes
     *
     * @param {Function} callback - The callback function that receives the current state
     */
    setStateChangeCallback(callback) {
        this.stateChangeCallback = callback;
    }

    setMaximizationType(type) {
        this.maximizationType = type;
        this.forceStateUpdate();
    }

    forceStateUpdate() {
        // Update the maximized windows set based on the current maximization type
        this.maximizedWindows = this.getMaximizedWindowIds();

        // Force a state change emission
        this.stateChangeCallback({
            maximizedWindows: this.maximizedWindows,
            currentWorkspace: this.workspace,
            inOverview: this.inOverview
        });
    }

    /**
     * Gets the current window state
     *
     * @returns {Object} An object containing the current state (maximizedWindows, currentWorkspace, inOverview)
     */
    getCurrentState() {
        return {
            maximizedWindows: this.maximizedWindows,
            currentWorkspace: this.workspace,
            inOverview: this.inOverview
        };
    }

    /**
     * Emits a state change event if the state has changed or if forced
     *
     * @param {boolean} force - If true, emits the event even if the state hasn't changed
     */
    emitStateChange(force = false) {
        const currentState = this.getCurrentState();
        if (force || !areSameState(this.lastState, currentState)) {
            this.lastState = currentState;
            this.stateChangeCallback(currentState);
        }
    }

    /**
     * Forces a state update by re-evaluating maximized windows and emitting a state change
     * Used when the state needs to be refreshed regardless of detected changes
     */
    forceStateUpdate() {
        // Re-evaluate maximized windows
        this.maximizedWindows = this.getMaximizedWindowIds();
        // Force state change emission
        this.emitStateChange(true);
    }

    /**
     * Enables window event tracking
     * Sets up all event listeners and initializes the current state
     */
    enable() {
        /**
         * Handles window size change events
         *
         * @param {Meta.Window} window - The window that changed size
         */
        const onWindowSizeChange = window => {
            if (isMaximized(window, this.maximizationType))
                this.maximizedWindows.add(window.get_id());
            else
                this.maximizedWindows.delete(window.get_id());

            this.emitStateChange();
        };

        /**
         * Handles workspace change events
         *
         * @param {Meta.WorkspaceManager} workspaceManager - The workspace manager
         */
        const onWorkspaceChanged = workspaceManager => {
            this.workspace = workspaceManager.get_active_workspace();
            this.emitStateChange();
        };

        /**
         * Handles window destruction events
         *
         * @param {*} _ - Unused parameter
         * @param {Meta.WindowActor} windowActor - The window actor being destroyed
         */
        const onWindowDestroy = (_, windowActor) => {
            const window = windowActor.get_meta_window();
            this.maximizedWindows.delete(window.get_id());
            this.eventManager.disconnectWindowEvents(window);

            this.emitStateChange();
        };

        /**
         * Attaches event listeners to a window
         *
         * @param {Meta.Window} window - The window to attach events to
         */
        const attachWindowEvents = window => {
            if (isDesktopIconsNG(window))
                return;

            if (window.can_maximize()) {
                this.eventManager.attachWindowEventOnce(
                    SIZE_CHANGE_EVENT,
                    window,
                    onWindowSizeChange
                );
            }

            if (isMaximized(window, this.maximizationType))
                this.maximizedWindows.add(window.get_id());

            this.eventManager.attachWindowEventOnce(
                WINDOW_WORKSPACE_CHANGED,
                window,
                () => this.forceStateUpdate()
            );
        };

        /**
         * Handles window minimize events
         *
         * @param {*} _ - Unused parameter
         * @param {Meta.WindowActor} windowActor - The window actor being minimized
         */
        const onWindowMinimize = (_, windowActor) => {
            const windowId = windowActor.get_meta_window().get_id();
            this.maximizedWindows.delete(windowId);
            this.emitStateChange();
        };

        /**
         * Handles window raise (unminimize) events
         *
         * @param {*} _ - Unused parameter
         * @param {Meta.WindowActor} windowActor - The window actor being raised
         */
        const onWindowRaise = (_, windowActor) => {
            const window = windowActor.get_meta_window();
            if (isMaximized(window, this.maximizationType))
                this.maximizedWindows.add(window.get_id());
            this.emitStateChange();
        };

        const forceStateChangeEmission = () => emitStateChange(true);

        this.workspace = this.workspaceManager.get_active_workspace();

        // TODO: what if the window starts as maximized dimensions but is not "snapped"?
        // TODO: what if we have tiled windows?

        this.eventManager.attachGlobalEventOnce(
            WINDOW_CREATE_EVENT,
            this.display,
            (_, window) => {
                attachWindowEvents(window);
                this.emitStateChange();
            }
        );
        this.eventManager.attachGlobalEventOnce(
            WINDOW_DESTROY_EVENT,
            this.windowManager,
            onWindowDestroy
        );
        this.eventManager.attachGlobalEventOnce(
            WORKSPACE_CHANGE_EVENT,
            this.workspaceManager,
            onWorkspaceChanged
        );
        this.eventManager.attachGlobalEventOnce(
            WINDOW_MINIMIZED_EVENT,
            this.windowManager,
            onWindowMinimize
        );
        this.eventManager.attachGlobalEventOnce(
            WINDOW_RAISED_EVENT,
            this.windowManager,
            onWindowRaise
        );

        this.eventManager.attachGlobalEventOnce(
            WINDOW_EXIT_MONITOR,
            this.display,
            () => this.emitStateChange(true)
        );

        // FIXME: the workspace changes so this needs to be attached to every workspace as it is created/deleted
        // this.eventManager.attachGlobalEventOnce(WINDOW_ADDED_TO_WORKSPACE, this.workspace, () => this.forceStateUpdate());
        // this.eventManager.attachGlobalEventOnce(WINDOW_REMOVED_FROM_WORKSPACE, this.workspace, () => this.forceStateUpdate());

        // disable style changes when in overview - might make this a config option
        this.eventManager.attachGlobalEventOnce(OVERVIEW_SHOWING, overview, () => {
            this.inOverview = true;
            this.emitStateChange();
        });
        this.eventManager.attachGlobalEventOnce(OVERVIEW_HIDING, overview, () => {
            this.inOverview = false;
            this.emitStateChange();
        });

        // TODO: instead of on size change, listen for https://gjs-docs.gnome.org/meta13~13/meta.window#property-maximized_horizontally or vertically
        // to make it work with tiling, I would need to figure out the position in case it is maximized horizontally but on top.
        // if it's maximized vertically, then it's likely on either side. In that case I want to make the bar opaque.
        this.display.list_all_windows().forEach(attachWindowEvents);

        // FIXME: find a way to do that only for the windows on the primary monitor's current workspace
        this.maximizedWindows = this.getMaximizedWindowIds();

        // Add screen lock/unlock event handling
        this.eventManager.attachUnlockScreenEvent(() => {
            // Force state re-evaluation after screen unlock
            this.forceStateUpdate();
        });

        this.emitStateChange();
    }

    /**
     * Disables window event tracking
     * Cleans up all event listeners and resets the state
     */
    disable() {
        this.eventManager.disconnectAllEvents();
        this.display.list_all_windows().forEach(window => {
            this.eventManager.disconnectWindowEvents(window);
        });

        this.workspace = null;
        this.maximizedWindows = new Set();
        this.inOverview = null;
        this.lastState = null;
    }

    /**
     * Gets the IDs of all currently maximized windows
     *
     * @returns {Set<number>} A set containing the IDs of all maximized windows
     */
    getMaximizedWindowIds() {
        return new Set(
            this.display
                .list_all_windows()
                .filter(window => isMaximized(window, this.maximizationType))
                .map(window => window.get_id())
        );
    }
}
