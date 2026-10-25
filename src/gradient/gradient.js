import BackgroundBlend from './backgroundBlend.js';
import { setGradientClass } from './panelBackground.js';
import { applyGradientStyle, unloadGradientStylesheet } from './stylesheet.js';
import { MAXIMIZED_BEHAVIOR, STYLE_TRIGGER } from '../constants.js';
import { GRADIENT_CLASS, MAXIMIZED_GRADIENT_CLASS, OVERVIEW_GRADIENT_CLASS } from './stylesheet.js';
import { APPEARANCE_STATE, getAppearance } from './appearance.js';

const getAppearanceStyle = (config, state) => {
    const appearance = getAppearance(config, state);
    return {
        gradientClass: appearance ? {
            main: GRADIENT_CLASS,
            alternate: MAXIMIZED_GRADIENT_CLASS,
            overview: OVERVIEW_GRADIENT_CLASS
        }[appearance.name] : null
    };
};

const getWindowBlendProgress = (config, strength) => {
    if (config.maximizedBehavior === MAXIMIZED_BEHAVIOR.KEEP_GRADIENT)
        return 0;

    const progressive = config.styleTrigger === STYLE_TRIGGER.PROXIMITY &&
        config.proximityTransition;
    return progressive ? strength : Number(strength > 0);
};

const getWindowBlendStyles = config => [
    getAppearanceStyle(config, APPEARANCE_STATE.NORMAL),
    getAppearanceStyle(config, APPEARANCE_STATE.TRIGGERED)
];

const getWorkspaceBlendProgress = (config, startStrength, endStrength, progress) => {
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
        this._desktopProgress = 0;
        this._overviewTarget = null;
        this._strength = 0;
        this._windowState = { effectStrength: 0 };
        this._overviewState = { progress: null, hidden: true, target: false };
    }

    configure(config, state) {
        const previous = this._config;
        const styles = getWindowBlendStyles(config);
        const desktopChanged = previous && (
            this._desktopStyles[1].gradientClass !== styles[1].gradientClass ||
            getWindowBlendProgress(previous, this._strength) !==
                getWindowBlendProgress(config, state?.window.effectStrength ?? this._strength)
        );
        applyGradientStyle(config);
        this._config = config;
        this._desktopStyles = styles;
        if (state) {
            this._windowState = state.window;
            this._overviewState = state.overview;
            this._strength = state.window.effectStrength;
        }
        if (this._blendKind === 'desktop') {
            this._blend.updateStyles(...this._desktopStyles);
        } else if (this._blendKind === 'overview') {
            const source = desktopChanged ? this.getDesktopStyle() : this._blend.sourceStyle;
            this._blend.updateStyles(source, getOverviewStyle(config));
            this.setStyle(getOverviewStyle(config));
        }
        this.updateOverview(this._overviewState, this._strength, true);
    }

    updateWindow(state) {
        this._windowState = state;
        this._strength = state.effectStrength;
        if (this._overviewVisible)
            return;

        if (state.workspaceTransition === 'progress') {
            const progress = getWorkspaceBlendProgress(this._config,
                state.startEffectStrength, state.endEffectStrength, state.transitionProgress);
            this.renderDesktop(progress);
        } else {
            this.restoreDesktop(state.workspaceTransition !== 'complete');
        }
    }

    restoreDesktop(animate = false) {
        this.renderDesktop(getWindowBlendProgress(this._config, this._strength), animate);
    }

    getDesktopStyle() {
        const progress = getWindowBlendProgress(this._config, this._strength);
        if (progress === 0 || progress === 1)
            return this._desktopStyles[progress];
        return {
            progress,
            layers: this._desktopStyles
        };
    }

    setStyle(style) {
        setGradientClass(style.gradientClass);
        this._baseStyle = style;
    }

    clearBlend() {
        if (this._blendKind === 'desktop')
            this._desktopProgress = this._blend.progress;
        this._blend?.destroy();
        this._blend = null;
        this._blendKind = null;
    }

    renderDesktop(progress, animate = false) {
        const [source, target] = this._desktopStyles;
        if (!this._blend && progress === this._desktopProgress && (progress === 0 || progress === 1)) {
            this.setStyle(progress === 0 ? source : target);
            return;
        }

        if (this._blendKind !== 'desktop') {
            this.setStyle(source);
            this.clearBlend();
            this._blend = new BackgroundBlend(source, target);
            this._blendKind = 'desktop';
            this._blend.setProgress(this._desktopProgress);
        }
        const complete = () => {
            this._desktopProgress = progress;
            if (progress === 0 || progress === 1) {
                this.setStyle(this._desktopStyles[progress]);
                this.clearBlend();
            }
        };
        if (animate && progress !== this._blend.progress) {
            this._blend.animateTo(progress, complete);
        } else {
            this._blend.setProgress(progress);
            complete();
        }
    }

    updateOverview({ progress, hidden, target }, strength, reconfigure = false) {
        this._overviewState = { progress, hidden, target };
        this._strength = strength;
        // Overview cancels workspace gestures; its exit must use the current desktop state.
        if (!hidden || target || this._overviewVisible)
            this._windowState = { effectStrength: strength };
        this._overviewVisible = !hidden || target;
        if (!this._config)
            return;

        if (this._overviewTarget === null && (!hidden || target))
            this.restoreDesktop();

        const targetChanged = target !== this._overviewTarget;
        this._overviewTarget = target;

        if (hidden && !target) {
            if (reconfigure)
                this.updateWindow(this._windowState);
            else
                this.restoreDesktop();
            return;
        }

        if (this._config.overviewTransition && progress !== null) {
            // Refresh the desktop endpoint on exit; it may have changed while overview was open.
            if (this._blendKind === 'overview' && this._blend.progress === 1 && progress < 1)
                this.restoreDesktop();
            if (this._blendKind !== 'overview') {
                const source = this._blend?.getStyle() ?? this._baseStyle;
                const destination = getOverviewStyle(this._config);
                this.setStyle(destination);
                this.clearBlend();
                this._blend = new BackgroundBlend(source, destination);
                this._blendKind = 'overview';
            }
            this._blend.setProgress(progress);
            return;
        }

        if (!targetChanged && !reconfigure)
            return;

        if (this._blendKind === 'overview') {
            this._blend.animateTo(target ? 1 : 0, () => {
                if (target)
                    this.setStyle(getOverviewStyle(this._config));
                this.clearBlend();
                if (!target)
                    this.restoreDesktop();
            });
        } else if (target) {
            const destination = getOverviewStyle(this._config);
            this.setStyle(destination);
            this.clearBlend();
        } else {
            this.restoreDesktop(true);
        }
    }

    destroy() {
        setGradientClass(null);
        this.clearBlend();
        unloadGradientStylesheet();
        this._config = null;
        this._baseStyle = null;
        this._desktopStyles = null;
    }
}
