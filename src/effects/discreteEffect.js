import { toggleGradient } from '../gradient.js';
import { MAXIMIZED_BEHAVIOR } from '../constants.js';

export default class DiscreteEffect {
    constructor(triggeredBehavior) {
        this.triggeredBehavior = triggeredBehavior;
    }

    apply(effectStrength) {
        if (effectStrength === 0 || this.triggeredBehavior === MAXIMIZED_BEHAVIOR.KEEP_GRADIENT) {
            toggleGradient(true, false);
            return;
        }

        if (this.triggeredBehavior === MAXIMIZED_BEHAVIOR.KEEP_THEME) {
            toggleGradient(false);
            return;
        }

        toggleGradient(true, true);
    }

    destroy() {
        toggleGradient(false);
    }
}
