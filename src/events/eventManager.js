import WindowEvents from './observers/windowsEvents/windowEvents.js';
import WorkspaceEvents from './observers/workspaceEvents.js';
import OverviewEvents from './observers/overviewEvents.js';
import MaximizedWindows from './observers/windowsEvents/windowsDetectors/maximizedWindows.js';
import ProximityWindows from './observers/windowsEvents/windowsDetectors/proximityWindows.js';
import { MAXIMIZED_BEHAVIOR, STYLE_TRIGGER } from '../constants.js';

const areSameState = (state1, state2) => {
    if ([state1, state2].includes(null))
        return false;
    if (state1.effectStrength !== state2.effectStrength)
        return false;
    if ([state1.currentWorkspace, state2.currentWorkspace].includes(undefined))
        return false;
    if (state1.currentWorkspace.index() !== state2.currentWorkspace.index())
        return false;

    return true;
};

export default class EventManager {
    #windows;
    #workspaces;
    #overview;

    constructor(onWindowState, onOverviewState) {
        this._onWindowState = onWindowState;
        this._onOverviewState = onOverviewState;
        this._lastState = null;
        const workspaceManager = global.get_workspace_manager();
        this.#windows = new WindowEvents(global.display, global.window_manager, workspaceManager);
        this.#windows.setStateChangeCallback((state, force) => {
            if (!this.#workspaces.transitioning)
                this.#emitWindowState(state, force);
        });
        this.#workspaces = new WorkspaceEvents(workspaceManager, state => this.#updateWorkspace(state));
        this.#overview = new OverviewEvents(() => this.#updateOverview());
    }

    configure(config, settings) {
        this.#workspaces.detachTransition();
        this._lastState = null;
        const detector = config.styleTrigger === STYLE_TRIGGER.PROXIMITY
            ? new ProximityWindows(settings) : new MaximizedWindows();
        this.#windows.setBehaviourDetector(detector);

        if (config.maximizedBehavior === MAXIMIZED_BEHAVIOR.KEEP_GRADIENT) {
            this.#workspaces.disable();
            this.#windows.disable();
        } else {
            this.#workspaces.enable();
            this.#windows.enable();
        }
        this.#updateOverview();
    }

    #emitWindowState(state, force = false) {
        if (force || !areSameState(this._lastState, state)) {
            this._lastState = state;
            this._onWindowState(state);
        }
    }

    #updateWorkspace(transition) {
        if (transition.type === 'change') {
            this.#windows.updateState(true);
            return;
        }

        const state = this.#windows.getCurrentState();
        if (transition.type === 'progress') {
            this._onWindowState({
                ...state,
                workspaceTransition: 'progress',
                startEffectStrength: this.#windows.getEffectStrengthForWorkspace(transition.startWorkspace),
                endEffectStrength: this.#windows.getEffectStrengthForWorkspace(transition.endWorkspace),
                transitionProgress: transition.progress
            });
        } else {
            this.#emitWindowState({ ...state, workspaceTransition: 'complete' }, true);
        }
    }

    #updateOverview() {
        // Overview takes ownership of rendering until it is fully hidden again.
        this.#workspaces.detachTransition();
        const { progress, hidden, target } = this.#overview;
        const strength = this.#windows.enabled ? this.#windows.getEffectStrength() : 0;
        this._onOverviewState({ progress, hidden, target }, strength);
    }

    destroy() {
        this.#overview.destroy();
        this.#workspaces.disable();
        this.#windows.disable();
        this._lastState = null;
    }
}
