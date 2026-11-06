import BackgroundBlend from './backgroundBlend.js';
import CssTransitions from './cssTransitions.js';
import { isBackgroundStyleEqual } from './panelBackground.js';
import { OVERVIEW_ENTER_DURATION_MS, OVERVIEW_EXIT_DURATION_MS } from './transitionTimings.js';

// endpoints stay native; fractional and nested appearances retain their exact composition.
const getBackgroundAtProgress = (backgrounds, progress) => {
    if (progress === 0 || progress === 1)
        return backgrounds[progress];
    const [source, target] = backgrounds;
    return { source, target, progress };
};

const isNativeBackground = style => !style.source;
const isEndpoint = progress => progress === 0 || progress === 1;

/** One presentation owner; native endpoints and custom mixtures share overview precedence. */
export default class BackgroundTransitions {
    #native = new CssTransitions();
    #presentation = { kind: 'native', style: null };
    #rememberedDesktopProgress = 0;
    #desktop = { progress: 0, isAnimationRequested: false };
    #overview = { progress: null, isHidden: true, isTargetVisible: false };
    #appearances = null;
    #isFollowingGesture = false;
    #isShellOverviewEnabled = false;
    #isOverviewCleanupNeeded = false;
    #onOverviewCleanupChanged;

    constructor(onOverviewCleanupChanged) {
        this.#onOverviewCleanupChanged = onOverviewCleanupChanged;
    }

    #notifyOverviewCleanup() {
        const isOverviewCleanupNeeded = this.#presentation.kind === 'overview-blend' && !this.#isFollowingGesture;
        if (isOverviewCleanupNeeded === this.#isOverviewCleanupNeeded)
            return;
        this.#isOverviewCleanupNeeded = isOverviewCleanupNeeded;
        this.#onOverviewCleanupChanged?.(isOverviewCleanupNeeded);
    }

    captureNativeDestination() {
        if (this.#presentation.kind === 'native' && this.#native.style)
            this.#presentation.style = this.#native.style;
    }

    configure(appearances, { desktop, overview, isFollowingGesture, isShellOverviewEnabled, isStylesheetChanged }) {
        const isDesktopEndpointChanged = this.#appearances !== null && (
            !isBackgroundStyleEqual(this.#appearances.desktop[1], appearances.desktop[1]) ||
            this.#desktop.progress !== desktop.progress
        );
        this.#appearances = appearances;
        this.#desktop = desktop;
        this.#isFollowingGesture = isFollowingGesture;
        this.#isShellOverviewEnabled = isShellOverviewEnabled;
        if (overview)
            this.#overview = overview;
        if (appearances.overview)
            this.#refreshOverviewBlend(isDesktopEndpointChanged);
        this.#render();
        if (isStylesheetChanged)
            this.#presentation.blend?.refreshAppearance();
    }

    #refreshOverviewBlend(isDesktopEndpointChanged) {
        const presentation = this.#presentation;
        if (presentation.kind !== 'overview-blend')
            return;
        const source = isDesktopEndpointChanged
            ? this.#desktopStyle : presentation.blend.sourceStyle;
        presentation.blend.updateStyles(source, this.#appearances.overview);
        this.#native.present(this.#appearances.overview);
        this.#native.clearOwnership();
    }

    updateDesktop(progress, { isAnimationRequested = false, duration = 0 } = {}) {
        this.#desktop = { progress, isAnimationRequested, duration };
        if (!this.#appearances)
            return;
        if (this.#isShellOverviewEnabled && this.#presentation.kind === 'native')
            this.#presentNative(this.#desktopStyle, isAnimationRequested ? duration : 0);
        else if (this.#isDesktopVisible)
            this.#renderDesktop(progress, isAnimationRequested, duration);
        this.#notifyOverviewCleanup();
    }

    updateOverview({ progress, isHidden, isTargetVisible, desktopProgress }) {
        if (this.#appearances?.overview === null)
            return;
        this.captureNativeDestination();
        this.#overview = { progress, isHidden, isTargetVisible };
        // Overview cancels workspace progress and restores fresh desktop input.
        this.#desktop = { progress: desktopProgress, isAnimationRequested: false };
        const isNativeDesktopUnchanged = isHidden && !isTargetVisible && this.#appearances !== null &&
            this.#presentation.kind === 'native' && isBackgroundStyleEqual(this.#presentation.style, this.#desktopStyle);
        if (this.#appearances && !isNativeDesktopUnchanged)
            this.#render();
    }

    get #isOverviewActive() {
        return this.#appearances.overview !== null && (!this.#overview.isHidden || this.#overview.isTargetVisible);
    }

    get #isDesktopVisible() {
        if (this.#appearances.overview === null)
            return true;
        if (this.#overview.isTargetVisible)
            return false;
        return this.#overview.isHidden || (!this.#isFollowingGesture && this.#presentation.kind !== 'overview-blend');
    }

    get #desktopStyle() {
        return getBackgroundAtProgress(this.#appearances.desktop, this.#desktop.progress);
    }

    #render() {
        if (this.#isOverviewActive)
            this.#renderOverview();
        else
            this.#renderDesktop(this.#desktop.progress, this.#desktop.isAnimationRequested && this.#presentation.kind !== 'overview-blend', this.#desktop.duration);
        this.#notifyOverviewCleanup();
    }

    #captureAppearance() {
        const presentation = this.#presentation;
        if (presentation.kind === 'native')
            return presentation.style;
        const blend = presentation.blend;
        return getBackgroundAtProgress([blend.sourceStyle, blend.getStyle().target], blend.progress);
    }

    #presentNative(style, duration = 0) {
        const previous = this.#presentation;
        if (previous.kind === 'desktop-blend')
            this.#rememberedDesktopProgress = previous.blend.progress;
        const isShellOverviewEnabled = this.#isShellOverviewEnabled && this.#appearances !== null;
        const panelStyle = isShellOverviewEnabled ? this.#desktopStyle : style;
        // Destination styling must be installed before uncovering the panel.
        this.#native.present(panelStyle, {
            duration: previous.blend ? 0 : duration,
            isShellOverviewEnabled,
            overviewStyle: this.#appearances?.overview
        });
        previous.blend?.destroy();
        this.#presentation = { kind: 'native', style };
    }

    #prepareComposition(baseStyle) {
        const previous = this.#presentation;
        if (previous.kind === 'native' && previous.style)
            this.#native.suspend();
        if (previous.kind === 'desktop-blend')
            this.#rememberedDesktopProgress = previous.blend.progress;
        this.#native.present(baseStyle);
        previous.blend?.destroy();
        this.#native.clearOwnership();
    }

    #beginDesktopBlend() {
        const [source, target] = this.#appearances.desktop;
        const appearance = this.#captureAppearance();
        if (appearance && isNativeBackground(appearance)) {
            if (isBackgroundStyleEqual(appearance, target))
                this.#rememberedDesktopProgress = 1;
            else if (isBackgroundStyleEqual(appearance, source))
                this.#rememberedDesktopProgress = 0;
        }
        this.#prepareComposition(source);
        const blend = new BackgroundBlend(source, target);
        this.#presentation = { kind: 'desktop-blend', blend };
        blend.setProgress(this.#rememberedDesktopProgress);
    }

    #renderDesktop(progress, isAnimationRequested = false, duration = 0) {
        if (isBackgroundStyleEqual(...this.#appearances.desktop)) {
            this.#presentNative(this.#appearances.desktop[0]);
            this.#rememberedDesktopProgress = 0;
            return;
        }
        if (isEndpoint(progress) && (!isAnimationRequested || this.#presentation.kind === 'native')) {
            this.#presentNative(this.#appearances.desktop[progress], isAnimationRequested ? duration : 0);
            this.#rememberedDesktopProgress = progress;
            return;
        }
        if (this.#presentation.kind !== 'desktop-blend')
            this.#beginDesktopBlend();
        else
            this.#presentation.blend.updateStyles(...this.#appearances.desktop);
        const presentation = this.#presentation;
        const complete = () => {
            if (this.#presentation !== presentation)
                return;
            if (isEndpoint(progress))
                this.#presentNative(this.#appearances.desktop[progress]);
        };
        if (isAnimationRequested && progress !== presentation.blend.progress) {
            presentation.blend.animateTo(progress, complete, duration);
        } else {
            presentation.blend.setProgress(progress);
            complete();
        }
    }

    #beginOverviewBlend(source, progress = 0) {
        const target = this.#appearances.overview;
        this.#prepareComposition(target);
        const blend = new BackgroundBlend(source, target);
        this.#presentation = { kind: 'overview-blend', blend };
        blend.setProgress(progress);
    }

    #renderOverviewGesture(progress) {
        if (progress === 1) {
            this.#presentNative(this.#appearances.overview);
            return;
        }
        if (progress === 0) {
            this.#renderDesktop(this.#desktop.progress);
            return;
        }
        if (this.#presentation.kind !== 'overview-blend') {
            const appearance = this.#captureAppearance();
            // Leaving the settled overview endpoint always starts from fresh desktop input.
            const source = isBackgroundStyleEqual(appearance, this.#appearances.overview)
                ? this.#desktopStyle : appearance;
            this.#beginOverviewBlend(source);
        }
        this.#presentation.blend.setProgress(progress);
    }

    #settleOverviewBlend(isTargetVisible) {
        const presentation = this.#presentation;
        presentation.blend.animateTo(isTargetVisible ? 1 : 0, () => {
            if (this.#presentation !== presentation)
                return;
            if (isTargetVisible)
                this.#presentNative(this.#appearances.overview);
            else
                this.#renderDesktop(this.#desktop.progress);
            this.#notifyOverviewCleanup();
        }, isTargetVisible ? OVERVIEW_ENTER_DURATION_MS : OVERVIEW_EXIT_DURATION_MS);
    }

    #renderOverviewTarget(isTargetVisible) {
        if (this.#presentation.kind === 'overview-blend') {
            this.#settleOverviewBlend(isTargetVisible);
            return;
        }
        if (!isTargetVisible && this.#presentation.kind === 'desktop-blend') {
            this.#renderDesktop(this.#desktop.progress);
            return;
        }
        const source = this.#captureAppearance();
        const destination = isTargetVisible ? this.#appearances.overview : this.#desktopStyle;
        if (isNativeBackground(source) && isNativeBackground(destination)) {
            this.#presentNative(destination, isTargetVisible ? OVERVIEW_ENTER_DURATION_MS : OVERVIEW_EXIT_DURATION_MS);
            return;
        }
        this.#beginOverviewBlend(isTargetVisible ? source : destination, isTargetVisible ? 0 : 1);
        this.#settleOverviewBlend(isTargetVisible);
    }

    #renderOverview() {
        if (this.#presentation.kind === 'native' && !this.#presentation.style)
            this.#renderDesktop(this.#desktop.progress);
        if (isBackgroundStyleEqual(...this.#appearances.desktop) &&
            isBackgroundStyleEqual(this.#appearances.desktop[0], this.#appearances.overview)) {
            this.#presentNative(this.#appearances.overview);
            this.#rememberedDesktopProgress = 0;
            return;
        }
        const { progress, isTargetVisible } = this.#overview;
        if (this.#isFollowingGesture && progress !== null)
            this.#renderOverviewGesture(progress);
        else
            this.#renderOverviewTarget(isTargetVisible);
    }

    destroy() {
        this.#isShellOverviewEnabled = false;
        this.#presentNative({ gradientClass: null });
        this.#native.clearOwnership();
        this.#appearances = null;
    }
}
