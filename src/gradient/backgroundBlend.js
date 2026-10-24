import { panel } from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import { createPanelBackground, allocateBackground } from './panelBackground.js';
import { BLENDING_CLASS, RESTORING_CLASS, TRANSITION_DURATION_MS } from './stylesheet.js';

/**
 * Calculate actor opacities for a destination background drawn over a source.
 * Keep both backgrounds' original colors and alpha; apply these coefficients
 * only to their actor opacity. All inputs and outputs use the range [0, 1].
 *
 * With source alpha a, destination alpha b and gesture progress p, the desired
 * combined alpha is A = (1 - p) * a + p * b. Source-over compositing gives
 * A = p * b + sourceOpacity * a * (1 - p * b), so a cancels and
 * sourceOpacity = (1 - p) / (1 - p * b); destinationOpacity = p.
 *
 * Use the mean of the destination gradient's two endpoint alphas for b.
 * shortcut: varying alpha is approximate between endpoints; use per-pixel
 * blending if exact intermediate gradients are required. The original source
 * is preserved at p = 0 and the original destination at p = 1.
 * For an opaque destination, sourceOpacity stays at 1 until completion, then
 * becomes 0 underneath the fully opaque destination without a visible jump.
 */
export const calculateBackgroundBlend = (progress, destinationStartAlpha, destinationEndAlpha) => {
    for (const value of [progress, destinationStartAlpha, destinationEndAlpha]) {
        if (!Number.isFinite(value) || value < 0 || value > 1)
            throw new RangeError('Progress and gradient alphas must be finite numbers between 0 and 1');
    }

    // At completion only the destination remains; also avoid 0 / 0 when b = 1.
    if (progress === 1)
        return { sourceOpacity: 0, destinationOpacity: 1 };

    // Approximate a two-color gradient's destination alpha by its endpoint mean.
    const destinationAlpha = (destinationStartAlpha + destinationEndAlpha) / 2;

    // The destination leaves this fraction of the source visible underneath it.
    const sourceTransmission = 1 - progress * destinationAlpha;

    // Compensate for that occlusion to retain the desired (1 - p) contribution.
    const sourceOpacity = (1 - progress) / sourceTransmission;

    // The destination contributes p times its original alpha, without modification.
    return { sourceOpacity, destinationOpacity: progress };
};

/** Owns two fixed background styles; callers supply progress and commit the final panel style. */
export default class BackgroundBlend {
    constructor(sourceStyle, targetStyle) {
        this.sourceStyle = sourceStyle;
        this.targetStyle = targetStyle;
        this.progress = 0;
        this._source = createPanelBackground(sourceStyle);
        this._target = createPanelBackground(targetStyle);
        panel.insert_child_at_index(this._source, 0);
        panel.insert_child_at_index(this._target, 1);
        const allocate = () => {
            allocateBackground(this._source);
            allocateBackground(this._target);
        };
        panel.connectObject('notify::allocation', allocate, this._source);
        panel.add_style_class_name(BLENDING_CLASS);
        panel.ensure_style();
        allocate();
        this.setProgress(0);
    }

    setProgress(progress) {
        this._stopAnimation();
        this._renderProgress(progress);
    }

    animateTo(progress, complete) {
        this._stopAnimation();
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
        // Validate even when the theme's alpha cannot be represented by two endpoints.
        let opacities = calculateBackgroundBlend(progress, 0, 0);
        const node = this._target.get_theme_node();
        if (!node.get_background_image() && !node.get_border_image()) {
            const [type, start, end] = node.get_background_gradient();
            const color = type === St.GradientType.NONE ? node.get_background_color() : null;
            opacities = calculateBackgroundBlend(progress,
                (color ?? start).alpha / 255, (color ?? end).alpha / 255);
        }
        // shortcut: image alpha is unknown; retain an uncorrected crossfade until image blending is supported.
        this._source.opacity = Math.round(opacities.sourceOpacity * 255);
        this._target.opacity = Math.round(opacities.destinationOpacity * 255);
        this.progress = progress;
    }

    getStyle() {
        return {
            layers: [
                { style: this.sourceStyle, opacity: this._source.opacity / 255 },
                { style: this.targetStyle, opacity: this._target.opacity / 255 }
            ]
        };
    }

    destroy() {
        this._stopAnimation();
        if (!this._source)
            return;

        // Commit native styling before dropping the layers to avoid a transparent-theme flash.
        panel.add_style_class_name(RESTORING_CLASS);
        panel.remove_style_class_name(BLENDING_CLASS);
        panel.ensure_style();
        panel.remove_style_class_name(RESTORING_CLASS);
        panel.disconnectObject(this._source);
        this._source.destroy();
        this._target.destroy();
        this._source = null;
        this._target = null;
    }
}
