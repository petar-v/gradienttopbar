import assert from 'node:assert/strict';
import test from 'node:test';
import ListenerMonitor from '../src/debug/listenerMonitor.js';
import { listenerSignals } from '../src/debug/listenerCatalog.js';
import { createModuleLoader } from './fixtures/modules.js';

test('all known listeners exist before attachment and remain after disconnect and reset', () => {
    const monitor = new ListenerMonitor(() => 0, listenerSignals);
    const initial = monitor.snapshot().rows;
    assert.equal(initial.length, Object.values(listenerSignals).flat().length);
    assert(initial.every(row => row.kind === 'signal' && row.active === 0 && row.calls === 0));
    for (const [group, signals] of Object.entries(listenerSignals)) {
        for (const signal of signals) {
            const target = { connect: () => 1, disconnect() {} };
            const id = monitor.connect(target, signal, () => {}, group);
            assert.equal(monitor.snapshot().rows.find(row => row.group === group && row.signal === signal).active, 1);
            monitor.disconnect(target, id);
        }
    }
    monitor.reset();
    assert.deepEqual(monitor.snapshot().rows, initial, 'Rows are retained without duplicates and return to off');
});

test('settings inventory covers exactly the real runtime subscriptions', async () => {
    const load = createModuleLoader({ 'gi://Gio': { default: {} } });
    const config = (await load('config.js')).namespace;
    const observed = [];
    const settings = { connect: signal => observed.push(signal) };
    config.attachSettingsListeners(settings, () => {});
    config.attachSettingListener(settings, config.TOP_BAR_STYLE_SETTINGS, () => {});
    assert.deepEqual([...listenerSignals.Settings].sort(), observed.sort());
});
