import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEventsFixture } from './fixtures/events.js';

test('geometry bursts schedule one fresh scan before redraw', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure(f.config);
    f.reads.scans = 0;
    for (let i = 0; i < 100; i++) {
        f.first.y = 42;
        f.first.emit(i % 2 ? 'size-changed' : 'position-changed');
    }
    assert.equal(f.pending.size, 1);
    assert.equal(f.reads.scans, 0, 'Geometry callbacks do not calculate synchronously');
    f.first.y = 62;
    f.flush();
    assert.equal(f.reads.scans, 1);
    assert.equal(f.windowStates.length, 1);
    assert.equal(f.windowStates[0].effectStrength, 0.25, 'The flush reads current geometry');
    assert.equal(f.pending.size, 0);
});

test('irrelevant geometry is ignored while sticky windows and workspace departure update state', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure(f.config);
    f.reads.scans = 0;
    f.second.emit('position-changed');
    f.first.primary = false;
    f.first.emit('position-changed');
    assert.equal(f.pending.size, 0);
    assert.equal(f.reads.scans, 0);
    f.shell.display.emit('window-left-monitor');
    assert.equal(f.windowStates.at(-1).effectStrength, 0, 'Leaving the primary monitor clears the old contribution');
    f.first.primary = true;
    f.shell.display.emit('window-left-monitor');
    assert.equal(f.windowStates.at(-1).effectStrength, 0.5, 'Monitor migration refreshes immediately');
    f.second.sticky = true;
    f.second.emit('position-changed');
    f.flush();
    assert.equal(f.windowStates.at(-1).effectStrength, 1);
    f.second.sticky = false;
    f.first.workspace = f.workspaceB;
    f.first.emit('workspace-changed');
    f.flush();
    assert.equal(f.windowStates.at(-1).effectStrength, 0, 'Departing windows cannot be filtered out of membership notifications');
});

for (const styleTrigger of ['maximized', 'proximity']) {
    test(`${styleTrigger} refreshes after primary-monitor reassignment without window events`, async t => {
        const f = await createEventsFixture(t);
        f.first.get_maximize_flags = () => 3;
        f.second.workspace = f.workspaceA;
        f.second.primary = false;
        f.second.y = 200;
        const events = f.createEvents();
        const snapshot = events.configure({ ...f.config, styleTrigger, proximityTransition: false });
        assert.equal(snapshot.window.effectStrength, 1);
        f.first.emit('size-changed');
        assert.equal(f.pending.size, 1);

        f.first.primary = false;
        f.second.primary = true;
        f.layoutManager.primaryMonitor = { y: 100 };
        f.reads.scans = 0;
        f.layoutManager.emit('monitors-changed');
        assert.equal(f.reads.scans, 1, 'Monitor changes calculate the current workspace immediately');
        assert.equal(f.windowStates.length, 1);
        assert.equal(f.windowStates[0].effectStrength, 0, 'The old primary monitor no longer contributes');
        assert.equal(f.pending.size, 0, 'Monitor changes cancel pending geometry');
        f.flush();
        assert.equal(f.windowStates.length, 1);

        f.first.primary = true;
        f.second.primary = false;
        f.layoutManager.primaryMonitor = { y: 0 };
        f.layoutManager.emit('monitors-changed');
        assert.equal(f.windowStates.at(-1).effectStrength, 1, 'Reassigning the primary monitor restores its contribution');
        f.layoutManager.emit('monitors-changed');
        assert.equal(f.windowStates.length, 3, 'Monitor changes force a refresh even with unchanged strength');
    });
}

test('workspace switching refreshes equal strengths', async t => {
    const f = await createEventsFixture(t);
    f.second.y = f.first.y;
    const events = f.createEvents();
    events.configure(f.config);
    f.state.activeWorkspace = f.workspaceB;
    f.workspaceManager.emit('workspace-switched');
    assert.equal(f.windowStates.length, 1);
    assert.equal(f.windowStates[0].effectStrength, 0.5);
});

for (const [distance, y, progressive, expected] of [
    [40, 72, false, 0], [40, 71, false, 1], [40, 52, false, 1],
    [40, 52, true, 0.5], [40, 32, true, 1], [40, 12, true, 1],
    [0, 33, false, 0], [0, 32, false, 1], [0, 31, true, 1]
]) {
    test(`proximity threshold: distance ${distance}, y ${y}, progressive ${progressive}`, async t => {
        const f = await createEventsFixture(t);
        f.first.y = y;
        const events = f.createEvents();
        const snapshot = events.configure({ ...f.config, proximityDistance: distance, proximityTransition: progressive });
        assert.equal(snapshot.window.effectStrength, expected);
    });
}

test('binary proximity suppresses movement within the same region and exits early', async t => {
    const f = await createEventsFixture(t);
    f.second.workspace = f.workspaceA;
    const events = f.createEvents();
    events.configure({ ...f.config, proximityTransition: false });
    assert.equal(f.reads.geometry, 1, 'Binary detection stops at the first matching window');
    for (const y of [33, 42, 52, 62, 71]) {
        f.first.y = y;
        f.first.emit('position-changed');
        f.flush();
    }
    assert.equal(f.windowStates.length, 0, 'Raw distance changes do not republish binary state');
    f.first.y = 32;
    f.reads.geometry = 0;
    events.configure(f.config);
    assert.equal(f.reads.geometry, 1, 'Progressive detection stops at full strength');
});

for (const action of ['minimize', 'destroy', 'unminimize', 'window-created', 'window-left-monitor', 'monitors-changed', 'unlock-screen', 'workspace-switched', 'configure', 'disable']) {
    test(`${action} cancels stale pending geometry`, async t => {
        const f = await createEventsFixture(t);
        const events = f.createEvents();
        events.configure(f.config);
        f.first.y = 42;
        f.first.emit('position-changed');
        assert.equal(f.pending.size, 1);
        if (action === 'configure') {
            const snapshot = events.configure({ ...f.config, proximityDistance: 80 });
            assert.equal(snapshot.window.effectStrength, 0.875);
        } else if (action === 'disable') {
            events.destroy();
        } else if (['minimize', 'destroy', 'unminimize'].includes(action)) {
            f.shell.window_manager.emit(action, { get_meta_window: () => f.first });
            assert.equal(f.windowStates.at(-1).effectStrength, action === 'unminimize' ? 0.75 : 0);
        } else if (action === 'window-created') {
            const created = new f.Window(3, 32);
            created.workspace = f.workspaceA;
            f.state.windows.push(created);
            f.shell.display.emit(action, created);
            assert.equal(f.windowStates.at(-1).effectStrength, 1);
        } else {
            const target = { 'window-left-monitor': f.shell.display, 'monitors-changed': f.layoutManager, 'unlock-screen': f.screenShield, 'workspace-switched': f.workspaceManager }[action];
            if (action === 'workspace-switched')
                f.state.activeWorkspace = f.workspaceB;
            target.emit(action);
            assert.equal(f.windowStates.at(-1).effectStrength, action === 'workspace-switched' ? 1 : 0.75);
        }
        assert.equal(f.pending.size, 0);
        const count = f.windowStates.length;
        f.flush();
        assert.equal(f.windowStates.length, count, 'No delayed callback overwrites structural state');
    });
}

test('queued geometry follows the active workspace at flush time', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure(f.config);
    f.first.emit('position-changed');
    f.state.activeWorkspace = f.workspaceB;
    f.flush();
    assert.equal(f.windowStates.at(-1).effectStrength, 1);
});

test('same-workspace swipe endpoints share a fresh calculation', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure(f.config);
    f.reads.scans = 0;
    f.startSwipe(f.workspaceA, f.workspaceA, 0.5);
    assert.equal(f.reads.scans, 1);
    assert.equal(f.windowStates.at(-1).startStrength, 0.5);
    assert.equal(f.windowStates.at(-1).endStrength, 0.5);
});
