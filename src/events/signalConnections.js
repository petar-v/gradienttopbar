import { connectSignal, disconnectSignal } from '../diagnostics.js';

export default class SignalConnections {
    constructor(group = 'Events') {
        this._targets = new Map();
        this._group = group;
    }

    connect(target, signal, callback) {
        if (!this._targets.has(target))
            this._targets.set(target, new Map());

        const signals = this._targets.get(target);
        if (!signals.has(signal))
            signals.set(signal, connectSignal(target, signal, callback, this._group));

        return signals.get(signal);
    }

    disconnect(target) {
        const signals = this._targets.get(target);
        if (!signals)
            return;

        this._targets.delete(target);
        signals.forEach(id => disconnectSignal(target, id));
    }

    disconnectAll() {
        for (const target of this._targets.keys())
            this.disconnect(target);
    }
}
