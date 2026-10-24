import BackgroundBlend from './backgroundBlend.js';
import { setGradientClass } from './panelBackground.js';
import { applyGradientStyle, unloadGradientStylesheet } from './stylesheet.js';
import { MAXIMIZED_BEHAVIOR, OVERVIEW_BEHAVIOR, STYLE_TRIGGER } from '../constants.js';
import { GRADIENT_CLASS, MAXIMIZED_GRADIENT_CLASS, OVERVIEW_GRADIENT_CLASS } from './stylesheet.js';

const getWindowBlendProgress = (config, strength) => {
    if (config.maximizedBehavior === MAXIMIZED_BEHAVIOR.KEEP_GRADIENT)
        return 0;

    const progressive = config.styleTrigger === STYLE_TRIGGER.PROXIMITY &&
        config.proximityTransition && config.maximizedBehavior === MAXIMIZED_BEHAVIOR.APPLY_STYLE;
    return progressive ? strength : Number(strength > 0);
};

const getWindowBlendStyles = config => [
    { gradientClass: GRADIENT_CLASS },
    { gradientClass: config.maximizedBehavior === MAXIMIZED_BEHAVIOR.KEEP_THEME ? null : MAXIMIZED_GRADIENT_CLASS }
];

const getWorkspaceBlendProgress = (config, startStrength, endStrength, progress) => {
    const start = getWindowBlendProgress(config, startStrength);
    const end = getWindowBlendProgress(config, endStrength);
    return start + (end - start) * progress;
};

const getOverviewStyle = config => {
    let gradientClass = GRADIENT_CLASS;
    if (config.overviewBehavior === OVERVIEW_BEHAVIOR.KEEP_THEME)
        gradientClass = null;
    else if (config.overviewBehavior === OVERVIEW_BEHAVIOR.APPLY_STYLE)
        gradientClass = OVERVIEW_GRADIENT_CLASS;
    return { gradientClass, inOverview: true };
};

export default class Gradient {
    constructor(extensionPath) {
        this._extensionPath = extensionPath;
    }

    configure(config) {
        this.clearBlend();
        this._config = config;
        this._desktopStyles = getWindowBlendStyles(config);
        this._desktopProgress = 0;
        this._overviewTarget = null;
        this._strength = 0;
        applyGradientStyle(config, this._extensionPath);
    }

    updateWindow(state) {
        this._strength = state.effectStrength;
        if (this._overviewVisible)
            return;

        if (state.workspaceTransition === 'progress') {
            this.renderDesktop(getWorkspaceBlendProgress(
                this._config, state.startEffectStrength, state.endEffectStrength, state.transitionProgress
            ));
        } else {
            this.renderDesktop(getWindowBlendProgress(this._config, state.effectStrength),
                state.workspaceTransition !== 'complete');
        }
    }

    restoreDesktop(animate = false) {
        this.renderDesktop(getWindowBlendProgress(this._config, this._strength), animate);
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
                this.setStyle(progress === 0 ? source : target);
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

    updateOverview({ progress, hidden, target }, strength) {
        this._strength = strength;
        this._overviewVisible = !hidden || target;
        if (!this._config)
            return;

        if (this._overviewTarget === null)
            this.restoreDesktop();

        const targetChanged = target !== this._overviewTarget;
        this._overviewTarget = target;

        if (hidden && !target) {
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

        if (!targetChanged)
            return;

        if (target) {
            this.setStyle(getOverviewStyle(this._config));
            this.clearBlend();
        } else {
            this.restoreDesktop(true);
        }
    }

    destroy() {
        setGradientClass(null);
        this.clearBlend();
        unloadGradientStylesheet(this._extensionPath);
        this._config = null;
        this._baseStyle = null;
        this._desktopStyles = null;
    }
}
