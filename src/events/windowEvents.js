import Meta from 'gi://Meta';
import { overview } from 'resource:///org/gnome/shell/ui/main.js';

import EventManager from './eventManager.js';
import { areSameState } from './states.js';

const WORKSPACE_CHANGE_EVENT = 'workspace-switched';
const WINDOW_CREATE_EVENT = 'window-created';
const WINDOW_DESTROY_EVENT = 'destroy';
const WINDOW_MINIMIZED_EVENT = 'minimize';
const WINDOW_RAISED_EVENT = 'unminimize';

const WINDOW_EXIT_MONITOR = 'window-left-monitor';
// const WINDOW_REMOVED_FROM_WORKSPACE = 'window-removed';
// const WINDOW_ADDED_TO_WORKSPACE = 'window-added';
const OVERVIEW_SHOWING = 'showing';
const OVERVIEW_HIDING = 'hiding';

// FIXME: this causes the overview to close on login
const isDesktopIconsNG = window => window.customJS_ding !== undefined; // this is to ignore "Desktop Icons NG"'s window hacks

const isVisibleApplicationWindow = window =>
    !isDesktopIconsNG(window) &&
    window.is_on_primary_monitor() &&
    window.showing_on_its_workspace() &&
    !window.is_hidden() &&
    window.get_window_type() !== Meta.WindowType.DESKTOP &&
    !window.skip_taskbar;

/**
 * Manages window events and tracks window state changes
 * Used to detect windows that trigger alternate panel styling
 */
export default class WindowEvents {
    /**
     * Creates a new WindowEvents instance
     *
     * @param {Meta.Display} display - The GNOME Shell display
     * @param {Meta.WindowManager} windowManager - The GNOME Shell window manager
     * @param {Meta.WorkspaceManager} workspaceManager - The GNOME Shell workspace manager
     */
    constructor(display, windowManager, workspaceManager, behaviour) {
        this.display = display;
        this.windowManager = windowManager;
        this.workspaceManager = workspaceManager;
        this.behaviour = behaviour;

        this.eventManager = new EventManager();
        this.enabled = false;

        this.stateChangeCallback = () => {};

        this.workspace = null;
        this.inOverview = false;
        this.triggerWindows = new Set();
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

    /**
     * Gets the current window state
     *
     * @returns {Object} The current trigger, workspace, and overview state
     */
    getCurrentState() {
        return {
            triggerWindows: this.triggerWindows,
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
    updateState(force = false, excludedWindowId = null) {
        this.triggerWindows = this.getTriggerWindowIds(excludedWindowId);
        this.emitStateChange(force);
    }

    /**
     * Enables window event tracking
     * Sets up all event listeners and initializes the current state
     */
    enable() {
        if (this.enabled)
            return;

        this.enabled = true;

        /**
         * Handles window size change events
         *
         * @param {Meta.Window} window - The window that changed size
         */
        const onWindowChange = () => this.updateState();

        /**
         * Handles workspace change events
         *
         * @param {Meta.WorkspaceManager} workspaceManager - The workspace manager
         */
        const onWorkspaceChanged = workspaceManager => {
            this.workspace = workspaceManager.get_active_workspace();
            this.updateState();
        };

        /**
         * Handles window destruction events
         *
         * @param {*} _ - Unused parameter
         * @param {Meta.WindowActor} windowActor - The window actor being destroyed
         */
        const onWindowDestroy = (_, windowActor) => {
            const window = windowActor.get_meta_window();
            this.eventManager.disconnectWindowEvents(window);
            this.updateState(false, window.get_id());
        };

        /**
         * Attaches event listeners to a window
         *
         * @param {Meta.Window} window - The window to attach events to
         */
        const attachWindowEvents = window => {
            if (isDesktopIconsNG(window))
                return;

            this.behaviour.attachWindowEvents(
                this.eventManager,
                window,
                onWindowChange
            );
        };

        /**
         * Handles window minimize events
         *
         * @param {*} _ - Unused parameter
         * @param {Meta.WindowActor} windowActor - The window actor being minimized
         */
        const onWindowMinimize = (_, windowActor) => {
            this.updateState(false, windowActor.get_meta_window().get_id());
        };

        /**
         * Handles window raise (unminimize) events
         *
         * @param {*} _ - Unused parameter
         * @param {Meta.WindowActor} windowActor - The window actor being raised
         */
        const onWindowRaise = () => {
            this.updateState();
        };

        this.workspace = this.workspaceManager.get_active_workspace();

        // TODO: what if the window starts as maximized dimensions but is not "snapped"?
        // TODO: what if we have tiled windows?

        this.eventManager.attachGlobalEventOnce(
            WINDOW_CREATE_EVENT,
            this.display,
            (_, window) => {
                attachWindowEvents(window);
                this.updateState();
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
            () => this.updateState()
        );
        this.behaviour.attachGlobalEvents(
            this.eventManager,
            force => this.updateState(force)
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
            this.updateState(true);
        });

        this.display.list_all_windows().forEach(attachWindowEvents);

        this.triggerWindows = this.getTriggerWindowIds();

        // Add screen lock/unlock event handling
        this.eventManager.attachUnlockScreenEvent(() => {
            // Force state re-evaluation after screen unlock
            this.updateState(true);
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
        this.triggerWindows = new Set();
        this.inOverview = null;
        this.lastState = null;
        this.enabled = false;
    }

    /**
     * Gets the IDs of windows that currently trigger alternate styling
     *
     * @returns {Set<number>} A set containing the triggering window IDs
     */
    getTriggerWindowIds(excludedWindowId = null) {
        if (!this.workspace)
            return new Set();

        const windows = this.workspace
            .list_windows()
            .filter(isVisibleApplicationWindow)
            .filter(window => window.get_id() !== excludedWindowId);

        return new Set(
            this.behaviour
                .evaluate(windows)
                .map(window => window.get_id())
        );
    }

    setBehaviour(behaviour) {
        if (this.behaviour.constructor === behaviour.constructor)
            return;

        const wasEnabled = this.enabled;
        if (wasEnabled)
            this.disable();

        this.behaviour = behaviour;

        if (wasEnabled)
            this.enable();
    }
}
