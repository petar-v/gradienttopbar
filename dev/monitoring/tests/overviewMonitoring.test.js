import assert from 'node:assert/strict';
import test from 'node:test';
import ListenerMonitor from '../src/debug/listenerMonitor.js';
import { listenerSignals } from '../src/debug/listenerCatalog.js';
import { createEventsFixture } from './fixtures/events.js';
import { createExtensionFixture } from './fixtures/extension.js';

const setup = async t => {
    const monitor = new ListenerMonitor(() => 0, listenerSignals);
    const f = await createEventsFixture(t, {
        'diagnostics.js': {
            connectSignal: monitor.connect.bind(monitor),
            disconnectSignal: monitor.disconnect.bind(monitor),
            measureWork: monitor.work.bind(monitor)
        }
    });
    return { ...f, monitor, row: (group, signal) => monitor.snapshot().rows.find(row => row.group === group && row.signal === signal) };
};

test('overview preview and compatibility listeners track additions, destruction and yielding', async t => {
    const f = await setup(t);
    assert.equal(f.row('Overview previews', 'child-added')?.active, 0);
    const events = f.createEvents();
    const view = new f.OverviewWorkspaceView();
    view.add_child(new f.OverviewWorkspace());
    f.overviewDisplay.add_child(view);
    events.configureOverviewZoom(true);
    assert.equal(f.row('Wallpaper availability', 'extension-state-changed').active, 1);
    assert.equal(f.row('Overview previews', 'child-added').active, 2);
    assert.equal(f.row('Overview previews', 'destroy').active, 2);
    const next = new f.OverviewWorkspace();
    view.add_child(next);
    assert.equal(f.row('Overview previews', 'child-added').calls, 1);
    assert.equal(f.row('Overview previews', 'destroy').active, 3);
    next.destroy();
    assert.equal(f.row('Overview previews', 'destroy').active, 2);
    f.extensionManager.emit('extension-state-changed', { uuid: 'overview-seamless-zoom@jguece', state: f.ExtensionState.ACTIVATING });
    assert.equal(f.row('Overview previews', 'child-added').active, 0);
    assert.equal(f.row('Overview previews', 'destroy').active, 0);
    events.configureOverviewZoom(false);
    assert(f.monitor.snapshot().rows.every(row => row.active === 0));
});

test('wallpaper-only hidden callbacks are counted once without panel renderer work', async t => {
    const f = await setup(t);
    const events = f.createEvents();
    events.configure({ ...f.config, windowBehavior: 'keep-gradient', overviewBehavior: 'do-nothing' });
    f.overview.visible = true;
    f.overview._shown = true;
    events.configureOverviewZoom(true);
    assert.equal(f.row('Overview', 'hidden').active, 1);
    f.overview.visible = false;
    f.overview._shown = false;
    f.overview.emit('hidden');
    assert.equal(f.row('Overview', 'hidden').calls, 1);
    assert.equal(f.row('Overview', 'hidden').active, 0);
    assert.equal(f.overviewStates.length, 0);
    events.configureOverviewZoom(false);
    assert(f.monitor.snapshot().rows.every(row => row.active === 0));
});

test('wallpaper function counters preserve return values including setup failure', async t => {
    const monitor = new ListenerMonitor(() => 0);
    const f = await createExtensionFixture(t, {
        'diagnostics.js': {
            diagnostics: { start() {}, stop() {} },
            measureWork: monitor.work.bind(monitor)
        },
        'overview/workspaceBackground.js': {
            default: class {
                configure() { return false; }
                addWorkspace() { return false; }
                removeWorkspace() { return 12; }
                destroy() {}
            }
        }
    });
    f.extension.enable();
    const callbacks = f.state.eventCallbacks;
    assert.equal(callbacks.onOverviewZoomChanged(true), false);
    assert.equal(callbacks.onOverviewWorkspaceAdded({}), false);
    assert.equal(callbacks.onOverviewWorkspaceRemoved({}), 12);
    const rows = monitor.snapshot().rows.filter(row => row.group === 'Overview wallpaper');
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map(row => row.calls), [2, 1, 1]);
});

test('panel and wallpaper observation share a single counted hidden listener', async t => {
    const f = await setup(t);
    const events = f.createEvents();
    events.configure(f.config);
    f.overview.visible = true;
    events.configureOverviewZoom(true);
    assert.equal(f.row('Overview', 'hidden').active, 1);
    f.overview.visible = false;
    f.overview.emit('hidden');
    assert.equal(f.row('Overview', 'hidden').calls, 1);
    assert.equal(f.overviewStates.length, 1);
});
