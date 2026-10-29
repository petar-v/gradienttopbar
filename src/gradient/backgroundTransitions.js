import BackgroundBlend from './backgroundBlend.js';
import { isBackgroundStyleEqual, setGradientClass } from './panelBackground.js';
import { OVERVIEW_ENTER_DURATION_MS, OVERVIEW_EXIT_DURATION_MS } from './transitionTimings.js';

// use endpoint styles as-is, and keep intermediate progress as a composition.
const getBackgroundAtProgress = (backgrounds, progress) => {
    const [source, target] = backgrounds;
    if (progress === 0 || progress === 1)
        return backgrounds[progress];
    return { source, target, progress };
};

/**
 * Owns the presentation state described in backgroundTransitions.smcat.
 * A blend can remain stationary between endpoints; it need not be animating.
 */
export default class BackgroundTransitions {
    #presentation = { kind: 'settled', style: null };
    #rememberedDesktopProgress = 0;
    #desktop = { progress: 0, isAnimationRequested: false };
    #overview = { progress: null, isHidden: true, isTargetVisible: false };
    #appearances = null;
    #isFollowingGesture = false;

    /**
     * Install resolved {desktop: [normal, triggered], overview} styles and inputs
     * together, so reconfiguration never renders an intermediate snapshot.
     * A null overview style holds the current presentation instead of overriding it.
     */
    configure(appearances, { desktop, overview, isFollowingGesture, isStylesheetChanged }) {
        // Compare before storing the new inputs so cosmetic edits keep the captured entry blend.
        const isDesktopEndpointChanged = this.#appearances !== null && (
            this.#appearances.desktop[1].gradientClass !== appearances.desktop[1].gradientClass ||
            this.#desktop.progress !== desktop.progress
        );
        this.#appearances = appearances;
        this.#desktop = desktop;
        this.#isFollowingGesture = isFollowingGesture;
        if (overview)
            this.#overview = overview;

        if (appearances.overview)
            this.#refreshOverviewBlend(isDesktopEndpointChanged);
        this.#render();
        // Reloaded CSS can change alpha while endpoint classes stay identical.
        if (isStylesheetChanged)
            this.#presentation.blend?.refreshAppearance();
    }

    #refreshOverviewBlend(isDesktopEndpointChanged) {
        const presentation = this.#presentation;
        if (presentation.kind !== 'overview-blend')
            return;

        // keep the mix unless the desired desktop endpoint has changed.
        const source = isDesktopEndpointChanged
            ? getBackgroundAtProgress(this.#appearances.desktop, this.#desktop.progress) : presentation.blend.sourceStyle;
        const target = this.#appearances.overview;
        presentation.blend.updateStyles(source, target);
        setGradientClass(target.gradientClass);
        presentation.baseStyle = target;
    }

    updateDesktop(progress, { isAnimationRequested = false, duration } = {}) {
        this.#desktop = { progress, isAnimationRequested, duration };
        if (this.#appearances && !this.#isOverviewActive)
            this.#renderDesktop(progress, isAnimationRequested, duration);
    }

    updateOverview({ progress, isHidden, isTargetVisible, desktopProgress }) {
        this.#overview = { progress, isHidden, isTargetVisible };
        // Overview cancels workspace gestures and exits to the latest desktop input.
        this.#desktop = { progress: desktopProgress, isAnimationRequested: false };
        if (this.#appearances)
            this.#render();
    }

    get #isOverviewActive() {
        return !this.#overview.isHidden || this.#overview.isTargetVisible;
    }

    get #baseStyle() {
        const presentation = this.#presentation;
        return presentation.kind === 'settled' ? presentation.style : presentation.baseStyle;
    }

    #render() {
        if (this.#isOverviewActive)
            this.#renderOverview();
        else
            this.#renderDesktop(this.#desktop.progress, this.#desktop.isAnimationRequested, this.#desktop.duration);
    }

    #captureAppearance() {
        const presentation = this.#presentation;
        return presentation.kind === 'settled' ? presentation.style : presentation.blend.getStyle();
    }

    #commitPanelAppearance(style) {
        const previous = this.#presentation;
        if (previous.kind === 'desktop-blend')
            this.#rememberedDesktopProgress = previous.blend.progress;
        // apply the underlying style before removing the covering layers.
        setGradientClass(style.gradientClass);
        previous.blend?.destroy();
        this.#presentation = { kind: 'settled', style };
    }

    #beginDesktopBlend() {
        const [source, target] = this.#appearances.desktop;
        this.#commitPanelAppearance(source);
        const blend = new BackgroundBlend(source, target);
        this.#presentation = { kind: 'desktop-blend', blend, baseStyle: source };
        blend.setProgress(this.#rememberedDesktopProgress);
    }

    #renderDesktop(progress, isAnimationRequested = false, duration) {
        if (isBackgroundStyleEqual(...this.#appearances.desktop)) {
            this.#commitPanelAppearance(this.#appearances.desktop[0]);
            this.#rememberedDesktopProgress = 0;
            return;
        }
        if (this.#presentation.kind === 'settled' &&
            progress === this.#rememberedDesktopProgress && (progress === 0 || progress === 1)) {
            this.#commitPanelAppearance(this.#appearances.desktop[progress]);
            return;
        }

        // defer desktop endpoint refresh until rendering; overview may still need the held mix.
        if (this.#presentation.kind !== 'desktop-blend')
            this.#beginDesktopBlend();
        else
            this.#presentation.blend.updateStyles(...this.#appearances.desktop);

        const presentation = this.#presentation;
        const complete = () => {
            if (this.#presentation !== presentation)
                return;
            if (progress === 0 || progress === 1)
                this.#commitPanelAppearance(this.#appearances.desktop[progress]);
        };
        if (isAnimationRequested && progress !== presentation.blend.progress) {
            presentation.blend.animateTo(progress, complete, duration);
        } else {
            presentation.blend.setProgress(progress);
            complete();
        }
    }

    #beginOverviewBlend() {
        // capture before settling, which destroys the currently displayed blend.
        const source = this.#captureAppearance();
        const target = this.#appearances.overview;
        this.#commitPanelAppearance(target);
        const blend = new BackgroundBlend(source, target);
        this.#presentation = { kind: 'overview-blend', blend, baseStyle: target };
    }

    #refreshOverviewExit() {
        // Resolve the new endpoint without briefly rendering desktop beneath overview.
        this.#presentation.blend.updateStyles(
            getBackgroundAtProgress(this.#appearances.desktop, this.#desktop.progress), this.#appearances.overview
        );
        this.#rememberedDesktopProgress = this.#desktop.progress;
    }

    #renderOverview() {
        const { progress, isTargetVisible } = this.#overview;
        if (!this.#baseStyle)
            this.#renderDesktop(this.#desktop.progress);

        if (!this.#appearances.overview) {
            this.#presentation.blend?.stopAnimation();
            return;
        }

        if (isBackgroundStyleEqual(...this.#appearances.desktop) &&
            isBackgroundStyleEqual(this.#appearances.desktop[0], this.#appearances.overview)) {
            this.#commitPanelAppearance(this.#appearances.overview);
            this.#rememberedDesktopProgress = 0;
            return;
        }

        if (this.#isFollowingGesture && progress !== null) {
            if (this.#presentation.kind === 'overview-blend' &&
                this.#presentation.blend.progress === 1 && progress < 1)
                this.#refreshOverviewExit();
            if (this.#presentation.kind !== 'overview-blend')
                this.#beginOverviewBlend();
            this.#presentation.blend.setProgress(progress);
            return;
        }

        if (this.#presentation.kind === 'overview-blend') {
            const presentation = this.#presentation;
            presentation.blend.animateTo(isTargetVisible ? 1 : 0, () => {
                if (this.#presentation !== presentation)
                    return;
                this.#commitPanelAppearance(isTargetVisible ? this.#appearances.overview : presentation.baseStyle);
                if (!isTargetVisible)
                    this.#renderDesktop(this.#desktop.progress);
            }, isTargetVisible ? OVERVIEW_ENTER_DURATION_MS : OVERVIEW_EXIT_DURATION_MS);
        } else if (isTargetVisible) {
            this.#commitPanelAppearance(this.#appearances.overview);
        } else {
            this.#renderDesktop(this.#desktop.progress, true, OVERVIEW_EXIT_DURATION_MS);
        }
    }

    destroy() {
        this.#commitPanelAppearance({ gradientClass: null });
        this.#appearances = null;
    }
}
