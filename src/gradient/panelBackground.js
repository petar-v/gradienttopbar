import { panel } from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import { calculateBlendOpacities } from './blendMath.js';
import {
    GRADIENT_CLASSES,
    BLENDING_CLASS, RESTORING_CLASS
} from './stylesheet.js';

/**
 * A CSS background; a null gradientClass selects the original Shell theme.
 * @typedef {{gradientClass: string|null, isInOverview?: boolean}} BackgroundStyle
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
    if (style.isInOverview)
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

const backgroundAlphas = new WeakMap();
const getBackgroundAlphas = actor => {
    const cached = backgroundAlphas.get(actor);
    if (cached)
        return cached;

    let alphas = [0, 0];
    const node = actor.get_theme_node();
    if (!node.get_background_image() && !node.get_border_image()) {
        const [type, start, end] = node.get_background_gradient();
        const color = type === St.GradientType.NONE ? node.get_background_color() : null;
        alphas = [(color ?? start).alpha / 255, (color ?? end).alpha / 255];
    }
    // shortcut: image alpha is unknown; retain an uncorrected crossfade until image blending is supported.
    backgroundAlphas.set(actor, alphas);
    return alphas;
};

export const applyBlendOpacity = (source, target, progress) => {
    const { sourceOpacity, destinationOpacity } = calculateBlendOpacities(progress, ...getBackgroundAlphas(target));
    source.opacity = Math.round(sourceOpacity * 255);
    target.opacity = Math.round(destinationOpacity * 255);
};

// Captured progress stays fixed, but theme changes can alter its opacity correction.
export const refreshPanelBackground = (actor, style) => {
    backgroundAlphas.delete(actor);
    if (!style.source)
        return;
    const [source, target] = actor.get_children();
    refreshPanelBackground(source, style.source);
    refreshPanelBackground(target, style.target);
    applyBlendOpacity(source, target, style.progress);
};

export const isBackgroundStyleEqual = (first, second) => {
    if (first === second)
        return true;
    if (first.source || second.source) {
        if (!first.source || !second.source)
            return false;
        return first.progress === second.progress &&
            isBackgroundStyleEqual(first.source, second.source) && isBackgroundStyleEqual(first.target, second.target);
    }
    return first.gradientClass === second.gradientClass &&
        !!first.isInOverview === !!second.isInOverview;
};

export const watchBackgroundStyleChanges = (actor, onChange, owner = actor) => {
    // Groups can be blend targets too; the endpoint owns the whole tree's listeners.
    actor.connectObject('style-changed', onChange, owner);
    actor.get_children().forEach(child => watchBackgroundStyleChanges(child, onChange, owner));
};
