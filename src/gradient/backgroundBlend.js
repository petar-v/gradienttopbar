import { panel } from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import {
    createPanelBackground, allocateBackground, setGradientClass,
    applyBlendOpacity, refreshPanelBackground, watchPanelBackground, areSameBackground
} from './panelBackground.js';

export { calculateBackgroundBlend } from './panelBackground.js';
import { BLENDING_CLASS, RESTORING_CLASS, TRANSITION_DURATION_MS } from './stylesheet.js';

export const commitPanelBackground = (style, blend) => {
    // Install the underlying style before removing the covering layers.
    setGradientClass(style.gradientClass);
    blend?.destroy();
};

/** Owns background endpoints and their animation; callers commit the final panel style. */
export default class BackgroundBlend {
    constructor(sourceStyle, targetStyle) {
        this.sourceStyle = sourceStyle;
        this.targetStyle = targetStyle;
        this.progress = 0;
        this._source = createPanelBackground(sourceStyle);
        this._target = createPanelBackground(targetStyle);
        panel.insert_child_at_index(this._source, 0);
        panel.insert_child_at_index(this._target, 1);
        this._allocate = () => {
            allocateBackground(this._source);
            allocateBackground(this._target);
        };
        panel.connectObject('notify::allocation', this._allocate, this._source);
        watchPanelBackground(this._source, () => this.refreshAppearance());
        watchPanelBackground(this._target, () => this.refreshAppearance());
        panel.add_style_class_name(BLENDING_CLASS);
        panel.ensure_style();
        this._allocate();
        this.refreshAppearance();
    }

    setProgress(progress) {
        this._stopAnimation();
        this._renderProgress(progress);
    }

    animateTo(progress, complete) {
        if (this._animation && this._targetProgress === progress)
            return;
        this._stopAnimation();
        this._targetProgress = progress;
        const start = this.progress;
        if (!St.Settings.get().enable_animations || start === progress) {
            this._renderProgress(progress);
            complete();
            return;
        }

        const timeline = new Clutter.Timeline({ actor: panel, duration: TRANSITION_DURATION_MS });
        this._animation = timeline;
        timeline.set_progress_mode(Clutter.AnimationMode.EASE_OUT_QUAD);
        timeline.connect('new-frame', () => this._renderProgress(start + (progress - start) * timeline.get_progress()));
        timeline.connect('completed', () => {
            this._animation = null;
            this._renderProgress(progress);
            complete();
        });
        timeline.start();
    }

    _stopAnimation() {
        this._animation?.stop();
        this._animation = null;
    }

    _renderProgress(progress) {
        applyBlendOpacity(this._source, this._target, progress);
        this.progress = progress;
    }

    updateStyles(sourceStyle, targetStyle) {
        this._updateSource(sourceStyle);
        this._updateTarget(targetStyle);
        this._allocate();
        this.refreshAppearance();
    }

    _updateSource(style) {
        if (areSameBackground(this.sourceStyle, style))
            return;

        const previous = this._source;
        panel.disconnectObject(previous);
        this.sourceStyle = style;
        this._source = createPanelBackground(style);
        panel.insert_child_at_index(this._source, 0);
        previous.destroy();
        panel.connectObject('notify::allocation', this._allocate, this._source);
        watchPanelBackground(this._source, () => this.refreshAppearance());
    }

    _updateTarget(style) {
        if (areSameBackground(this.targetStyle, style))
            return;

        const previous = this._target;
        this.targetStyle = style;
        this._target = createPanelBackground(style);
        panel.insert_child_at_index(this._target, 1);
        previous.destroy();
        watchPanelBackground(this._target, () => this.refreshAppearance());
    }

    // Refresh nested captures only when appearance changes, not on every animation frame.
    refreshAppearance() {
        if (!this._source)
            return;
        refreshPanelBackground(this._source, this.sourceStyle);
        refreshPanelBackground(this._target, this.targetStyle);
        this._renderProgress(this.progress);
    }

    /** @returns {import('./panelBackground.js').BackgroundComposition} */
    getStyle() {
        return {
            source: this.sourceStyle,
            target: this.targetStyle,
            progress: this.progress
        };
    }

    destroy() {
        this._stopAnimation();
        if (!this._source)
            return;
        const source = this._source;
        const target = this._target;
        this._source = null;
        this._target = null;
        panel.disconnectObject(source);

        // Commit native styling before dropping the layers to avoid a transparent-theme flash.
        panel.add_style_class_name(RESTORING_CLASS);
        panel.remove_style_class_name(BLENDING_CLASS);
        panel.ensure_style();
        panel.remove_style_class_name(RESTORING_CLASS);
        source.destroy();
        target.destroy();
    }
}
