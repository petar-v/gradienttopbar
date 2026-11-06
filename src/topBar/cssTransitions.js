import { panel } from 'resource:///org/gnome/shell/ui/main.js';
import { GRADIENT_CLASSES, NATIVE_DURATION_CLASSES, CSS_OVERVIEW_CLASS, RESTORING_CLASS } from './stylesheet.js';
import { isBackgroundStyleEqual } from './panelBackground.js';

const ownedClasses = [...Object.values(GRADIENT_CLASSES), ...Object.values(NATIVE_DURATION_CLASSES), CSS_OVERVIEW_CLASS];

/** Native endpoint mechanism; presentation precedence belongs to BackgroundTransitions. */
export default class CssTransitions {
    #style;
    #overviewStyle;
    #isShellOverviewEnabled = false;

    get style() {
        if (this.#isShellOverviewEnabled && (panel.get_style_pseudo_class() ?? '').split(/\s+/).includes('overview'))
            return this.#overviewStyle;
        return this.#style;
    }

    present(style, { duration = 0, isShellOverviewEnabled = false, overviewStyle = null } = {}) {
        const currentClasses = (panel.get_style_class_name() ?? '').split(/\s+/).filter(Boolean);
        const isOwnershipChanged = currentClasses.includes(CSS_OVERVIEW_CLASS) !== isShellOverviewEnabled;
        const isImmediateTakeover = !isShellOverviewEnabled && duration === 0 && !currentClasses.includes(NATIVE_DURATION_CLASSES[0]);
        this.#overviewStyle = overviewStyle;
        this.#isShellOverviewEnabled = isShellOverviewEnabled;
        if (!isOwnershipChanged && !isImmediateTakeover && this.#style && isBackgroundStyleEqual(this.#style, style))
            return;
        const classes = currentClasses.filter(name => !ownedClasses.includes(name));
        // shortcut: passive Shell overview shares its exit duration with desktop changes until Shell exposes the cause.
        classes.push(isShellOverviewEnabled ? CSS_OVERVIEW_CLASS : NATIVE_DURATION_CLASSES[duration]);
        if (style.gradientClass)
            classes.push(style.gradientClass);
        if (classes.length !== currentClasses.length || classes.some(name => !currentClasses.includes(name))) {
            panel.set_style_class_name(classes.join(' '));
            panel.ensure_style();
        }
        this.#style = style;
    }

    // Native in-flight pixels are unavailable; settle its known destination before custom takeover.
    suspend() {
        const style = this.style;
        panel.add_style_class_name(RESTORING_CLASS);
        panel.ensure_style();
        this.present(style);
        this.clearOwnership();
        panel.ensure_style();
        panel.remove_style_class_name(RESTORING_CLASS);
        panel.ensure_style();
        return style;
    }

    clearOwnership() {
        panel.remove_style_class_name(CSS_OVERVIEW_CLASS);
        for (const name of Object.values(NATIVE_DURATION_CLASSES))
            panel.remove_style_class_name(name);
        this.#isShellOverviewEnabled = false;
        this.#style = null;
    }
}
