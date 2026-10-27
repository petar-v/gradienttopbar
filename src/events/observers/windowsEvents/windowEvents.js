import Meta from 'gi://Meta';
import { screenShield } from 'resource:///org/gnome/shell/ui/main.js';
import SignalConnections from '../../signalConnections.js';
import MaximizedWindows from './windowsDetectors/maximizedWindows.js';
import ProximityWindows from './windowsDetectors/proximityWindows.js';
import { STYLE_TRIGGER } from '../../../gradient/appearance.js';

// Ignore Desktop Icons NG's synthetic windows.
// FIXME: this causes the overview to close on login.
const isDesktopIconsNG = window => window.customJS_ding !== undefined;

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
    #detector = null;

    constructor(display, windowManager, workspaceManager) {
        this.display = display;
        this.windowManager = windowManager;
        this.workspaceManager = workspaceManager;
        this._signals = new SignalConnections();
        this.enabled = false;

        this.stateChangeCallback = () => {};
    }

    /**
     * Sets the callback function to be called when window state changes
     *
     * @param {Function} callback - The callback function that receives the current state
     */
    setStateChangeCallback(callback) {
        this.stateChangeCallback = callback;
    }

    getCurrentState(excludedWindowId = null) {
        const currentWorkspace = this.workspaceManager.get_active_workspace();
        return {
            effectStrength: this.getEffectStrengthForWorkspace(currentWorkspace, excludedWindowId),
            currentWorkspace
        };
    }

    updateState(force = false, excludedWindowId = null) {
        this.stateChangeCallback(this.getCurrentState(excludedWindowId), force);
    }

    /**
     * Enables window event tracking
     * Sets up all event listeners and initializes the current state
     */
    enable() {
        if (this.enabled)
            return;

        this.enabled = true;
        const attachWindowEvents = window => {
            if (!isDesktopIconsNG(window))
                this.#detector.attachWindowEvents(this._signals, window, () => this.updateState());
        };
        this._signals.connect(this.display, 'window-created', (_, window) => {
            attachWindowEvents(window);
            this.updateState();
        });
        this._signals.connect(this.windowManager, 'destroy', (_, actor) => {
            const window = actor.get_meta_window();
            this._signals.disconnect(window);
            this.updateState(false, window.get_id());
        });
        this._signals.connect(this.windowManager, 'minimize', (_, actor) => {
            this.updateState(false, actor.get_meta_window().get_id());
        });
        this._signals.connect(this.windowManager, 'unminimize', () => this.updateState());
        this._signals.connect(this.display, 'window-left-monitor', () => this.updateState());
        this.#detector.attachGlobalEvents(this._signals, force => this.updateState(force));
        this.display.list_all_windows().forEach(attachWindowEvents);
        // Screen unlock can require a refresh even if the detected state is unchanged.
        this._signals.connect(screenShield, 'unlock-screen', () => this.updateState(true));
        this.updateState();
    }

    /**
     * Disables window event tracking
     * Cleans up all event listeners and resets the state
     */
    disable() {
        this._signals.disconnectAll();
        this.enabled = false;
    }

    /**
     * Gets the current effect strength from visible windows
     *
     * @returns {number} The effect strength from zero to one
     */
    getEffectStrength(excludedWindowId = null) {
        return this.getEffectStrengthForWorkspace(
            this.workspaceManager.get_active_workspace(), excludedWindowId
        );
    }

    getEffectStrengthForWorkspace(workspace, excludedWindowId = null) {
        if (!workspace)
            return 0;

        const windows = workspace.list_windows()
            .filter(isApplicationWindow)
            .filter(window => window.get_id() !== excludedWindowId);
        return this.#detector.getEffectStrength(windows);
    }

    configureDetector(trigger, distance) {
        const Detector = trigger === STYLE_TRIGGER.PROXIMITY
            ? ProximityWindows : MaximizedWindows;

        if (this.#detector?.constructor !== Detector) {
            const wasEnabled = this.enabled;
            if (wasEnabled)
                this.disable();

            this.#detector = new Detector(distance);
            if (wasEnabled)
                this.enable();
        }

        if (Detector === ProximityWindows)
            this.#detector.distance = distance;
    }
}
