import { panel } from 'resource:///org/gnome/shell/ui/main.js';
import BackgroundTransitions from './backgroundTransitions.js';
import { applyGradientStylesheet, unloadGradientStylesheet } from './stylesheet.js';
import { GRADIENT_CLASSES, RESTORING_CLASS } from './stylesheet.js';
import { WINDOW_ENTER_DURATION_MS, WINDOW_EXIT_DURATION_MS, WORKSPACE_SWITCH_DURATION_MS } from './transitionTimings.js';
import { APPEARANCE_BEHAVIOR, APPEARANCE_STATE, getAppearanceName, getObservationNeeds, isProgressiveProximity, isShellOverviewPassive } from './appearance.js';

const getAppearanceStyle = (config, state) => {
    const name = getAppearanceName(config, state);
    return { gradientClass: name === null ? null : GRADIENT_CLASSES[name] };
};

const getWindowBlendStyles = (config, needs) => {
    const main = getAppearanceStyle(config, APPEARANCE_STATE.NORMAL);
    return [main, needs.isWindowObservationNeeded ? getAppearanceStyle(config, APPEARANCE_STATE.TRIGGERED) : main];
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
    if (!needs.isOverviewObservationNeeded)
        return getAppearanceStyle(config, APPEARANCE_STATE.NORMAL);
    return { ...getAppearanceStyle(config, APPEARANCE_STATE.OVERVIEW), isInOverview: true };
};

export default class Gradient {
    #transitions;
    #config;
    #isProgressiveProximity;
    #isWindowEffectEnabled;
    #onOverviewCleanupChanged;

    constructor(onOverviewCleanupChanged) {
        this.#onOverviewCleanupChanged = onOverviewCleanupChanged;
    }

    configure(config, state) {
        panel.add_style_class_name(RESTORING_CLASS);
        panel.ensure_style();
        this.#transitions?.captureNativeDestination();
        try {
            const isStylesheetChanged = applyGradientStylesheet(config);
            this.#transitions ??= new BackgroundTransitions(this.#onOverviewCleanupChanged);
            this.#config = config;
            this.#isProgressiveProximity = isProgressiveProximity(config);
            const needs = getObservationNeeds(config);
            this.#isWindowEffectEnabled = needs.isWindowObservationNeeded;
            const progress = state.workspaceTransition
                ? calculateWorkspaceBlendProgress(state.workspaceTransition, needs.isWindowObservationNeeded, this.#isProgressiveProximity)
                : calculateWindowBlendProgress(state.window.effectStrength, needs.isWindowObservationNeeded, this.#isProgressiveProximity);
            const desktopStyles = getWindowBlendStyles(config, needs);
            this.#transitions.configure({
                desktop: desktopStyles,
                overview: getOverviewStyle(config, needs)
            }, {
                desktop: {
                    progress,
                    isAnimationRequested: state.workspaceTransition === null,
                    duration: getWindowTransitionDuration(progress)
                },
                overview: state.overview,
                isShellOverviewEnabled: isShellOverviewPassive(config),
                isFollowingGesture: needs.isOverviewProgressNeeded,
                isStylesheetChanged
            });
        } finally {
            panel.ensure_style();
            panel.remove_style_class_name(RESTORING_CLASS);
            panel.ensure_style();
        }
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
        this.#transitions?.updateOverview({
            progress, isHidden, isTargetVisible,
            desktopProgress: this.#config
                ? calculateWindowBlendProgress(effectStrength, this.#isWindowEffectEnabled, this.#isProgressiveProximity) : 0
        });
    }

    destroy() {
        panel.add_style_class_name(RESTORING_CLASS);
        panel.ensure_style();
        this.#transitions?.destroy();
        panel.ensure_style();
        panel.remove_style_class_name(RESTORING_CLASS);
        panel.ensure_style();
        this.#transitions = null;
        unloadGradientStylesheet();
        this.#config = null;
    }
}
