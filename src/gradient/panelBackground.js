import { panel } from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import {
    GRADIENT_CLASS, MAXIMIZED_GRADIENT_CLASS, OVERVIEW_GRADIENT_CLASS,
    BLENDING_CLASS, RESTORING_CLASS
} from './stylesheet.js';

const GRADIENT_CLASSES = [GRADIENT_CLASS, MAXIMIZED_GRADIENT_CLASS, OVERVIEW_GRADIENT_CLASS];

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
 * Build the actor tree in paint order; BackgroundBlend owns opacity and animation.
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
        .filter(name => ![...GRADIENT_CLASSES, BLENDING_CLASS, RESTORING_CLASS].includes(name));
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
    for (const name of GRADIENT_CLASSES) {
        if (name !== gradientClass)
            panel.remove_style_class_name(name);
    }
    if (gradientClass)
        panel.add_style_class_name(gradientClass);
};
