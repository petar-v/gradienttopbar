import assert from 'node:assert/strict';
import test from 'node:test';
import { createModuleLoader } from './fixtures/modules.js';

const fixture = async () => {
    let time = 0;
    const load = createModuleLoader();
    const { default: ListenerMonitor } = (await load('debug/listenerMonitor.js')).namespace;
    const monitor = new ListenerMonitor(() => time);
    let nextId = 0;
    const handlers = new Map();
    const target = {
        connect(signal, callback) { handlers.set(++nextId, { signal, callback }); return nextId; },
        disconnect(id) { assert(handlers.delete(id)); }
    };
    return { monitor, target, handlers, advance: amount => { time += amount; } };
};

test('connections count actual handlers and preserve callback receiver, arguments and return value', async () => {
    const { monitor, target, handlers } = await fixture();
    const id = monitor.connect(target, 'size-changed', function (...args) {
        assert.equal(this, target);
        assert.deepEqual(args, [target, 12]);
        return false;
    }, 'Windows');
    assert.equal(monitor.snapshot().rows[0].active, 1);
    assert.equal(handlers.get(id).callback.call(target, target, 12), false);
    assert.equal(monitor.snapshot().rows[0].calls, 1);
    monitor.disconnect(target, id);
    const row = monitor.snapshot().rows[0];
    assert.equal(row.active, 0);
    assert.equal(row.calls, 1, 'Disconnected listeners retain their session totals');
});

test('optional timing counts throwing callbacks, excludes untimed calls and resets without losing connections', async () => {
    const { monitor, target, handlers, advance } = await fixture();
    const error = new Error('callback failure');
    const id = monitor.connect(target, 'changed', () => {
        advance(25);
        throw error;
    }, 'Settings');
    assert.throws(() => handlers.get(id).callback(), value => value === error);
    assert.equal(monitor.snapshot().rows[0].timedCalls, 0);
    monitor.setOptions(true, true);
    assert.throws(() => handlers.get(id).callback(), value => value === error);
    let row = monitor.snapshot().rows[0];
    assert.equal(row.calls, 2);
    assert.equal(row.timedCalls, 1);
    assert.equal(row.totalUs, 25);
    assert.equal(row.maxUs, 25);
    monitor.setOptions(false, true);
    assert.throws(() => handlers.get(id).callback(), value => value === error);
    assert.equal(monitor.snapshot().rows[0].calls, 2);
    monitor.reset();
    row = monitor.snapshot().rows[0];
    assert.equal(row.active, 1);
    assert.equal(row.calls, 0);
    assert.equal(row.totalUs, 0);
    monitor.disconnect(target, id);
});

test('nested work timing is inclusive and separate from listener counts', async () => {
    const { monitor, advance } = await fixture();
    monitor.setOptions(true, true);
    const inner = monitor.work('Work', 'Window scan', () => advance(10));
    const outer = monitor.work('Work', 'Renderer update', () => {
        advance(5);
        inner();
    });
    outer();
    const rows = monitor.snapshot().rows;
    assert.equal(rows.find(row => row.signal === 'Renderer update').totalUs, 15);
    assert.equal(rows.find(row => row.signal === 'Window scan').totalUs, 10);
    assert(rows.every(row => row.kind === 'work' && row.active === 0));
});

test('owned connections retire on explicit disconnect and owner destruction', async () => {
    const { monitor, target: owner, handlers } = await fixture();
    const owned = new Map();
    const panel = {
        connectObject(signal, callback, object) { owned.set(object, { signal, callback }); },
        disconnectObject(object) { assert(owned.delete(object)); }
    };
    const actor = {
        connectObject(signal, callback, object) { owned.set(this, { signal, callback, object }); }
    };
    monitor.connectObject(panel, 'notify::allocation', () => {}, owner, 'Rendering');
    monitor.connectObject(actor, 'style-changed', () => {}, owner, 'Rendering');
    assert.equal(handlers.size, 1, 'A single diagnostic destroy hook tracks each owner');
    monitor.disconnectObject(panel, owner);
    assert.equal(monitor.snapshot().rows.find(row => row.signal === 'notify::allocation').active, 0);
    assert.equal(monitor.snapshot().rows.find(row => row.signal === 'style-changed').active, 1);
    [...handlers.values()][0].callback();
    assert(monitor.snapshot().rows.every(row => row.active === 0));
});

test('release callbacks are connected unchanged without importing debug runtime', async () => {
    const load = createModuleLoader();
    const { connectSignal, measureWork, diagnostics } = (await load('diagnostics.js')).namespace;
    const callback = () => false;
    const target = {
        connect: (signal, received) => {
            assert.equal(signal, 'size-changed');
            assert.equal(received, callback);
            return 42;
        }
    };
    assert.equal(diagnostics, null);
    assert.equal(connectSignal(target, 'size-changed', callback, 'Windows'), 42);
    assert.equal(measureWork('Work', 'Window scan', callback), callback);
});
