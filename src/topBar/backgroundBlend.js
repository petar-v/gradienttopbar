import { panel } from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import {
    createPanelBackground, allocateBackground,
    applyBlendOpacity, refreshPanelBackground, watchBackgroundStyleChanges, isBackgroundStyleEqual
} from './panelBackground.js';

import { BLENDING_CLASS, RESTORING_CLASS } from './stylesheet.js';
import { TRANSITION_DURATION_MS } from './transitionTimings.js';
import { connectSignal, disconnectSignal, connectObject, disconnectObject } from '../diagnostics.js';

/** Owns background endpoints and their animation; callers commit the final panel style. */
export default class BackgroundBlend {
    #sourceStyle;
    #targetStyle;
    #progress;
    #sourceBackground;
    #targetBackground;
    #animation;
    #timeline;
    #timelineDuration;
    #timelineSignals;
    #allocateBackgrounds;

    constructor(sourceStyle, targetStyle) {
        this.#sourceStyle = sourceStyle;
        this.#targetStyle = targetStyle;
        this.#progress = 0;
        this.#sourceBackground = createPanelBackground(sourceStyle);
        this.#targetBackground = createPanelBackground(targetStyle);
        panel.insert_child_at_index(this.#sourceBackground, 0);
        panel.insert_child_at_index(this.#targetBackground, 1);
        this.#allocateBackgrounds = () => {
            allocateBackground(this.#sourceBackground);
            allocateBackground(this.#targetBackground);
        };
        connectObject(panel, 'notify::allocation', this.#allocateBackgrounds, this.#sourceBackground, 'Rendering');
        watchBackgroundStyleChanges(this.#sourceBackground, () => this.refreshAppearance());
        watchBackgroundStyleChanges(this.#targetBackground, () => this.refreshAppearance());
        panel.add_style_class_name(BLENDING_CLASS);
        panel.ensure_style();
        this.#allocateBackgrounds();
        this.refreshAppearance();
    }

    get progress() {
        return this.#progress;
    }

    get sourceStyle() {
        return this.#sourceStyle;
    }

    setProgress(progress) {
        this.stopAnimation();
        this.#renderProgress(progress);
    }

    animateTo(progress, complete, duration = TRANSITION_DURATION_MS) {
        if (this.#animation?.target === progress && this.#timelineDuration === duration)
            return;
        this.stopAnimation();
        const start = this.#progress;
        if (!St.Settings.get().enable_animations || duration === 0 || start === progress) {
            this.#renderProgress(progress);
            complete();
            return;
        }

        if (!this.#timeline)
            this.#createAnimationTimeline(duration);
        if (this.#timelineDuration !== duration) {
            this.#timeline.duration = duration;
            this.#timelineDuration = duration;
        }
        this.#animation = { start, target: progress, complete };
        this.#timeline.start();
    }

    // create the controller once; retargeting only changes its destination and duration.
    #createAnimationTimeline(duration) {
        const timeline = new Clutter.Timeline({ actor: panel, duration });
        this.#timeline = timeline;
        this.#timelineDuration = duration;
        timeline.set_progress_mode(Clutter.AnimationMode.EASE_OUT_QUAD);
        this.#timelineSignals = [
            connectSignal(timeline, 'new-frame', () => {
                const { start: from, target } = this.#animation;
                this.#renderProgress(from + (target - from) * timeline.get_progress());
            }, 'Rendering'),
            connectSignal(timeline, 'completed', () => {
                const { target, complete: onComplete } = this.#animation;
                this.#animation = null;
                this.#renderProgress(target);
                onComplete();
            }, 'Rendering')
        ];
    }

    stopAnimation() {
        if (!this.#animation)
            return;
        this.#timeline.stop();
        this.#animation = null;
    }

    #renderProgress(progress) {
        applyBlendOpacity(this.#sourceBackground, this.#targetBackground, progress);
        this.#progress = progress;
    }

    updateStyles(sourceStyle, targetStyle) {
        if (isBackgroundStyleEqual(this.#sourceStyle, sourceStyle) && isBackgroundStyleEqual(this.#targetStyle, targetStyle))
            return;
        this.#replaceSourceBackground(sourceStyle);
        this.#replaceTargetBackground(targetStyle);
        this.#allocateBackgrounds();
        this.refreshAppearance();
    }

    #replaceSourceBackground(style) {
        if (isBackgroundStyleEqual(this.#sourceStyle, style))
            return;

        const previous = this.#sourceBackground;
        disconnectObject(panel, previous);
        this.#sourceStyle = style;
        this.#sourceBackground = createPanelBackground(style);
        panel.insert_child_at_index(this.#sourceBackground, 0);
        previous.destroy();
        connectObject(panel, 'notify::allocation', this.#allocateBackgrounds, this.#sourceBackground, 'Rendering');
        watchBackgroundStyleChanges(this.#sourceBackground, () => this.refreshAppearance());
    }

    #replaceTargetBackground(style) {
        if (isBackgroundStyleEqual(this.#targetStyle, style))
            return;

        const previous = this.#targetBackground;
        this.#targetStyle = style;
        this.#targetBackground = createPanelBackground(style);
        panel.insert_child_at_index(this.#targetBackground, 1);
        previous.destroy();
        watchBackgroundStyleChanges(this.#targetBackground, () => this.refreshAppearance());
    }

    // Refresh nested captures only when appearance changes, not on every animation frame.
    refreshAppearance() {
        if (!this.#sourceBackground)
            return;
        refreshPanelBackground(this.#sourceBackground, this.#sourceStyle);
        refreshPanelBackground(this.#targetBackground, this.#targetStyle);
        this.#renderProgress(this.#progress);
    }

    /** @returns {import('./panelBackground.js').BackgroundComposition} */
    getStyle() {
        return {
            source: this.#sourceStyle,
            target: this.#targetStyle,
            progress: this.#progress
        };
    }

    destroy() {
        this.stopAnimation();
        if (this.#timeline) {
            for (const id of this.#timelineSignals)
                disconnectSignal(this.#timeline, id);
            this.#timeline = null;
        }
        if (!this.#sourceBackground)
            return;
        const source = this.#sourceBackground;
        const target = this.#targetBackground;
        this.#sourceBackground = null;
        this.#targetBackground = null;
        disconnectObject(panel, source);

        // Commit native styling before dropping the layers to avoid a transparent-theme flash.
        panel.add_style_class_name(RESTORING_CLASS);
        panel.remove_style_class_name(BLENDING_CLASS);
        panel.ensure_style();
        panel.remove_style_class_name(RESTORING_CLASS);
        source.destroy();
        target.destroy();
    }
}
