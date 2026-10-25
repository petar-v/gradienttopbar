import BackgroundBlend, { commitPanelBackground } from './backgroundBlend.js';
import { setGradientClass } from './panelBackground.js';

/**
 * Owns the presentation state described in backgroundTransitions.smcat.
 * A blend can remain stationary between endpoints; it need not be animating.
 */
export default class BackgroundTransitions {
    #presentation = { kind: 'settled', style: null };
    #rememberedDesktopProgress = 0;
    #desktop = { progress: 0, animate: false };
    #overview = { progress: null, hidden: true, target: false };
    #appearances = null;
    #followGesture = false;

    /**
     * Install resolved {desktop: [normal, triggered], overview} styles and inputs
     * together, so reconfiguration never renders an intermediate snapshot.
     */
    configure(appearances, { desktop, overview, followGesture }) {
        const desktopChanged = this.#appearances && (
            this.#appearances.desktop[1].gradientClass !== appearances.desktop[1].gradientClass ||
            this.#desktop.progress !== desktop.progress
        );
        this.#appearances = appearances;
        this.#desktop = desktop;
        this.#followGesture = followGesture;
        if (overview)
            this.#overview = overview;

        const presentation = this.#presentation;
        if (presentation.kind === 'desktop-blend') {
            presentation.blend.updateStyles(...appearances.desktop);
        } else if (presentation.kind === 'overview-blend') {
            const source = desktopChanged
                ? this.#resolveDesktopAppearance() : presentation.blend.sourceStyle;
            presentation.blend.updateStyles(source, appearances.overview);
            setGradientClass(appearances.overview.gradientClass);
            presentation.baseStyle = appearances.overview;
        }
        this.#render();
    }

    updateDesktop(progress, { animate = false } = {}) {
        this.#desktop = { progress, animate };
        if (this.#appearances && !this.#overviewActive)
            this.#renderDesktop(progress, animate);
    }

    updateOverview({ progress, hidden, target, desktopProgress }) {
        this.#overview = { progress, hidden, target };
        // Overview cancels workspace gestures and exits to the latest desktop input.
        this.#desktop = { progress: desktopProgress, animate: false };
        if (this.#appearances)
            this.#render();
    }

    get #overviewActive() {
        return !this.#overview.hidden || this.#overview.target;
    }

    get #baseStyle() {
        const presentation = this.#presentation;
        return presentation.kind === 'settled' ? presentation.style : presentation.baseStyle;
    }

    #render() {
        if (this.#overviewActive)
            this.#renderOverview();
        else
            this.#renderDesktop(this.#desktop.progress, this.#desktop.animate);
    }

    #resolveDesktopAppearance() {
        const { progress } = this.#desktop;
        const [source, target] = this.#appearances.desktop;
        if (progress === 0 || progress === 1)
            return this.#appearances.desktop[progress];
        return { source, target, progress };
    }

    #captureAppearance() {
        const presentation = this.#presentation;
        return presentation.kind === 'settled' ? presentation.style : presentation.blend.getStyle();
    }

    #settle(style) {
        const previous = this.#presentation;
        if (previous.kind === 'desktop-blend')
            this.#rememberedDesktopProgress = previous.blend.progress;
        commitPanelBackground(style, previous.blend);
        this.#presentation = { kind: 'settled', style };
    }

    #beginDesktopBlend() {
        const [source, target] = this.#appearances.desktop;
        this.#settle(source);
        const blend = new BackgroundBlend(source, target);
        this.#presentation = { kind: 'desktop-blend', blend, baseStyle: source };
        blend.setProgress(this.#rememberedDesktopProgress);
    }

    #renderDesktop(progress, animate = false) {
        if (this.#presentation.kind === 'settled' &&
            progress === this.#rememberedDesktopProgress && (progress === 0 || progress === 1)) {
            this.#settle(this.#appearances.desktop[progress]);
            return;
        }

        if (this.#presentation.kind !== 'desktop-blend')
            this.#beginDesktopBlend();

        const presentation = this.#presentation;
        const complete = () => {
            if (this.#presentation !== presentation)
                return;
            if (progress === 0 || progress === 1)
                this.#settle(this.#appearances.desktop[progress]);
        };
        if (animate && progress !== presentation.blend.progress) {
            presentation.blend.animateTo(progress, complete);
        } else {
            presentation.blend.setProgress(progress);
            complete();
        }
    }

    #beginOverviewBlend() {
        const source = this.#captureAppearance();
        const target = this.#appearances.overview;
        this.#settle(target);
        const blend = new BackgroundBlend(source, target);
        this.#presentation = { kind: 'overview-blend', blend, baseStyle: target };
    }

    #refreshOverviewExit() {
        // Resolve the new endpoint without briefly rendering desktop beneath overview.
        this.#presentation.blend.updateStyles(
            this.#resolveDesktopAppearance(), this.#appearances.overview
        );
        this.#rememberedDesktopProgress = this.#desktop.progress;
    }

    #renderOverview() {
        const { progress, target } = this.#overview;
        if (!this.#baseStyle)
            this.#renderDesktop(this.#desktop.progress);

        if (this.#followGesture && progress !== null) {
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
            presentation.blend.animateTo(target ? 1 : 0, () => {
                if (this.#presentation !== presentation)
                    return;
                this.#settle(target ? this.#appearances.overview : presentation.baseStyle);
                if (!target)
                    this.#renderDesktop(this.#desktop.progress);
            });
        } else if (target) {
            this.#settle(this.#appearances.overview);
        } else {
            this.#renderDesktop(this.#desktop.progress, true);
        }
    }

    destroy() {
        this.#settle({ gradientClass: null });
        this.#appearances = null;
    }
}
