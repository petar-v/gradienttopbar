import WindowEvents from './observers/windowsEvents/windowEvents.js';
import WorkspaceEvents from './observers/workspaceEvents.js';
import OverviewEvents from './observers/overviewEvents.js';
import { getObservationNeeds, isProgressiveProximity } from '../gradient/appearance.js';

const areWindowStatesEqual = (state1, state2) => {
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
    #lastWindowUpdateWasImmediate;

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
        this.#windows.setStateChangeCallback((state, force, geometryChanged) => {
            if (this.#workspaces.transitioning)
                this.#lastWindowState = state;
            else
                this.#emitWindowState(state, force, geometryChanged);
        });
        this.#workspaces = new WorkspaceEvents(workspaceManager, state => this.#handleWorkspaceEvent(state));
        this.#overview = new OverviewEvents(signal => this.#handleOverviewEvent(signal));
    }

    configure(config) {
        this._progressive = isProgressiveProximity(config);
        this.#lastWindowUpdateWasImmediate = false;
        const needs = getObservationNeeds(config);
        this.#configureWindowObservers(config, needs.windows);
        this.#configureOverviewObserver(needs);
        this.#workspaces.configure({ enabled: needs.windows, followProgress: needs.workspaceProgress });
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

    #configureWindowObservers(config, shouldObserveWindows) {
        this.#windows.configure({
            enabled: shouldObserveWindows,
            trigger: config.styleTrigger,
            distance: config.proximityDistance,
            progressive: config.proximityTransition
        });
    }

    #configureOverviewObserver(needs) {
        this._needsOverview = needs.overview;
        // A held presentation still needs its final hidden notification before becoming dormant.
        const finishingOverview = this.#overview.isObserving && (!this.#overview.isHidden || this.#overview.isTargetVisible);
        this.#overview.configure({
            shouldObserve: this._needsOverview || finishingOverview,
            followProgress: needs.overviewProgress
        });
    }

    #emitWindowState(state, force = false, geometryChanged = false) {
        // Geometry must take over a timed fade even when its destination has not changed.
        const takesOverFade = this._progressive && geometryChanged && !this.#lastWindowUpdateWasImmediate;
        if (force || takesOverFade || !areWindowStatesEqual(this.#lastWindowState, state)) {
            const isWorkspaceChanged = this.#lastWindowState?.currentWorkspace && state.currentWorkspace
                ? this.#lastWindowState.currentWorkspace.index() !== state.currentWorkspace.index() : false;
            this.#lastWindowState = state;
            this.#lastWindowUpdateWasImmediate = this._progressive && geometryChanged && !isWorkspaceChanged;
            if (this.#lastWindowUpdateWasImmediate)
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
            this.#lastWindowUpdateWasImmediate = true;
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
        if (isHidden && !this._needsOverview)
            this.#overview.configure({ shouldObserve: false, followProgress: false });
    }

    destroy() {
        this.#overview.destroy();
        this.#workspaces.disable();
        this.#windows.disable();
        this.#lastWindowState = null;
    }
}
