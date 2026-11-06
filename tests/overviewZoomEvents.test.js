import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEventsFixture } from './fixtures/events.js';

const uuid = 'overview-seamless-zoom@jguece';
const setup = async t => {
    const f = await createEventsFixture(t);
    const calls = [];
    const events = f.createEvents({ onOverviewZoomChanged: enabled => calls.push(enabled) });
    const change = state => {
        const extension = { uuid, state };
        f.extensions.set(uuid, extension);
        f.extensionManager.emit('extension-state-changed', extension);
    };
    return { ...f, calls, events, change };
};

test('off has no listeners; active companion blocks initial ownership', async t => {
    const f = await setup(t);
    f.events.configureOverviewZoom(false);
    assert.deepEqual(f.calls, []);
    assert.equal(f.extensionManager.handlers.size, 0);
    f.change(f.ExtensionState.ACTIVE);
    f.events.configureOverviewZoom(true);
    assert.deepEqual(f.calls, []);
    assert.equal(f.overview.handlers.size, 0);
});

test('activating yields synchronously and clean inactive state restores at closure', async t => {
    const f = await setup(t);
    f.events.configureOverviewZoom(true);
    f.overview.visible = true;
    f.overview._shown = true;
    f.change(f.ExtensionState.ACTIVATING);
    assert.deepEqual(f.calls, [true, false]);
    f.change(f.ExtensionState.DEACTIVATING);
    f.change(f.ExtensionState.INACTIVE);
    assert.deepEqual(f.calls, [true, false]);
    f.overview.visible = false;
    f.overview.emit('hidden');
    assert.deepEqual(f.calls, [true, false]);
    f.overview._shown = false;
    f.overview.emit('hidden');
    assert.deepEqual(f.calls, [true, false, true]);
    assert.equal(f.overview.handlers.size, 0);
});

test('pending user toggles coalesce, and a companion forces pending off cleanup', async t => {
    const f = await setup(t);
    f.events.configureOverviewZoom(true);
    f.overview.visible = true;
    f.events.configureOverviewZoom(false);
    assert.equal(f.extensionManager.handlers.size, 1);
    f.events.configureOverviewZoom(true);
    assert.equal(f.overview.handlers.size, 0);
    f.events.configureOverviewZoom(false);
    f.change(f.ExtensionState.ACTIVATING);
    assert.deepEqual(f.calls, [true, false]);
    assert.equal(f.extensionManager.handlers.size, 0);
    assert.equal(f.overview.handlers.size, 0);
    f.change(f.ExtensionState.INACTIVE);
    assert.deepEqual(f.calls, [true, false]);
});

test('fresh lookup sees replaced instances and uninstall signal overrides stale lookup', async t => {
    const f = await setup(t);
    f.events.configureOverviewZoom(true);
    f.extensions.set(uuid, { uuid, state: f.ExtensionState.ACTIVE });
    f.events.configureOverviewZoom(true);
    assert.deepEqual(f.calls, [true, false]);
    f.change(f.ExtensionState.UNINSTALLED);
    f.extensions.delete(uuid);
    assert.deepEqual(f.calls, [true, false, true]);
});

test('error latches through uninstall and toggles for the observer lifetime', async t => {
    const f = await setup(t);
    f.events.configureOverviewZoom(true);
    f.change(f.ExtensionState.ERROR);
    f.change(f.ExtensionState.UNINSTALLED);
    f.extensions.delete(uuid);
    f.events.configureOverviewZoom(false);
    f.events.configureOverviewZoom(true);
    assert.deepEqual(f.calls, [true, false]);
});

test('unrelated states and repeated requests deduplicate; unknown states safely block', async t => {
    const f = await setup(t);
    f.events.configureOverviewZoom(true);
    f.events.configureOverviewZoom(true);
    f.extensionManager.emit('extension-state-changed', { uuid: 'other', state: f.ExtensionState.ERROR });
    assert.deepEqual(f.calls, [true]);
    f.change(1234);
    f.change(1234);
    assert.deepEqual(f.calls, [true, false]);
    f.change(f.ExtensionState.INITIALIZED);
    f.change(f.ExtensionState.OUT_OF_DATE);
    assert.deepEqual(f.calls, [true, false, true]);
    f.events.destroy();
    assert.equal(f.extensionManager.handlers.size, 0);
    assert.equal(f.overview.handlers.size, 0);
});

test('normal off waits for actual closure and then removes all listeners', async t => {
    const f = await setup(t);
    f.events.configureOverviewZoom(true);
    f.overview.visible = true;
    f.overview._shown = true;
    f.events.configureOverviewZoom(false);
    f.overview.visible = false;
    f.overview.emit('hidden');
    assert.deepEqual(f.calls, [true]);
    f.overview._shown = false;
    f.overview.emit('hidden');
    assert.deepEqual(f.calls, [true, false]);
    assert.equal(f.overview.handlers.size, 0);
    assert.equal(f.extensionManager.handlers.size, 0);
});

test('pending enable checks fresh lookup at closure instead of cached instance', async t => {
    const f = await setup(t);
    f.overview.visible = true;
    f.events.configureOverviewZoom(true);
    assert.deepEqual(f.calls, []);
    f.extensions.set(uuid, { uuid, state: f.ExtensionState.ACTIVE });
    f.overview.visible = false;
    f.overview.emit('hidden');
    assert.deepEqual(f.calls, []);
    assert.equal(f.overview.handlers.size, 0);
    f.change(f.ExtensionState.INACTIVE);
    assert.deepEqual(f.calls, [true]);
});

test('an error latch belongs only to its observer and missing state safely blocks', async t => {
    const f = await setup(t);
    f.events.configureOverviewZoom(true);
    f.change(f.ExtensionState.ERROR);
    f.events.destroy();
    f.extensions.delete(uuid);
    const nextCalls = [];
    const next = f.createEvents({ onOverviewZoomChanged: enabled => nextCalls.push(enabled) });
    next.configureOverviewZoom(true);
    assert.deepEqual(nextCalls, [true]);
    f.extensions.set(uuid, { uuid });
    next.configureOverviewZoom(true);
    assert.deepEqual(nextCalls, [true, false]);
});

test('wallpaper-only closure uses the shared overview observer without panel work', async t => {
    const f = await setup(t);
    f.events.configure({ ...f.config, windowBehavior: 'keep-gradient', overviewBehavior: 'do-nothing' });
    f.overview.visible = true;
    f.overview._shown = true;
    f.events.configureOverviewZoom(true);
    assert.deepEqual([...f.overview.handlers.values()].map(handler => handler.signal), ['hidden']);
    assert.equal(f.adjustment.handlers.size, 0);
    const beforeReads = { ...f.reads };
    f.overview.visible = false;
    f.overview.emit('hidden');
    assert.deepEqual(f.calls, []);
    f.overview._shown = false;
    f.overview.emit('hidden');
    assert.deepEqual(f.calls, [true]);
    assert.deepEqual(f.reads, beforeReads);
    assert.deepEqual(f.overviewStates, []);
    assert.equal(f.overview.handlers.size, 0);
});

test('panel and wallpaper requirements share exactly one hidden subscription', async t => {
    const f = await setup(t);
    f.events.configure(f.config);
    f.overview.visible = true;
    f.events.configureOverviewZoom(true);
    const hidden = [...f.overview.handlers.values()].filter(handler => handler.signal === 'hidden');
    assert.equal(hidden.length, 1);
    f.overview.visible = false;
    f.overview.emit('hidden');
    assert.deepEqual(f.calls, [true]);
    assert.equal(f.overviewStates.length, 1);
    assert.equal(f.overviewStates[0].isHidden, true);
});

test('EventManager delivers workspace lifetimes only while it owns the wallpaper correction', async t => {
    const f = await createEventsFixture(t);
    const calls = [];
    const events = f.createEvents({
        onOverviewZoomChanged: enabled => calls.push(enabled),
        onOverviewWorkspaceAdded: workspace => calls.push(['added', workspace]),
        onOverviewWorkspaceRemoved: workspace => calls.push(['removed', workspace])
    });
    const view = new f.OverviewWorkspaceView();
    const first = new f.OverviewWorkspace();
    view.add_child(first);
    f.overviewDisplay.add_child(view);
    events.configureOverviewZoom(true);
    assert.deepEqual(calls, [true, ['added', first]], 'Geometry is enabled before existing actors are supplied');
    const second = new f.OverviewWorkspace();
    view.add_child(second);
    second.destroy();
    assert.deepEqual(calls.slice(-2), [['added', second], ['removed', second]]);
    f.extensionManager.emit('extension-state-changed', { uuid, state: f.ExtensionState.ACTIVATING });
    assert.equal(calls.at(-1), false, 'Geometry is released synchronously for the companion');
    assert.equal(f.overviewDisplay.handlers.size, 0);
    assert.equal(view.handlers.size, 0);
    assert.equal(first.handlers.size, 0);
    view.add_child(new f.OverviewWorkspace());
    assert.equal(calls.at(-1), false, 'No actors are supplied after yielding');
});


test('setup failure suppresses observation until an explicit toggle retry', async t => {
    const f = await createEventsFixture(t);
    let attempts = 0;
    const added = [];
    const events = f.createEvents({
        onOverviewZoomChanged: enabled => {
            if (enabled)
                return ++attempts > 1;
        },
        onOverviewWorkspaceAdded: workspace => added.push(workspace)
    });
    const view = new f.OverviewWorkspaceView();
    view.add_child(new f.OverviewWorkspace());
    f.overviewDisplay.add_child(view);
    events.configureOverviewZoom(true);
    events.configureOverviewZoom(true);
    assert.equal(attempts, 1);
    assert.equal(f.overviewDisplay.handlers.size, 0);
    assert.deepEqual(added, []);
    events.configureOverviewZoom(false);
    events.configureOverviewZoom(true);
    assert.equal(attempts, 2);
    assert.equal(added.length, 1);
});

test('workspace failure suppresses additions but retains destruction delivery', async t => {
    const f = await createEventsFixture(t);
    const added = [];
    const removed = [];
    const events = f.createEvents({
        onOverviewZoomChanged: () => true,
        onOverviewWorkspaceAdded: workspace => { added.push(workspace); return false; },
        onOverviewWorkspaceRemoved: workspace => removed.push(workspace)
    });
    const view = new f.OverviewWorkspaceView();
    f.overviewDisplay.add_child(view);
    events.configureOverviewZoom(true);
    const first = new f.OverviewWorkspace();
    view.add_child(first);
    view.add_child(new f.OverviewWorkspace());
    assert.deepEqual(added, [first]);
    first.destroy();
    assert.deepEqual(removed, [first]);
    events.destroy();
    assert.equal(f.overviewDisplay.handlers.size, 0);
    assert.equal(view.handlers.size, 0);
});
