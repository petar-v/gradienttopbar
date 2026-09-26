import Meta from 'gi://Meta';
import { overview, wm } from 'resource:///org/gnome/shell/ui/main.js';

import EventManager from './eventManager.js';
import {
    areSameState,
    getWorkspaceTransition
} from './states.js';

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
const WORKSPACE_SWIPE_BEGIN = 'begin';

// FIXME: this causes the overview to close on login
const isDesktopIconsNG = window => window.customJS_ding !== undefined; // this is to ignore "Desktop Icons NG"'s window hacks

const isApplicationWindow = window =>
    !isDesktopIconsNG(window) &&
    window.is_on_primary_monitor() &&
    !window.minimized &&
    window.get_window_type() !== Meta.WindowType.DESKTOP &&
    !window.skip_taskbar;

/**
 * Manages window events and tracks the behaviour detector's effect strength.
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
        this.behaviourDetector = null;

        this.eventManager = new EventManager();
        this.enabled = false;

        this.stateChangeCallback = () => {};

        this.workspace = null;
        this.inOverview = false;
        this.effectStrength = 0;
        this.lastState = null;
        this.workspaceTransitionGroup = null;
        this.workspaceTransitionProgressHandlerId = null;
        this.workspaceTransitionDestroyHandlerId = null;
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
     * @returns {Object} The current effect strength, workspace, and overview state
     */
    getCurrentState() {
        return {
            effectStrength: this.inOverview ? 0 : this.effectStrength,
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
     * Re-evaluates the active behaviour detector and emits a state change.
     * Used when the state needs to be refreshed regardless of detected changes
     */
    updateState(force = false, excludedWindowId = null) {
        this.effectStrength = this.getEffectStrength(excludedWindowId);
        if (!this.workspaceTransitionGroup)
            this.emitStateChange(force);
    }

    getWorkspaceAnimationController() {
        return wm?._workspaceAnimation;
    }

    getWorkspaceTransitionState(monitorGroup) {
        if (!Array.isArray(monitorGroup?._workspaceGroups) ||
            typeof monitorGroup.getSnapPoints !== 'function')
            return null;

        const workspaces = monitorGroup._workspaceGroups
            .map(group => group.workspace);

        return getWorkspaceTransition(
            workspaces,
            monitorGroup.getSnapPoints(),
            monitorGroup.progress
        );
    }

    updateWorkspaceTransition(monitorGroup) {
        const transition = this.getWorkspaceTransitionState(monitorGroup);
        if (!transition)
            return;

        const startStrength = this.getEffectStrengthForWorkspace(
            transition.startWorkspace
        );
        const endStrength = this.getEffectStrengthForWorkspace(
            transition.endWorkspace
        );

        this.stateChangeCallback({
            ...this.getCurrentState(),
            workspaceTransition: 'progress',
            startEffectStrength: startStrength,
            endEffectStrength: endStrength,
            transitionProgress: transition.progress
        });
    }

    finishWorkspaceTransition() {
        this.workspaceTransitionGroup = null;
        this.workspaceTransitionProgressHandlerId = null;
        this.workspaceTransitionDestroyHandlerId = null;
        this.workspace = this.workspaceManager.get_active_workspace();
        this.effectStrength = this.getEffectStrength();

        const currentState = this.getCurrentState();
        this.lastState = currentState;
        this.stateChangeCallback({
            ...currentState,
            workspaceTransition: 'complete'
        });
    }

    startWorkspaceTransition() {
        const monitorGroup = this.getWorkspaceAnimationController()
            ?._switchData?.baseMonitorGroup;
        if (!monitorGroup || monitorGroup === this.workspaceTransitionGroup)
            return;

        this.workspaceTransitionGroup = monitorGroup;
        this.workspaceTransitionProgressHandlerId = monitorGroup.connect(
            'notify::progress',
            group => this.updateWorkspaceTransition(group)
        );
        this.workspaceTransitionDestroyHandlerId = monitorGroup.connect(
            'destroy',
            () => this.finishWorkspaceTransition()
        );
        this.updateWorkspaceTransition(monitorGroup);
    }

    attachWorkspaceTransitionEvents() {
        const swipeTracker = this.getWorkspaceAnimationController()
            ?._swipeTracker;
        if (!swipeTracker)
            return;

        this.eventManager.attachGlobalEventOnce(
            WORKSPACE_SWIPE_BEGIN,
            swipeTracker,
            () => this.startWorkspaceTransition()
        );
    }

    detachWorkspaceTransitionEvents() {
        if (this.workspaceTransitionGroup &&
            this.workspaceTransitionProgressHandlerId) {
            this.workspaceTransitionGroup.disconnect(
                this.workspaceTransitionProgressHandlerId
            );
        }
        if (this.workspaceTransitionGroup &&
            this.workspaceTransitionDestroyHandlerId) {
            this.workspaceTransitionGroup.disconnect(
                this.workspaceTransitionDestroyHandlerId
            );
        }

        this.workspaceTransitionGroup = null;
        this.workspaceTransitionProgressHandlerId = null;
        this.workspaceTransitionDestroyHandlerId = null;
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
            this.updateState(true);
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

            this.behaviourDetector.attachWindowEvents(
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
        this.behaviourDetector.attachGlobalEvents(
            this.eventManager,
            force => this.updateState(force)
        );
        this.attachWorkspaceTransitionEvents();

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

        this.effectStrength = this.getEffectStrength();

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
        this.detachWorkspaceTransitionEvents();
        this.eventManager.disconnectAllEvents();
        this.display.list_all_windows().forEach(window => {
            this.eventManager.disconnectWindowEvents(window);
        });

        this.workspace = null;
        this.effectStrength = 0;
        this.inOverview = null;
        this.lastState = null;
        this.workspaceTransitionGroup = null;
        this.workspaceTransitionProgressHandlerId = null;
        this.workspaceTransitionDestroyHandlerId = null;
        this.enabled = false;
    }

    /**
     * Gets the current effect strength from visible windows
     *
     * @returns {number} The effect strength from zero to one
     */
    getEffectStrength(excludedWindowId = null) {
        return this.getEffectStrengthForWorkspace(
            this.workspace,
            excludedWindowId
        );
    }

    getEffectStrengthForWorkspace(workspace, excludedWindowId = null) {
        if (!workspace)
            return 0;

        const windows = workspace
            .list_windows()
            .filter(isApplicationWindow)
            .filter(window => window.get_id() !== excludedWindowId);

        return this.behaviourDetector.getEffectStrength(windows);
    }

    setBehaviourDetector(behaviourDetector) {
        if (this.behaviourDetector?.constructor === behaviourDetector.constructor)
            return;

        const wasEnabled = this.enabled;
        if (wasEnabled)
            this.disable();

        this.behaviourDetector = behaviourDetector;

        if (wasEnabled)
            this.enable();
    }
}
