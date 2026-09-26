import {
    finishOriginalThemeTransition,
    removeGradientTransition,
    scrubAlternateGradient,
    scrubOriginalTheme,
    setGradientTransition,
    toggleGradient
} from '../gradient.js';
import { MAXIMIZED_BEHAVIOR } from '../constants.js';
import { blendEffectStrength } from './effectStrength.js';


export default class DiscreteEffect {
    constructor(triggeredBehavior) {
        this.triggeredBehavior = triggeredBehavior;
    }

    apply(effectStrength) {
        if (effectStrength === 0 || this.triggeredBehavior === MAXIMIZED_BEHAVIOR.KEEP_GRADIENT) {
            toggleGradient(true, false);
            setGradientTransition(0);
            return;
        }

        if (this.triggeredBehavior === MAXIMIZED_BEHAVIOR.KEEP_THEME) {
            toggleGradient(false);
            return;
        }

        toggleGradient(true, false);
        setGradientTransition(1);
    }

    scrub(startEffectStrength, endEffectStrength, progress) {
        const effectStrength = blendEffectStrength(
            Number(startEffectStrength > 0),
            Number(endEffectStrength > 0),
            progress
        );

        if (this.triggeredBehavior === MAXIMIZED_BEHAVIOR.KEEP_THEME) {
            toggleGradient(false);
            scrubOriginalTheme(effectStrength);
            return;
        }

        toggleGradient(true, false);
        if (this.triggeredBehavior === MAXIMIZED_BEHAVIOR.APPLY_STYLE)
            scrubAlternateGradient(effectStrength);
    }

    settle(effectStrength) {
        if (this.triggeredBehavior === MAXIMIZED_BEHAVIOR.KEEP_THEME) {
            const showGradient = effectStrength === 0;
            toggleGradient(showGradient, false);
            finishOriginalThemeTransition(showGradient);
            return;
        }

        toggleGradient(true, false);
        if (this.triggeredBehavior === MAXIMIZED_BEHAVIOR.APPLY_STYLE)
            scrubAlternateGradient(Number(effectStrength > 0));
    }

    destroy() {
        removeGradientTransition();
        toggleGradient(false);
    }
}
