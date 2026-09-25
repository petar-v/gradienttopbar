import {
    removeGradientTransition,
    setGradientTransition,
    toggleGradient
} from '../gradient.js';

export default class ProgressiveEffect {
    apply(effectStrength) {
        toggleGradient(true, false);
        setGradientTransition(effectStrength);
    }

    destroy() {
        removeGradientTransition();
        toggleGradient(false);
    }
}
