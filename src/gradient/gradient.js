import BackgroundTransitions from './backgroundTransitions.js';
import { applyGradientStylesheet, unloadGradientStylesheet } from './stylesheet.js';
import { GRADIENT_CLASSES } from './stylesheet.js';
import { WINDOW_ENTER_DURATION_MS, WINDOW_EXIT_DURATION_MS, WORKSPACE_SWITCH_DURATION_MS } from './transitionTimings.js';
import { APPEARANCE_BEHAVIOR, APPEARANCE_STATE, getAppearanceName, getObservationNeeds, isProgressiveProximity } from './appearance.js';

const getAppearanceStyle = (config, state) => {
    const name = getAppearanceName(config, state);
    return { gradientClass: name === null ? null : GRADIENT_CLASSES[name] };
};

const getWindowBlendStyles = (config, needs) => {
    const main = getAppearanceStyle(config, APPEARANCE_STATE.NORMAL);
    return [main, needs.windows ? getAppearanceStyle(config, APPEARANCE_STATE.TRIGGERED) : main];
};

// map window strength to the configured blend without checking the trigger mode on every frame.
const calculateWindowBlendProgress = (strength, isWindowEffectEnabled, isProgressive) => {
    if (!isWindowEffectEnabled)
        return 0;
    return isProgressive ? strength : Number(strength > 0);
};

// use Shell's swipe progress to mix the two workspace endpoints.
const calculateWorkspaceBlendProgress = ({ startStrength, endStrength, progress }, isWindowEffectEnabled, isProgressive) => {
    const start = calculateWindowBlendProgress(startStrength, isWindowEffectEnabled, isProgressive);
    const end = calculateWindowBlendProgress(endStrength, isWindowEffectEnabled, isProgressive);
    return start + (end - start) * progress;
};

const getWindowTransitionDuration = (progress, isWorkspaceChanged = false) => {
    if (isWorkspaceChanged)
        return WORKSPACE_SWITCH_DURATION_MS;
    return progress > 0 ? WINDOW_ENTER_DURATION_MS : WINDOW_EXIT_DURATION_MS;
};

const getOverviewStyle = (config, needs) => {
    if (config.overviewBehavior === APPEARANCE_BEHAVIOR.DO_NOTHING)
        return null;
    if (!needs.overview)
        return getAppearanceStyle(config, APPEARANCE_STATE.NORMAL);
    return { ...getAppearanceStyle(config, APPEARANCE_STATE.OVERVIEW), isInOverview: true };
};

export default class Gradient {
    #transitions = new BackgroundTransitions();
    #config;
    #isProgressiveProximity;
    #isWindowEffectEnabled;

    configure(config, state) {
        const isStylesheetChanged = applyGradientStylesheet(config);
        this.#config = config;
        this.#isProgressiveProximity = isProgressiveProximity(config);
        const needs = getObservationNeeds(config);
        this.#isWindowEffectEnabled = needs.windows;
        const progress = state.workspaceTransition
            ? calculateWorkspaceBlendProgress(state.workspaceTransition, needs.windows, this.#isProgressiveProximity)
            : calculateWindowBlendProgress(state.window.effectStrength, needs.windows, this.#isProgressiveProximity);
        this.#transitions.configure({
            desktop: getWindowBlendStyles(config, needs),
            overview: getOverviewStyle(config, needs)
        }, {
            desktop: {
                progress,
                isAnimationRequested: state.workspaceTransition === null,
                duration: getWindowTransitionDuration(progress)
            },
            overview: state.overview,
            isFollowingGesture: needs.overviewProgress,
            isStylesheetChanged
        });
    }

    updateWindow({ effectStrength }, isWorkspaceChanged = false) {
        if (!this.#config)
            return;
        const progress = calculateWindowBlendProgress(effectStrength, this.#isWindowEffectEnabled, this.#isProgressiveProximity);
        this.#transitions.updateDesktop(progress, {
            isAnimationRequested: true,
            duration: getWindowTransitionDuration(progress, isWorkspaceChanged)
        });
    }

    followWindow({ effectStrength }) {
        if (!this.#config)
            return;
        this.#transitions.updateDesktop(calculateWindowBlendProgress(effectStrength, this.#isWindowEffectEnabled, this.#isProgressiveProximity));
    }

    updateWorkspaceProgress(transition) {
        if (!this.#config)
            return;
        this.#transitions.updateDesktop(calculateWorkspaceBlendProgress(transition, this.#isWindowEffectEnabled, this.#isProgressiveProximity));
    }

    completeWorkspace(state) {
        this.followWindow(state);
    }

    updateOverview({ progress, isHidden, isTargetVisible, effectStrength }) {
        this.#transitions.updateOverview({
            progress, isHidden, isTargetVisible,
            desktopProgress: this.#config
                ? calculateWindowBlendProgress(effectStrength, this.#isWindowEffectEnabled, this.#isProgressiveProximity) : 0
        });
    }

    destroy() {
        this.#transitions.destroy();
        unloadGradientStylesheet();
        this.#config = null;
    }
}
