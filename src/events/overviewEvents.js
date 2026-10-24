import { overview } from 'resource:///org/gnome/shell/ui/main.js';

export default class OverviewEvents {
    constructor(callback) {
        this.hidden = !overview.visible;
        this._handlers = ['showing', 'hiding', 'shown', 'hidden'].map(signal =>
            overview.connect(signal, () => {
                this.hidden = signal === 'hidden';
                callback(signal);
            }));

        // Shell has no public overview-progress API. Without this adjustment,
        // keep the existing timed CSS transition instead of guessing progress.
        const adjustment = overview._overview?.controls?._stateAdjustment;
        if (adjustment?.connect && typeof adjustment.value === 'number') {
            this._adjustment = adjustment;
            this._progressHandler = adjustment.connect('notify::value', () => callback('progress'));
        }
    }

    get progress() {
        // Window picker ↔ app grid is entirely within overview.
        return this._adjustment ? Math.clamp(this._adjustment.value, 0, 1) : null;
    }

    destroy() {
        if (this._progressHandler)
            this._adjustment.disconnect(this._progressHandler);
        this._handlers.forEach(id => overview.disconnect(id));
        this._adjustment = null;
    }
}
