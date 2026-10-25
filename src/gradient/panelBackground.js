import { panel } from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import {
    GRADIENT_CLASSES,
    BLENDING_CLASS, RESTORING_CLASS
} from './stylesheet.js';

/**
 * A CSS background; a null gradientClass selects the original Shell theme.
 * @typedef {{gradientClass: string|null, inOverview?: boolean}} BackgroundStyle
 */

/**
 * A captured mix with target drawn over source, at progress from 0 to 1.
 * Endpoints can be compositions, preserving an interrupted desktop blend inside overview.
 * Opacities are derived from progress and the current theme; they are never stored here.
 * @typedef {{source: PanelBackground, target: PanelBackground, progress: number}} BackgroundComposition
 */

/** @typedef {BackgroundStyle|BackgroundComposition} PanelBackground */

/**
 * Build the actor tree in paint order; BackgroundBlend drives transition progress.
 * @param {PanelBackground} style
 * @returns {St.Widget}
 */
export const createPanelBackground = style => {
    if (style.source) {
        const group = new St.Widget({ reactive: false });
        group.add_child(createPanelBackground(style.source));
        group.add_child(createPanelBackground(style.target));
        return group;
    }

    const classes = (panel.get_style_class_name() ?? '').split(/\s+/)
        .filter(name => ![...Object.values(GRADIENT_CLASSES), BLENDING_CLASS, RESTORING_CLASS].includes(name));
    const pseudoClasses = (panel.get_style_pseudo_class() ?? '').split(/\s+/)
        .filter(name => name !== 'overview');
    if (style.gradientClass)
        classes.push(style.gradientClass);
    if (style.inOverview)
        pseudoClasses.push('overview');

    return new St.Widget({
        name: 'panel',
        style_class: classes.join(' '),
        pseudo_class: pseudoClasses.join(' '),
        style: `${panel.get_style() ?? ''}; transition-duration: 0ms;`,
        reactive: false
    });
};

export const allocateBackground = actor => {
    const box = new Clutter.ActorBox();
    box.x2 = panel.width;
    box.y2 = panel.height;
    actor.allocate(box);
    actor.get_children().forEach(allocateBackground);
};

export const setGradientClass = gradientClass => {
    for (const name of Object.values(GRADIENT_CLASSES)) {
        if (name !== gradientClass)
            panel.remove_style_class_name(name);
    }
    if (gradientClass)
        panel.add_style_class_name(gradientClass);
};

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

const getOpacities = (progress, actor) => {
    // Validate even when the theme's alpha cannot be represented by two endpoints.
    let opacities = calculateBackgroundBlend(progress, 0, 0);
    const node = actor.get_theme_node();
    if (!node.get_background_image() && !node.get_border_image()) {
        const [type, start, end] = node.get_background_gradient();
        const color = type === St.GradientType.NONE ? node.get_background_color() : null;
        opacities = calculateBackgroundBlend(progress,
            (color ?? start).alpha / 255, (color ?? end).alpha / 255);
    }
    // shortcut: image alpha is unknown; retain an uncorrected crossfade until image blending is supported.
    return opacities;
};

export const applyBlendOpacity = (source, target, progress) => {
    const { sourceOpacity, destinationOpacity } = getOpacities(progress, target);
    source.opacity = Math.round(sourceOpacity * 255);
    target.opacity = Math.round(destinationOpacity * 255);
};

// Captured progress stays fixed, but theme changes can alter its opacity correction.
export const refreshPanelBackground = (actor, style) => {
    if (!style.source)
        return;
    const [source, target] = actor.get_children();
    refreshPanelBackground(source, style.source);
    refreshPanelBackground(target, style.target);
    applyBlendOpacity(source, target, style.progress);
};

export const areSameBackground = (first, second) => {
    if (first === second)
        return true;
    if (first.source || second.source) {
        if (!first.source || !second.source)
            return false;
        return first.progress === second.progress &&
            areSameBackground(first.source, second.source) && areSameBackground(first.target, second.target);
    }
    return first.gradientClass === second.gradientClass &&
        !!first.inOverview === !!second.inOverview;
};

export const watchPanelBackground = (actor, onChange, owner = actor) => {
    const children = actor.get_children();
    if (children.length === 0) {
        // The endpoint owns its children's listeners, so replacement disconnects the whole tree.
        actor.connectObject('style-changed', onChange, owner);
    } else {
        children.forEach(child => watchPanelBackground(child, onChange, owner));
    }
};
