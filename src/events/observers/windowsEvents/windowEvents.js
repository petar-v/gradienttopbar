import Meta from 'gi://Meta';
import { layoutManager, screenShield } from 'resource:///org/gnome/shell/ui/main.js';
import SignalConnections from '../../signalConnections.js';
import MaximizedWindows from './windowsDetectors/maximizedWindows.js';
import ProximityWindows from './windowsDetectors/proximityWindows.js';
import { STYLE_TRIGGER } from '../../../gradient/appearance.js';

// Ignore Desktop Icons NG's synthetic windows.
// FIXME: this causes the overview to close on login.
const isDesktopIconsWindow = window => window.customJS_ding !== undefined;

const canWindowAffectPanel = window =>
    !isDesktopIconsWindow(window) &&
    window.is_on_primary_monitor() &&
    !window.minimized &&
    window.get_window_type() !== Meta.WindowType.DESKTOP &&
    !window.skip_taskbar;

// filter as we go so the detector can stop without checking every window.
// skip the closing/minimizing window too, since its flags or the window list might not have caught up yet.
function* getWindowsAffectingPanel(windows, ignoredWindowId) {
    for (const window of windows) {
        if (canWindowAffectPanel(window) && window.get_id() !== ignoredWindowId)
            yield window;
    }
}

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
        this._updateLaterId = null;
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

    getCurrentState(ignoredWindowId = null) {
        return {
            effectStrength: this.#getEffectStrength(ignoredWindowId),
            currentWorkspace: this.workspaceManager.get_active_workspace()
        };
    }

    updateState(force = false, ignoredWindowId = null, geometryChanged = false) {
        this.#cancelUpdate();
        if (this.enabled)
            this.stateChangeCallback(this.getCurrentState(ignoredWindowId), force, geometryChanged);
    }

    #scheduleUpdate(window) {
        if (!this.enabled || !canWindowAffectPanel(window) ||
            !window.located_on_workspace(this.workspaceManager.get_active_workspace()))
            return;
        if (this._updateLaterId)
            return;
        this._updateLaterId = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._updateLaterId = null;
            this.updateState(false, null, true);
            return false;
        });
    }

    #cancelUpdate() {
        if (this._updateLaterId) {
            global.compositor.get_laters().remove(this._updateLaterId);
            this._updateLaterId = null;
        }
    }

    /**
     * Enables window event tracking
     * Sets up event listeners without publishing an intermediate configuration
     */
    #enable() {
        if (this.enabled)
            return;

        this.enabled = true;
        const attachWindowEvents = window => {
            if (!isDesktopIconsWindow(window)) {
                this.#detector.attachWindowEvents(this._signals, window, {
                    geometryChanged: () => this.#scheduleUpdate(window),
                    workspaceChanged: () => this.updateState()
                });
            }
        };
        this._signals.connect(this.display, 'window-created', (_, window) => {
            attachWindowEvents(window);
            this.updateState();
        });
        // these signals can fire before the window list or minimized flag catches up.
        // ignore the window for this scan so it doesn't keep the panel triggered.
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
        // both detectors depend on which monitor owns the panel.
        this._signals.connect(layoutManager, 'monitors-changed', () => this.updateState(true));
        this.display.list_all_windows().forEach(attachWindowEvents);
        // Screen unlock can require a refresh even if the detected state is unchanged.
        this._signals.connect(screenShield, 'unlock-screen', () => this.updateState(true));
    }

    /**
     * Disables window event tracking
     * Cleans up all event listeners and resets the state
     */
    disable() {
        this.#cancelUpdate();
        this._signals.disconnectAll();
        this.enabled = false;
    }

    /**
     * Gets the current effect strength from visible windows
     *
     * @returns {number} The effect strength from zero to one
     */
    #getEffectStrength(ignoredWindowId = null) {
        if (!this.enabled)
            return 0;
        return this.getEffectStrengthForWorkspace(
            this.workspaceManager.get_active_workspace(), ignoredWindowId
        );
    }

    getEffectStrengthForWorkspace(workspace, ignoredWindowId = null) {
        if (!this.enabled || !workspace)
            return 0;

        return this.#detector.getEffectStrength(getWindowsAffectingPanel(workspace.list_windows(), ignoredWindowId));
    }

    configure({ enabled, trigger, distance, progressive }) {
        this.#cancelUpdate();
        if (!enabled) {
            this.disable();
            return;
        }
        const Detector = trigger === STYLE_TRIGGER.PROXIMITY
            ? ProximityWindows : MaximizedWindows;

        if (this.#detector?.constructor !== Detector) {
            this.disable();
            this.#detector = new Detector(distance);
        }

        if (Detector === ProximityWindows) {
            this.#detector.distance = distance;
            this.#detector.progressive = progressive;
        }
        this.#enable();
    }
}
