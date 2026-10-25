export default class SignalConnections {
    constructor() {
        this._targets = new Map();
    }

    connect(target, signal, callback) {
        if (!this._targets.has(target))
            this._targets.set(target, new Map());

        const signals = this._targets.get(target);
        if (!signals.has(signal))
            signals.set(signal, target.connect(signal, callback));

        return signals.get(signal);
    }

    disconnect(target) {
        const signals = this._targets.get(target);
        if (!signals)
            return;

        this._targets.delete(target);
        signals.forEach(id => target.disconnect(id));
    }

    disconnectAll() {
        for (const target of this._targets.keys())
            this.disconnect(target);
    }
}
