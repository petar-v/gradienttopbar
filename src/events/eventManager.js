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
            if (!this.#workspaces.transitioning)
                this.#emitWindowState(state, force);
        });
        this.#workspaces = new WorkspaceEvents(workspaceManager, state => this.#updateWorkspace(state));
        this.#overview = new OverviewEvents(() => this.#updateOverview());
    }

    configure(config) {
        // enabling or replacing a detector can emit synchronously, so commit only the final snapshot.
        this._configuring = true;
        try {
            this.#windows.configureDetector(config.styleTrigger, config.proximityDistance);

            if (config.windowBehavior === APPEARANCE_BEHAVIOR.KEEP_GRADIENT) {
                this.#workspaces.disable();
                this.#windows.disable();
            } else {
                this.#workspaces.enable();
                this.#windows.enable();
            }
        } finally {
            this._configuring = false;
        }
        const window = this.#windowState();
        this._lastState = window;
        const { progress, hidden, target } = this.#overview;
        return {
            window: { effectStrength: window.effectStrength },
            workspaceTransition: this.#workspaceTransition(this.#workspaces.transition),
            overview: { progress, hidden, target }
        };
    }

    #emitWindowState(state, force = false) {
        if (this._configuring)
            return;
        if (force || !areSameState(this._lastState, state)) {
            this._lastState = state;
            this._onWindowChanged({ effectStrength: state.effectStrength });
        }
    }

    #updateWorkspace(transition) {
        if (transition.type === 'change') {
            this.#windows.updateState(true);
            return;
        }

        if (transition.type === 'progress') {
            this._onWorkspaceProgress(this.#workspaceTransition(transition));
        } else if (!this._configuring) {
            const state = this.#windowState();
            this._lastState = state;
            this._onWorkspaceCompleted({ effectStrength: state.effectStrength });
        }
    }

    #windowState() {
        const state = this.#windows.getCurrentState();
        if (!this.#windows.enabled)
            state.effectStrength = 0;
        return state;
    }

    #workspaceTransition(transition) {
        return transition ? {
            startStrength: this.#windows.getEffectStrengthForWorkspace(transition.startWorkspace),
            endStrength: this.#windows.getEffectStrengthForWorkspace(transition.endWorkspace),
            progress: transition.progress
        } : null;
    }

    #updateOverview() {
        // Overview takes ownership of rendering until it is fully hidden again.
        this.#workspaces.detachTransition();
        const { progress, hidden, target } = this.#overview;
        const effectStrength = this.#windows.enabled ? this.#windows.getEffectStrength() : 0;
        this._onOverviewChanged({ progress, hidden, target, effectStrength });
    }

    destroy() {
        this.#overview.destroy();
        this.#workspaces.disable();
        this.#windows.disable();
        this._lastState = null;
    }
}
