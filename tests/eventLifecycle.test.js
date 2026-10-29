import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEventsFixture } from './fixtures/events.js';

for (const [windowBehavior, overviewBehavior, overviewTransition, windowSignals, overviewSignals, progressSignals] of [
    ['keep-gradient', 'do-nothing', false, 0, 0, 0],
    ['keep-gradient', 'do-nothing', true, 0, 0, 0],
    ['apply-style', 'do-nothing', true, 3, 4, 0],
    ['keep-gradient', 'apply-style', false, 0, 4, 0],
    ['keep-gradient', 'keep-theme', true, 0, 4, 1],
    ['apply-style', 'apply-style', true, 3, 4, 1]
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
    assert.equal(snapshot.overview.hidden, false, 'Passive snapshots still read current visibility');
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

test('overview without gesture blending refreshes exit state without a progress subscription', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure({ ...f.config, overviewBehavior: 'do-nothing', overviewTransition: true });
    assert.equal(f.adjustment.handlers.size, 0);
    f.adjustment.value = 0.4;
    f.adjustment.emit('notify::value');
    assert.equal(f.overviewStates.length, 0);
    f.first.y = 42;
    f.overview.emit('hiding');
    assert.equal(f.overviewStates.at(-1).effectStrength, 0.75);
    f.first.y = 62;
    f.overview.emit('hidden');
    assert.equal(f.overviewStates.at(-1).effectStrength, 0.25, 'Fully hidden restores fresh desktop state');
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

test('switching to main-only retains overview lifecycle until hidden and then detaches', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure(f.config);
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    f.overview.emit('showing');
    const mainOnly = { ...f.config, windowBehavior: 'keep-gradient', overviewBehavior: 'do-nothing' };
    events.configure(mainOnly);
    assert.equal(f.first.handlers.size, 0);
    assert.equal(f.overview.handlers.size, 4, 'Hold still needs its final exit notification');
    assert.equal(f.adjustment.handlers.size, 0);
    f.overview.visible = false;
    f.overview.visibleTarget = false;
    f.overview.emit('hidden');
    assert.equal(f.overviewStates.at(-1).hidden, true);
    assert.equal(f.overviewStates.at(-1).effectStrength, 0);
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
    assert.equal(snapshot.overview.hidden, false);
    assert.equal(f.overview.handlers.size, 4);
    assert.equal(f.adjustment.handlers.size, 0);
    f.overview.visible = false;
    f.overview.visibleTarget = false;
    f.overview.emit('hidden');
    assert.equal(f.overviewStates.at(-1).hidden, true);
});

test('non-callable overview adjustment falls back to lifecycle observation', async t => {
    const f = await createEventsFixture(t);
    f.overview._overview.controls._stateAdjustment = { value: 0, connect: true };
    const snapshot = f.createEvents().configure(f.config);
    assert.equal(snapshot.overview.progress, null);
    assert.equal(f.overview.handlers.size, 4);
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
