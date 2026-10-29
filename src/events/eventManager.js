import WindowEvents from './observers/windowsEvents/windowEvents.js';
import WorkspaceEvents from './observers/workspaceEvents.js';
import OverviewEvents from './observers/overviewEvents.js';
import { APPEARANCE_BEHAVIOR } from '../gradient/appearance.js';

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

    constructor({
        onWindowChanged,
        onWorkspaceProgress,
        onWorkspaceCompleted,
        onOverviewChanged
    }) {
        this._onWindowChanged = onWindowChanged;
        this._onWorkspaceProgress = onWorkspaceProgress;
        this._onWorkspaceCompleted = onWorkspaceCompleted;
        this._onOverviewChanged = onOverviewChanged;
        this._lastState = null;

        const workspaceManager = global.get_workspace_manager();

        this.#windows = new WindowEvents(global.display, global.window_manager, workspaceManager);
        this.#windows.setStateChangeCallback((state, force) => {
            if (this.#workspaces.transitioning)
                this._lastState = state;
            else
                this.#emitWindowState(state, force);
        });
        this.#workspaces = new WorkspaceEvents(workspaceManager, state => this.#updateWorkspace(state));
        this.#overview = new OverviewEvents(signal => this.#updateOverview(signal));
    }

    configure(config) {
        const shouldObserveWindows = config.windowBehavior !== APPEARANCE_BEHAVIOR.KEEP_GRADIENT;
        this.#configureWindowObservers(config, shouldObserveWindows);
        this.#configureOverviewObserver(config, shouldObserveWindows);

        const window = this.#windows.getCurrentState();
        this._lastState = window;
        const { progress, hidden, target } = this.#overview;
        return {
            window,
            workspaceTransition: this.#workspaceTransition(this.#workspaces.transition),
            overview: { progress, hidden, target }
        };
    }

    #configureWindowObservers(config, shouldObserveWindows) {
        this.#windows.configure({
            enabled: shouldObserveWindows,
            trigger: config.styleTrigger,
            distance: config.proximityDistance,
            progressive: config.proximityTransition
        });
        if (shouldObserveWindows)
            this.#workspaces.enable();
        else
            this.#workspaces.disable();
    }

    #configureOverviewObserver(config, shouldObserveWindows) {
        const overviewOverride = config.overviewBehavior !== APPEARANCE_BEHAVIOR.DO_NOTHING;
        this._needsOverview = shouldObserveWindows || overviewOverride;
        // A held presentation still needs its final hidden notification before becoming dormant.
        const finishingOverview = this.#overview.isObserving && (!this.#overview.hidden || this.#overview.target);
        this.#overview.configure({
            shouldObserve: this._needsOverview || finishingOverview,
            followProgress: overviewOverride && config.overviewTransition
        });
    }

    #emitWindowState(state, force = false) {
        if (force || !areSameState(this._lastState, state)) {
            this._lastState = state;
            this._onWindowChanged(state);
        }
    }

    #updateWorkspace(transition) {
        if (transition.type === 'change') {
            this.#windows.updateState(true);
            return;
        }

        if (transition.type === 'progress') {
            this._onWorkspaceProgress(this.#workspaceTransition(transition));
        } else {
            const state = this.#windows.getCurrentState();
            this._lastState = state;
            this._onWorkspaceCompleted(state);
        }
    }

    #workspaceTransition(transition) {
        if (!transition)
            return null;
        const startStrength = this.#windows.getEffectStrengthForWorkspace(transition.startWorkspace);
        return {
            startStrength,
            endStrength: transition.startWorkspace === transition.endWorkspace
                ? startStrength : this.#windows.getEffectStrengthForWorkspace(transition.endWorkspace),
            progress: transition.progress
        };
    }

    #updateOverview(signal) {
        // Overview takes ownership of rendering until it is fully hidden again.
        this.#workspaces.detachTransition();
        const { progress, hidden, target } = this.#overview;
        if (signal === 'hiding' || signal === 'hidden')
            this._lastState = this.#windows.getCurrentState();
        this._onOverviewChanged({ progress, hidden, target, effectStrength: this._lastState.effectStrength });
        if (hidden && !this._needsOverview)
            this.#overview.configure({ shouldObserve: false, followProgress: false });
    }

    destroy() {
        this.#overview.destroy();
        this.#workspaces.disable();
        this.#windows.disable();
        this._lastState = null;
    }
}
