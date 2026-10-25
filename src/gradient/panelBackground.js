import { panel } from 'resource:///org/gnome/shell/ui/main.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import {
    GRADIENT_CLASS, MAXIMIZED_GRADIENT_CLASS, OVERVIEW_GRADIENT_CLASS,
    BLENDING_CLASS, RESTORING_CLASS
} from './stylesheet.js';

const GRADIENT_CLASSES = [GRADIENT_CLASS, MAXIMIZED_GRADIENT_CLASS, OVERVIEW_GRADIENT_CLASS];

// A composed style preserves a partial blend without taking a screenshot.
export const createPanelBackground = style => {
    if (style.layers) {
        const group = new St.Widget({ reactive: false });
        for (const layer of style.layers)
            group.add_child(createPanelBackground(layer));
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
