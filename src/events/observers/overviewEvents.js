import { overview } from 'resource:///org/gnome/shell/ui/main.js';
import SignalConnections from '../signalConnections.js';

export default class OverviewEvents {
    constructor(callback) {
        this.hidden = !overview.visible;
        this._signals = new SignalConnections();
        ['showing', 'hiding', 'shown', 'hidden'].forEach(signal =>
            this._signals.connect(overview, signal, () => {
                this.hidden = signal === 'hidden';
                callback(signal);
            }));

        // Shell has no public overview-progress API. Without this adjustment,
        // keep the existing timed CSS transition instead of guessing progress.
        const adjustment = overview._overview?.controls?._stateAdjustment;
        if (adjustment?.connect && typeof adjustment.value === 'number') {
            this._adjustment = adjustment;
            this._signals.connect(adjustment, 'notify::value', () => callback('progress'));
        }
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
    }
}
