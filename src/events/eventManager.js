import WindowEvents from './observers/windowsEvents/windowEvents.js';
import WorkspaceEvents from './observers/workspaceEvents.js';
import OverviewEvents from './observers/overviewEvents.js';
import { getObservationNeeds, isProgressiveProximity, isShellOverviewPassive } from '../gradient/appearance.js';

const isWindowStateEqual = (state1, state2) => {
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
    #lastWindowState;
    #isLastWindowUpdateImmediate;
    #isOverviewCleanupNeeded = false;
    #config;
    #isProgressive;
    #isOverviewLifecycleNeeded;

    constructor({
        onWindowChanged,
        onWindowProgress,
        onWorkspaceProgress,
        onWorkspaceCompleted,
        onOverviewChanged
    }) {
        this._onWindowChanged = onWindowChanged;
        this._onWindowProgress = onWindowProgress;
        this._onWorkspaceProgress = onWorkspaceProgress;
        this._onWorkspaceCompleted = onWorkspaceCompleted;
        this._onOverviewChanged = onOverviewChanged;
        this.#lastWindowState = null;

        const workspaceManager = global.get_workspace_manager();

        this.#windows = new WindowEvents(global.display, global.window_manager, workspaceManager);
        this.#windows.setStateChangeCallback((state, isForced, isGeometryChanged) => {
            if (this.#workspaces.isTransitioning)
                this.#lastWindowState = state;
            else
                this.#emitWindowState(state, isForced, isGeometryChanged);
        });
        this.#workspaces = new WorkspaceEvents(workspaceManager, state => this.#handleWorkspaceEvent(state));
        this.#overview = new OverviewEvents(signal => this.#handleOverviewEvent(signal));
    }

    configure(config) {
        this.#config = config;
        this.#isProgressive = isProgressiveProximity(config);
        this.#isLastWindowUpdateImmediate = false;
        const needs = getObservationNeeds(config);
        this.#configureWindowObservers(config, needs.isWindowObservationNeeded);
        this.#configureOverviewObserver(config, needs);
        this.#workspaces.configure({ isEnabled: needs.isWindowObservationNeeded, isFollowingProgress: needs.isWorkspaceProgressNeeded });
        if (!this.#overview.isHidden || this.#overview.isTargetVisible)
            this.#workspaces.stopObservingWorkspaceSwipe();

        const window = this.#windows.getCurrentState();
        this.#lastWindowState = window;
        const { progress, isHidden, isTargetVisible } = this.#overview;
        return {
            window,
            workspaceTransition: this.#getWorkspaceBlendState(this.#workspaces.transition),
            overview: { progress, isHidden, isTargetVisible }
        };
    }

    // The owner exposes only this lifecycle requirement, never its actors or blend state.
    setOverviewCleanupNeeded(isOverviewCleanupNeeded) {
        if (this.#isOverviewCleanupNeeded === isOverviewCleanupNeeded)
            return;
        this.#isOverviewCleanupNeeded = isOverviewCleanupNeeded;
        if (this.#config)
            this.#configureOverviewObserver(this.#config, getObservationNeeds(this.#config));
    }

    #configureWindowObservers(config, isWindowObservationNeeded) {
        this.#windows.configure({
            isEnabled: isWindowObservationNeeded,
            trigger: config.styleTrigger,
            distance: config.proximityDistance,
            isProgressive: config.proximityTransition
        });
    }

    #configureOverviewObserver(config, needs) {
        this.#isOverviewLifecycleNeeded = needs.isOverviewObservationNeeded && !isShellOverviewPassive(config);
        let signals = [];
        if (this.#isOverviewLifecycleNeeded) {
            signals = ['showing', 'hiding'];
            if (needs.isOverviewProgressNeeded)
                signals.push('hidden');
        }
        if (needs.isOverviewObservationNeeded && this.#isOverviewCleanupNeeded)
            signals = ['showing', 'hiding', 'hidden'];
        this.#overview.configure({ signals, isFollowingProgress: needs.isOverviewProgressNeeded });
    }

    #emitWindowState(state, isForced = false, isGeometryChanged = false) {
        // Geometry must take over a timed fade even when its destination has not changed.
        const isFadeTakeover = this.#isProgressive && isGeometryChanged && !this.#isLastWindowUpdateImmediate;
        if (isForced || isFadeTakeover || !isWindowStateEqual(this.#lastWindowState, state)) {
            const isWorkspaceChanged = this.#lastWindowState?.currentWorkspace && state.currentWorkspace
                ? this.#lastWindowState.currentWorkspace.index() !== state.currentWorkspace.index() : false;
            this.#lastWindowState = state;
            this.#isLastWindowUpdateImmediate = this.#isProgressive && isGeometryChanged && !isWorkspaceChanged;
            if (this.#isLastWindowUpdateImmediate)
                this._onWindowProgress(state);
            else
                this._onWindowChanged(state, isWorkspaceChanged);
        }
    }

    #handleWorkspaceEvent(transition) {
        if (transition.type === 'change') {
            this.#windows.updateState(true);
            return;
        }

        if (transition.type === 'progress') {
            this._onWorkspaceProgress(this.#getWorkspaceBlendState(transition));
        } else {
            const state = this.#windows.getCurrentState();
            this.#lastWindowState = state;
            this.#isLastWindowUpdateImmediate = true;
            this._onWorkspaceCompleted(state);
        }
    }

    #getWorkspaceBlendState(transition) {
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

    #handleOverviewEvent(signal) {
        // Overview takes ownership of rendering until it is fully hidden again.
        this.#workspaces.stopObservingWorkspaceSwipe();
        const { progress, isHidden, isTargetVisible } = this.#overview;
        if (signal === 'hiding' || signal === 'hidden')
            this.#lastWindowState = this.#windows.getCurrentState();
        this._onOverviewChanged({ progress, isHidden, isTargetVisible, effectStrength: this.#lastWindowState.effectStrength });
        if (isHidden && !this.#isOverviewLifecycleNeeded && !this.#isOverviewCleanupNeeded)
            this.#overview.configure({});
    }

    destroy() {
        this.#overview.destroy();
        this.#workspaces.disable();
        this.#windows.disable();
        this.#lastWindowState = null;
    }
}
