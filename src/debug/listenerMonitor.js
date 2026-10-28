/** In-memory aggregates only: never retain windows or event arguments in snapshots. */
export default class ListenerMonitor {
    #clock;
    #rows = new Map();
    #connections = new WeakMap();
    #owners = new WeakMap();
    #collecting = true;
    #timing = false;
    #generation = 0;
    #started;

    constructor(clock) {
        this.#clock = clock;
        this.#started = clock();
    }

    #row(group, signal, kind) {
        const key = `${group}:${signal}:${kind}`;
        if (!this.#rows.has(key))
            this.#rows.set(key, { group, signal, kind, active: 0, calls: 0, timedCalls: 0, totalUs: 0, maxUs: 0 });
        return this.#rows.get(key);
    }

    #wrap(row, callback) {
        const monitor = this;
        return function (...args) {
            if (!monitor.#collecting)
                return callback.apply(this, args);
            row.calls++;
            if (!monitor.#timing)
                return callback.apply(this, args);
            const generation = monitor.#generation;
            const start = monitor.#clock();
            try {
                return callback.apply(this, args);
            } finally {
                if (generation === monitor.#generation) {
                    const elapsed = monitor.#clock() - start;
                    row.timedCalls++;
                    row.totalUs += elapsed;
                    row.maxUs = Math.max(row.maxUs, elapsed);
                }
            }
        };
    }

    connect(target, signal, callback, group) {
        const row = this.#row(group, signal, 'signal');
        const id = target.connect(signal, this.#wrap(row, callback));
        if (!this.#connections.has(target))
            this.#connections.set(target, new Map());
        this.#connections.get(target).set(id, row);
        row.active++;
        return id;
    }

    disconnect(target, id) {
        target.disconnect(id);
        const connections = this.#connections.get(target);
        const row = connections?.get(id);
        if (row) {
            row.active--;
            connections.delete(id);
        }
    }

    connectObject(target, signal, callback, owner, group) {
        const row = this.#row(group, signal, 'signal');
        target.connectObject(signal, this.#wrap(row, callback), owner);
        let ownership = this.#owners.get(owner);
        if (!ownership) {
            ownership = {
                connections: [], destroyId: owner.connect('destroy', () => {
                    for (const connection of ownership.connections)
                        connection.row.active--;
                    this.#owners.delete(owner);
                })
            };
            this.#owners.set(owner, ownership);
        }
        ownership.connections.push({ target, row });
        row.active++;
    }

    disconnectObject(target, owner) {
        target.disconnectObject(owner);
        const ownership = this.#owners.get(owner);
        if (!ownership)
            return;
        ownership.connections = ownership.connections.filter(connection => {
            if (connection.target !== target)
                return true;
            connection.row.active--;
            return false;
        });
        if (ownership.connections.length === 0) {
            owner.disconnect(ownership.destroyId);
            this.#owners.delete(owner);
        }
    }

    work(group, signal, callback) {
        return this.#wrap(this.#row(group, signal, 'work'), callback);
    }

    setOptions(collecting, timing) {
        this.#collecting = collecting;
        this.#timing = timing;
    }

    reset() {
        this.#generation++;
        this.#started = this.#clock();
        for (const row of this.#rows.values())
            Object.assign(row, { calls: 0, timedCalls: 0, totalUs: 0, maxUs: 0 });
    }

    snapshot() {
        return {
            generation: this.#generation,
            elapsedUs: this.#clock() - this.#started,
            collecting: this.#collecting,
            timing: this.#timing,
            rows: [...this.#rows.values()].map(row => ({ ...row }))
        };
    }
}
