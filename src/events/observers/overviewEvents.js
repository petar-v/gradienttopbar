import { overview } from 'resource:///org/gnome/shell/ui/main.js';
import SignalConnections from '../signalConnections.js';

// Shell has no public overview-progress API. Without this adjustment,
// keep the existing timed CSS transition instead of guessing progress.
const getOverviewProgressAdjustment = shellOverview => {
    const adjustment = shellOverview._overview?.controls?._stateAdjustment;
    return typeof adjustment?.connect === 'function' && typeof adjustment.value === 'number'
        ? adjustment : null;
};

export default class OverviewEvents {
    constructor(callback) {
        this._callback = callback;
        this.hidden = !overview.visible;
        this._signals = new SignalConnections();
        this._adjustment = null;
        this.isObserving = false;
    }

    configure({ shouldObserve, followProgress }) {
        if (!this.isObserving)
            this.hidden = !overview.visible;

        if (!shouldObserve) {
            this.destroy();
            return;
        }

        this.#startObserving();
        this.#configureProgressTracking(followProgress);
    }

    #configureProgressTracking(followProgress) {
        const adjustment = followProgress ? getOverviewProgressAdjustment(overview) : null;

        if (adjustment === this._adjustment)
            return;

        if (this._adjustment)
            this._signals.disconnect(this._adjustment);

        this._adjustment = adjustment;
        this._lastProgress = this.progress;

        if (adjustment) {
            this._signals.connect(adjustment, 'notify::value', () => {
                const progress = this.progress;
                if (progress !== this._lastProgress) {
                    this._lastProgress = progress;
                    this._callback('progress');
                }
            });
        }
    }

    #startObserving() {
        if (this.isObserving)
            return;

        this.isObserving = true;
        ['showing', 'hiding', 'shown', 'hidden'].forEach(signal =>
            this._signals.connect(overview, signal, () => {
                this.hidden = signal === 'hidden';
                this._lastProgress = this.progress;
                this._callback(signal);
            }));
    }

    get progress() {
        // Window picker ↔ app grid is entirely within overview.
        return this._adjustment ? Math.clamp(this._adjustment.value, 0, 1) : null;
    }

    get target() {
        return overview.visibleTarget;
    }

    destroy() {
        this._signals.disconnectAll();
        this._adjustment = null;
        this.isObserving = false;
    }
}
