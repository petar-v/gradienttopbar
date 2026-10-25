import BackgroundTransitions from './backgroundTransitions.js';
import { applyGradientStyle, unloadGradientStylesheet } from './stylesheet.js';
import { GRADIENT_CLASSES } from './stylesheet.js';
import { APPEARANCE_BEHAVIOR, APPEARANCE_STATE, STYLE_TRIGGER, getAppearanceName } from './appearance.js';

const getAppearanceStyle = (config, state) => {
    const name = getAppearanceName(config, state);
    return { gradientClass: name === null ? null : GRADIENT_CLASSES[name] };
};

const getWindowBlendProgress = (config, strength) => {
    if (config.windowBehavior === APPEARANCE_BEHAVIOR.KEEP_GRADIENT)
        return 0;

    const progressive = config.styleTrigger === STYLE_TRIGGER.PROXIMITY &&
        config.proximityTransition;
    return progressive ? strength : Number(strength > 0);
};

const getWindowBlendStyles = config => [
    getAppearanceStyle(config, APPEARANCE_STATE.NORMAL),
    getAppearanceStyle(config, APPEARANCE_STATE.TRIGGERED)
];

const getWorkspaceBlendProgress = (config, { startStrength, endStrength, progress }) => {
    const start = getWindowBlendProgress(config, startStrength);
    const end = getWindowBlendProgress(config, endStrength);
    return start + (end - start) * progress;
};

const getOverviewStyle = config => ({
    ...getAppearanceStyle(config, APPEARANCE_STATE.OVERVIEW),
    inOverview: true
});

export default class Gradient {
    constructor() {
        this._transitions = new BackgroundTransitions();
    }

    configure(config, state) {
        applyGradientStyle(config);
        this._config = config;
        this._transitions.configure({
            desktop: getWindowBlendStyles(config),
            overview: getOverviewStyle(config)
        }, {
            desktop: {
                progress: state.workspaceTransition
                    ? getWorkspaceBlendProgress(config, state.workspaceTransition)
                    : getWindowBlendProgress(config, state.window.effectStrength),
                animate: state.workspaceTransition === null
            },
            overview: state.overview,
            followGesture: config.overviewTransition
        });
    }

    updateWindow({ effectStrength }) {
        if (!this._config)
            return;
        this._transitions.updateDesktop(
            getWindowBlendProgress(this._config, effectStrength), { animate: true }
        );
    }

    updateWorkspaceProgress(transition) {
        if (!this._config)
            return;
        this._transitions.updateDesktop(getWorkspaceBlendProgress(this._config, transition));
    }

    completeWorkspace({ effectStrength }) {
        if (!this._config)
            return;
        this._transitions.updateDesktop(getWindowBlendProgress(this._config, effectStrength));
    }

    updateOverview({ progress, hidden, target, effectStrength }) {
        this._transitions.updateOverview({
            progress, hidden, target,
            desktopProgress: this._config ? getWindowBlendProgress(this._config, effectStrength) : 0
        });
    }

    destroy() {
        this._transitions.destroy();
        unloadGradientStylesheet();
        this._config = null;
    }
}
