import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEventsFixture } from './fixtures/events.js';
import { createRendererFixture } from './fixtures/renderer.js';

for (const [windowBehavior, overviewBehavior, overviewTransition, windowSignals, overviewSignals, progressSignals] of [
    ['keep-gradient', 'do-nothing', false, 0, 0, 0],
    ['keep-gradient', 'do-nothing', true, 0, 0, 0],
    ['apply-style', 'do-nothing', true, 3, 0, 0],
    ['keep-gradient', 'apply-style', false, 0, 0, 0],
    ['keep-gradient', 'keep-theme', true, 0, 3, 1],
    ['apply-style', 'apply-style', true, 3, 3, 1]
]) {
    test(`subscription requirements: ${windowBehavior}, ${overviewBehavior}, gestures ${overviewTransition}`, async t => {
        const f = await createEventsFixture(t);
        const events = f.createEvents();
        assert([...f.targets].every(target => target.handlers.size === 0), 'Construction attaches nothing');
        events.configure({ ...f.config, windowBehavior, overviewBehavior, overviewTransition });
        assert.equal(f.first.handlers.size, windowSignals);
        assert.equal(f.workspaceManager.handlers.size, windowSignals ? 1 : 0);
        assert.equal(f.swipeTracker.handlers.size, windowSignals ? 1 : 0);
        assert.equal(f.overview.handlers.size, overviewSignals);
        assert.equal(f.adjustment.handlers.size, progressSignals);
        assert.equal(f.reads.scans, windowSignals ? 1 : 0, 'Configuration reads only the final required state');
        assert.equal(f.windowStates.length, 0, 'Reconciliation never publishes intermediate state');
        assert.equal(f.overviewStates.length, 0);
    });
}

test('main-only startup inside overview attaches no observers or window scans', async t => {
    const f = await createEventsFixture(t);
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    const events = f.createEvents();
    const snapshot = events.configure({ ...f.config, windowBehavior: 'keep-gradient', overviewBehavior: 'do-nothing' });
    assert.equal(snapshot.overview.isHidden, false, 'Passive snapshots still read current visibility');
    assert.equal(snapshot.window.effectStrength, 0);
    assert.equal(f.reads.scans, 0);
    assert([...f.targets].every(target => target.handlers.size === 0));
});

test('overview progress uses observed strength and deduplicates clamped app-grid progress', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure(f.config);
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    f.overview.emit('showing');
    f.reads.scans = 0;
    const before = f.overviewStates.length;
    for (const value of [0.5, 1, 1.25, 1.5, 2]) {
        f.adjustment.value = value;
        f.adjustment.emit('notify::value');
    }
    assert.equal(f.reads.scans, 0, 'Gesture notifications never rescan windows');
    assert.equal(f.overviewStates.length - before, 2, 'Only changed clamped progress is forwarded');
    assert.equal(f.overviewStates.at(-1).effectStrength, 0.5);
    f.first.y = 42;
    f.first.emit('position-changed');
    f.flush();
    f.adjustment.value = 0.75;
    f.adjustment.emit('notify::value');
    assert.equal(f.overviewStates.at(-1).effectStrength, 0.75, 'Progress uses the latest observed window state');
});

test('Do nothing ignores overview lifecycle and gesture notifications', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure({ ...f.config, overviewBehavior: 'do-nothing', overviewTransition: true });
    assert.equal(f.adjustment.handlers.size, 0);
    f.adjustment.value = 0.4;
    f.adjustment.emit('notify::value');
    assert.equal(f.overviewStates.length, 0);
    f.first.y = 42;
    f.overview.emit('hiding');
    assert.equal(f.overviewStates.length, 0, 'Do nothing does no work on hiding');
    f.first.y = 62;
    f.overview.emit('hidden');
    assert.equal(f.overviewStates.length, 0, 'Fully hidden needs no special desktop refresh');
});

test('progress arriving before showing does not rescan windows', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure(f.config);
    f.reads.scans = 0;
    f.adjustment.value = 0.2;
    f.adjustment.emit('notify::value');
    assert.equal(f.reads.scans, 0);
    assert.equal(f.overviewStates.at(-1).effectStrength, 0.5);
});

test('overview interruption retains the latest observed workspace state', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure(f.config);
    f.startSwipe(f.workspaceA, f.workspaceB, 0.6);
    f.state.activeWorkspace = f.workspaceB;
    f.workspaceManager.emit('workspace-switched');
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    f.overview.emit('showing');
    assert.equal(f.overviewStates.at(-1).effectStrength, 1);
});

test('switching to main-only Do nothing immediately detaches overview lifecycle', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure(f.config);
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    f.overview.emit('showing');
    const mainOnly = { ...f.config, windowBehavior: 'keep-gradient', overviewBehavior: 'do-nothing' };
    events.configure(mainOnly);
    assert.equal(f.first.handlers.size, 0);
    assert.equal(f.overview.handlers.size, 0);
    assert.equal(f.adjustment.handlers.size, 0);
    f.overview.visible = false;
    f.overview.visibleTarget = false;
    f.overview.emit('hidden');
    assert.equal(f.overviewStates.length, 1, 'Only the earlier showing event was delivered');
    assert([...f.targets].every(target => target.handlers.size === 0));
    f.reads.scans = 0;
    events.configure(mainOnly);
    assert.equal(f.reads.scans, 0);
    events.configure(f.config);
    assert.equal(f.adjustment.handlers.size, 1, 'Re-enabling restores the required observers');
});

test('missing overview adjustment retains lifecycle fallback and current visibility', async t => {
    const f = await createEventsFixture(t);
    delete f.overview._overview;
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    const events = f.createEvents();
    const snapshot = events.configure(f.config);
    assert.equal(snapshot.overview.progress, null);
    assert.equal(snapshot.overview.isHidden, false);
    assert.equal(f.overview.handlers.size, 3);
    assert.equal(f.adjustment.handlers.size, 0);
    f.overview.visible = false;
    f.overview.visibleTarget = false;
    f.overview.emit('hidden');
    assert.equal(f.overviewStates.at(-1).isHidden, true);
});

test('non-callable overview adjustment falls back to lifecycle observation', async t => {
    const f = await createEventsFixture(t);
    f.overview._overview.controls._stateAdjustment = { value: 0, connect: true };
    const snapshot = f.createEvents().configure(f.config);
    assert.equal(snapshot.overview.progress, null);
    assert.equal(f.overview.handlers.size, 3);
});

test('hundreds of mode switches release vanished windows, pending refreshes and swipe handlers', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    for (let i = 0; i < 200; i++) {
        events.configure(f.config);
        const vanished = new f.Window(i + 3, 45);
        vanished.workspace = f.workspaceA;
        f.state.windows.push(vanished);
        f.shell.display.emit('window-created', vanished);
        vanished.emit('position-changed');
        const group = f.startSwipe(f.workspaceA, f.workspaceB, 0.4);
        f.state.windows = [f.first, f.second];
        events.configure({ ...f.config, windowBehavior: 'keep-gradient', overviewBehavior: 'do-nothing' });
        assert.equal(group.handlers.size, 0);
        assert.equal(vanished.handlers.size, 0);
        assert.equal(f.pending.size, 0);
        assert([...f.targets].every(target => target.handlers.size === 0));
        events.configure({ ...f.config, styleTrigger: 'maximized' });
        assert.equal(f.first.handlers.size, 2);
        assert.equal(f.layoutManager.handlers.size, 1);
    }
    events.destroy();
    events.destroy();
    assert([...f.targets].every(target => target.handlers.size === 0));
});

for (const scene of ['partial proximity', 'interrupted fade', 'workspace swipe']) {
    test(`real event coordination releases ${scene} immediately when Do nothing becomes main-only`, async t => {
        const f = await createEventsFixture(t);
        const r = await createRendererFixture(t);
        r.state.animationsEnabled = true;
        const renderer = r.createRenderer();
        const events = f.createEvents({
            onWindowProgress: state => renderer.followWindow(state),
            onWindowChanged: (state, isWorkspaceChanged) => renderer.updateWindow(state, isWorkspaceChanged),
            onWorkspaceProgress: state => renderer.updateWorkspaceProgress(state),
            onWorkspaceCompleted: state => renderer.completeWorkspace(state),
            onOverviewChanged: state => renderer.updateOverview(state)
        });
        const config = { ...r.settings, ...f.config, overviewBehavior: 'do-nothing' };
        if (scene === 'interrupted fade')
            f.first.y = 100;
        renderer.configure(config, events.configure(config));
        for (const timeline of [...r.timelines])
            timeline.advance(1);
        if (scene === 'interrupted fade') {
            const created = new f.Window(3, 42);
            created.workspace = f.workspaceA;
            f.state.windows.push(created);
            f.shell.display.emit('window-created', created);
            [...r.timelines][0].advance(0.4);
        } else if (scene === 'workspace swipe') {
            const group = f.startSwipe(f.workspaceA, f.workspaceB, 0.4);
            f.state.activeWorkspace = f.workspaceB;
            f.workspaceManager.emit('workspace-switched');
            assert.equal(group.handlers.size, 2);
        }
        const layers = [...r.children];
        assert.equal(layers.length, 2);
        f.overview.visible = true;
        f.overview.visibleTarget = true;
        f.overview.emit('showing');
        const mainOnly = { ...config, windowBehavior: 'keep-gradient' };
        renderer.configure(mainOnly, events.configure(mainOnly));
        assert.equal(r.children.size, 0, 'Settings changes apply while overview remains visible');
        assert.equal(f.overview.handlers.size, 0);
        f.overview.visible = false;
        f.overview.visibleTarget = false;
        f.overview.emit('hidden');
        r.expectStyle('panel-gradient');
        assert.equal(r.children.size, 0);
        assert.equal(r.timelines.size, 0);
        assert([...f.targets].every(target => target.handlers.size === 0));
    });
}

test('real event coordination stops and resumes overview progress subscriptions during a gesture', async t => {
    const f = await createEventsFixture(t);
    const r = await createRendererFixture(t);
    r.state.animationsEnabled = true;
    const renderer = r.createRenderer();
    const events = f.createEvents({
        onWindowProgress: state => renderer.followWindow(state),
        onWindowChanged: (state, isWorkspaceChanged) => renderer.updateWindow(state, isWorkspaceChanged),
        onWorkspaceProgress: state => renderer.updateWorkspaceProgress(state),
        onWorkspaceCompleted: state => renderer.completeWorkspace(state),
        onOverviewChanged: state => renderer.updateOverview(state)
    });
    const config = { ...r.settings, ...f.config };
    renderer.configure(config, events.configure(config));
    for (const timeline of [...r.timelines])
        timeline.advance(1);
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    f.overview.emit('showing');
    f.adjustment.value = 0.4;
    f.adjustment.emit('notify::value');
    assert.equal([...r.children][1].opacity, 102);
    const timed = { ...config, overviewTransition: false };
    renderer.configure(timed, events.configure(timed));
    assert.equal(f.adjustment.handlers.size, 0);
    assert.equal(r.timelines.size, 1, 'Existing timed settling remains intact');
    f.adjustment.value = 0.8;
    f.adjustment.emit('notify::value');
    assert.equal([...r.children][1].opacity, 102);
    const ignoredOverview = { ...config, overviewBehavior: 'do-nothing' };
    renderer.configure(ignoredOverview, events.configure(ignoredOverview));
    assert.equal(r.timelines.size, 0);
    renderer.configure(config, events.configure(config));
    assert.equal(f.adjustment.handlers.size, 1);
    assert.equal([...r.children][1].opacity, 204, 'Resuming reads current gesture progress');
    events.destroy();
    renderer.destroy();
    assert.equal(f.pending.size, 0);
    assert.equal(r.children.size, 0);
    assert.equal(r.timelines.size, 0);
});

test('unchanged progressive geometry takes over a structural fade once', async t => {
    const f = await createEventsFixture(t);
    const r = await createRendererFixture(t);
    const renderer = r.createRenderer();
    const events = f.createEvents({
        onWindowProgress: state => renderer.followWindow(state),
        onWindowChanged: (state, isWorkspaceChanged) => renderer.updateWindow(state, isWorkspaceChanged)
    });
    const config = { ...r.settings, ...f.config };
    renderer.configure(config, events.configure(config));
    r.state.animationsEnabled = true;
    const created = new f.Window(3, 42);
    created.workspace = f.workspaceA;
    f.state.windows.push(created);
    f.shell.display.emit('window-created', created);
    [...r.timelines][0].advance(0.4);
    assert.equal([...r.children][1].opacity, 153);
    created.emit('position-changed');
    f.flush();
    assert.equal(r.timelines.size, 0, 'Horizontal movement still takes over the structural fade');
    assert.equal([...r.children][1].opacity, 191);
    const count = f.windowStates.length;
    created.emit('size-changed');
    f.flush();
    assert.equal(f.windowStates.length, count, 'Subsequent identical geometry is deduplicated');
});

test('unchanged geometry takes over a queued workspace fallback fade', async t => {
    const f = await createEventsFixture(t);
    const r = await createRendererFixture(t);
    const renderer = r.createRenderer();
    const events = f.createEvents({
        onWindowProgress: state => renderer.followWindow(state),
        onWindowChanged: (state, isWorkspaceChanged) => renderer.updateWindow(state, isWorkspaceChanged)
    });
    const config = { ...r.settings, ...f.config };
    renderer.configure(config, events.configure(config));
    r.state.animationsEnabled = true;
    f.first.emit('position-changed');
    f.state.activeWorkspace = f.workspaceB;
    f.flush();
    assert.equal(r.timelines.size, 1, 'Queued geometry preserves the workspace fallback fade');
    f.second.emit('position-changed');
    f.flush();
    assert.equal(r.timelines.size, 0, 'The next geometry input takes over on the new workspace');
    r.expectStyle('panel-maximized-gradient');
});
