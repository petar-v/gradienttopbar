import {
    removeGradientTransition,
    scrubAlternateGradient,
    setGradientTransition,
    toggleGradient
} from '../gradient.js';
import { blendEffectStrength } from './effectStrength.js';

export default class ProgressiveEffect {
    apply(effectStrength) {
        toggleGradient(true, false);
        setGradientTransition(effectStrength);
    }

    scrub(startEffectStrength, endEffectStrength, progress) {
        const effectStrength = blendEffectStrength(
            startEffectStrength,
            endEffectStrength,
            progress
        );
        toggleGradient(true, false);
        scrubAlternateGradient(effectStrength);
    }

    settle(effectStrength) {
        toggleGradient(true, false);
        scrubAlternateGradient(effectStrength);
    }

    destroy() {
        removeGradientTransition();
        toggleGradient(false);
    }
}
