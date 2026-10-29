import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getObservationNeeds } from '../src/gradient/appearance.js';
import { createEventsFixture } from './fixtures/events.js';
import { createRendererFixture } from './fixtures/renderer.js';

for (const workspaceGestureBlending of [false, true]) {
    for (const windowBehavior of ['keep-gradient', 'keep-theme', 'apply-style']) {
        test(`workspace progress requirements: ${windowBehavior}, blending ${workspaceGestureBlending}`, async t => {
            const f = await createEventsFixture(t);
            const config = { ...f.config, windowBehavior, workspaceGestureBlending };
            const needs = getObservationNeeds(config);
            assert.equal(needs.isWorkspaceProgressNeeded, windowBehavior !== 'keep-gradient' && workspaceGestureBlending);
            const same = { ...config, gradients: { ...config.gradients, alternate: config.gradients.main } };
            assert.equal(getObservationNeeds(same).isWorkspaceProgressNeeded, windowBehavior === 'keep-theme' && workspaceGestureBlending);
        });
    }
}

test('workspace blending off never reads swipe APIs or handles swipe frames, but preserves normal switching', async t => {
    const f = await createEventsFixture(t);
    Object.defineProperty(f.controller, '_swipeTracker', { get() { throw new Error('Disabled blending read the swipe tracker'); } });
    Object.defineProperty(f.controller, '_switchData', { get() { throw new Error('Disabled blending read the swipe group'); } });
    const events = f.createEvents();
    const config = { ...f.config, workspaceGestureBlending: false };
    const snapshot = events.configure(config);
    assert.equal(snapshot.workspaceTransition, null);
    assert.equal(f.workspaceManager.handlers.size, 1);
    assert.equal(f.swipeTracker.handlers.size, 0);
    const connections = f.workspaceManager.nextId;
    events.configure(config);
    assert.equal(f.workspaceManager.nextId, connections, 'Reconfiguration keeps the normal switch handler');
    f.reads.scans = 0;
    f.swipeTracker.emit('begin');
    assert.equal(f.reads.scans, 0);
    assert.equal(f.windowStates.length, 0);
    f.state.activeWorkspace = f.workspaceB;
    f.workspaceManager.emit('workspace-switched');
    assert.equal(f.windowStates.length, 1);
    assert.equal(f.windowStates[0].currentWorkspace, f.workspaceB);
    assert.equal(f.windowStates[0].effectStrength, 1);
});

test('turning workspace blending off and on during a swipe reconciles silently and reuses normal observers', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure(f.config);
    const group = f.startSwipe(f.workspaceA, f.workspaceB, 0.4);
    const normalConnections = f.workspaceManager.nextId;
    const windowConnections = f.first.nextId;
    const before = f.windowStates.length;
    const off = { ...f.config, workspaceGestureBlending: false };
    assert.equal(events.configure(off).workspaceTransition, null);
    assert.equal(group.handlers.size, 0);
    assert.equal(f.swipeTracker.handlers.size, 0);
    f.reads.scans = 0;
    group.progress = 0.7;
    group.emit('notify::progress');
    group.emit('destroy');
    assert.equal(f.windowStates.length, before, 'Disabled group handlers cannot emit stale progress or completion');
    assert.equal(f.reads.scans, 0, 'Disabled progress does not scan either endpoint');
    const snapshot = events.configure(f.config);
    assert.equal(snapshot.workspaceTransition.progress, 0.7, 'Enabling adopts the current group');
    assert.equal(snapshot.workspaceTransition.startStrength, 0.5);
    assert.equal(snapshot.workspaceTransition.endStrength, 1);
    assert.equal(f.windowStates.length, before, 'Adoption returns state without rendering a partial snapshot');
    const trackerConnections = f.swipeTracker.nextId;
    const groupConnections = group.nextId;
    events.configure(f.config);
    assert.equal(f.swipeTracker.nextId, trackerConnections);
    assert.equal(group.nextId, groupConnections);
    assert.equal(f.workspaceManager.nextId, normalConnections);
    assert.equal(f.first.nextId, windowConnections);
    group.progress = 0.2;
    group.emit('notify::progress');
    assert.equal(f.windowStates.at(-1).progress, 0.2, 'Resumed progress handles reversal');
    group.emit('destroy');
    assert.equal(f.windowStates.at(-1).type, 'complete');
    assert.equal(f.windowStates.at(-1).currentWorkspace, f.workspaceA, 'Cancellation restores the active workspace');
});

test('enabling workspace blending adopts multi-workspace endpoints and follows cancellation', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure({ ...f.config, workspaceGestureBlending: false });
    const workspaceC = { index: () => 2, list_windows: () => [] };
    const group = f.startSwipe(f.workspaceA, f.workspaceB, 1.5);
    group._workspaceGroups.push({ workspace: workspaceC });
    group.getSnapPoints = () => [0, 1, 2];
    assert.equal(group.handlers.size, 0, 'Off never adopts a newly begun group');
    const snapshot = events.configure(f.config);
    assert.equal(snapshot.workspaceTransition.startStrength, 1);
    assert.equal(snapshot.workspaceTransition.endStrength, 0);
    assert.equal(snapshot.workspaceTransition.progress, 0.5);
    group.progress = 0.25;
    group.emit('notify::progress');
    assert.equal(f.windowStates.at(-1).startStrength, 0.5);
    assert.equal(f.windowStates.at(-1).endStrength, 1);
    assert.equal(f.windowStates.at(-1).progress, 0.25);
    group.emit('destroy');
    assert.equal(f.windowStates.at(-1).currentWorkspace, f.workspaceA);
});

for (const overviewTransition of [false, true]) {
    for (const workspaceGestureBlending of [false, true]) {
        test(`workspace and overview gesture controls are independent: ${workspaceGestureBlending}, ${overviewTransition}`, async t => {
            const f = await createEventsFixture(t);
            f.createEvents().configure({ ...f.config, workspaceGestureBlending, overviewTransition });
            assert.equal(f.swipeTracker.handlers.size, workspaceGestureBlending ? 1 : 0);
            assert.equal(f.adjustment.handlers.size, overviewTransition ? 1 : 0);
            assert.equal(f.workspaceManager.handlers.size, 1);
        });
    }
}

test('overview ownership prevents new or adopted desktop swipes until hidden', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    const config = { ...f.config, overviewBehavior: 'apply-style' };
    events.configure(config);
    const group = f.startSwipe(f.workspaceA, f.workspaceB, 0.4);
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    f.overview.emit('showing');
    assert.equal(group.handlers.size, 0);
    const before = f.windowStates.length;
    f.reads.scans = 0;
    const duringOverview = f.startSwipe(f.workspaceA, f.workspaceB, 0.8);
    assert.equal(duringOverview.handlers.size, 0);
    assert.equal(f.windowStates.length, before);
    assert.equal(f.reads.scans, 0, 'Overview-owned gestures do not rescan desktop endpoints');
    events.configure({ ...config, workspaceGestureBlending: false });
    const snapshot = events.configure(config);
    assert.equal(snapshot.workspaceTransition, null);
    assert.equal(duringOverview.handlers.size, 0);
    f.overview.visible = false;
    f.overview.visibleTarget = false;
    f.overview.emit('hidden');
    const resumed = f.startSwipe(f.workspaceA, f.workspaceB, 0.2);
    assert.equal(resumed.handlers.size, 2);
    assert.equal(f.windowStates.at(-1).progress, 0.2);
});

test('workspace blending off keeps the existing 150 ms discrete workspace fade', async t => {
    const f = await createEventsFixture(t);
    const r = await createRendererFixture(t);
    const renderer = r.createRenderer();
    const events = f.createEvents({
        onWindowChanged: (state, changed) => renderer.updateWindow(state, changed),
        onWindowProgress: state => renderer.followWindow(state),
        onWorkspaceProgress: state => renderer.updateWorkspaceProgress(state),
        onWorkspaceCompleted: state => renderer.completeWorkspace(state)
    });
    const config = { ...r.settings, ...f.config, workspaceGestureBlending: false };
    renderer.configure(config, events.configure(config));
    r.state.animationsEnabled = true;
    const group = f.startSwipe(f.workspaceA, f.workspaceB, 0.7);
    assert.equal(group.handlers.size, 0);
    assert.equal(r.timelines.size, 0);
    f.state.activeWorkspace = f.workspaceB;
    f.workspaceManager.emit('workspace-switched');
    assert.equal(r.timelines.size, 1);
    const timeline = [...r.timelines][0];
    assert.equal(timeline.duration, 150);
    timeline.advance(1);
    r.expectStyle('panel-maximized-gradient');
});

test('toggling workspace blending updates Do nothing desktop state while overview is visible', async t => {
    const f = await createEventsFixture(t);
    const r = await createRendererFixture(t);
    const renderer = r.createRenderer();
    const events = f.createEvents({
        onWindowChanged: (state, changed) => renderer.updateWindow(state, changed),
        onWindowProgress: state => renderer.followWindow(state),
        onWorkspaceProgress: state => renderer.updateWorkspaceProgress(state),
        onWorkspaceCompleted: state => renderer.completeWorkspace(state),
        onOverviewChanged: state => renderer.updateOverview(state)
    });
    const config = { ...r.settings, ...f.config, overviewBehavior: 'do-nothing' };
    renderer.configure(config, events.configure(config));
    f.startSwipe(f.workspaceA, f.workspaceB, 0.4);
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    f.overview.emit('showing');
    assert.equal(r.children.size, 2);
    for (const workspaceGestureBlending of [false, true, false]) {
        const next = { ...config, workspaceGestureBlending };
        renderer.configure(next, events.configure(next));
        assert.equal([...r.children][1].opacity, 128, 'Reconfiguration adopts the current desktop strength');
        assert.equal(f.overview.handlers.size, 0);
        assert.equal(r.timelines.size, 0);
    }
    f.state.activeWorkspace = f.workspaceB;
    f.workspaceManager.emit('workspace-switched');
    r.expectStyle('panel-maximized-gradient');
    f.overview.visible = false;
    f.overview.visibleTarget = false;
    f.overview.emit('hidden');
    r.expectStyle('panel-maximized-gradient');
    assert.equal(r.children.size, 0);
});
