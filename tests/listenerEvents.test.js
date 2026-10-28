import assert from 'node:assert/strict';
import test from 'node:test';
import ListenerMonitor from '../src/debug/listenerMonitor.js';
import { createEventsFixture } from './fixtures/events.js';

test('live observers count listeners, geometry batching and scans across settings changes', async t => {
    const monitor = new ListenerMonitor(() => 0);
    const f = await createEventsFixture(t, {
        'diagnostics.js': {
            connectSignal: monitor.connect.bind(monitor),
            disconnectSignal: monitor.disconnect.bind(monitor),
            measureWork: monitor.work.bind(monitor)
        }
    });
    const events = f.createEvents();
    events.configure(f.config);
    const row = (group, signal) => monitor.snapshot().rows.find(item => item.group === group && item.signal === signal);
    assert.equal(row('Windows', 'position-changed').active, 2);
    assert.equal(row('Overview', 'notify::value').active, 1);
    monitor.reset();
    f.first.emit('position-changed');
    f.first.emit('size-changed');
    assert.equal(row('Windows', 'position-changed').calls, 1);
    assert.equal(row('Windows', 'size-changed').calls, 1);
    f.flush();
    assert.equal(row('Work', 'Batched geometry refresh').calls, 1);
    assert.equal(row('Work', 'Window scan').calls, 1);
    events.configure({ ...f.config, styleTrigger: 'maximized', workspaceGestureBlending: false, overviewTransition: false });
    assert.equal(row('Windows', 'position-changed').active, 0);
    assert.equal(row('Windows', 'size-changed').active, 2);
    assert.equal(row('Overview', 'notify::value').active, 0);
    events.configure({ ...f.config, windowBehavior: 'keep-gradient', overviewBehavior: 'keep-gradient' });
    assert(monitor.snapshot().rows.every(item => item.active === 0));
});
