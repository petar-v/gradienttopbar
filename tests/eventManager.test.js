import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEventsFixture } from './fixtures/events.js';

test('configuration exposes lifecycle operations and returns one final snapshot', async t => {
    const fixture = await createEventsFixture(t);
    const { windowStates, overviewStates, workspaceA, EventManager, config } = fixture;
    assert.deepEqual(Object.getOwnPropertyNames(EventManager.prototype).sort(),
        ['configure', 'constructor', 'destroy', 'setOverviewCleanupNeeded'], 'Only lifecycle operations and the narrow cleanup requirement are public');
    const events = fixture.createEvents();
    assert.equal(typeof events.configure, 'function', 'EventManager configures its observers');
    const initial = events.configure(config);
    assert.equal(initial.window.effectStrength, 0.5, 'Nearby windows supply partial strength');
    assert.equal(initial.window.currentWorkspace, workspaceA, 'Configuration preserves the full window state');
    assert.equal(initial.overview.isHidden, true);
    assert.equal(windowStates.length, 0, 'Configuration returns a snapshot without intermediate rendering');
    assert.equal(overviewStates.length, 0);
});

test('equal strengths on different workspaces remain distinct states', async t => {
    const fixture = await createEventsFixture(t);
    const { second, workspaceB, state, windowStates, config } = fixture;
    second.y = 52;
    const events = fixture.createEvents();
    events.configure(config);
    state.activeWorkspace = workspaceB;
    second.emit('position-changed');
    fixture.flush();
    assert.equal(windowStates.length, 1, 'Workspace identity changes state even at equal strength');
    assert.equal(windowStates[0].effectStrength, 0.5);
    assert.equal(windowStates[0].currentWorkspace, workspaceB, 'Window callbacks preserve the full state');
    second.emit('position-changed');
    fixture.flush();
    assert.equal(windowStates.length, 2, 'Geometry takes over the workspace fallback at unchanged strength');
    second.emit('position-changed');
    fixture.flush();
    assert.equal(windowStates.length, 2, 'Subsequent identical geometry is deduplicated');
});

test('window movement, minimization and unlock publish the expected state', async t => {
    const fixture = await createEventsFixture(t);
    const { first, shell, screenShield, windowStates, config } = fixture;
    const events = fixture.createEvents();
    events.configure(config);
    let count = windowStates.length;
    first.emit('position-changed');
    fixture.flush();
    assert.equal(windowStates.length, count + 1, 'First geometry takes over any configured fade');
    first.emit('position-changed');
    fixture.flush();
    assert.equal(windowStates.length, count + 1, 'Subsequent unchanged geometry is not emitted again');
    first.y = 42;
    first.emit('position-changed');
    fixture.flush();
    assert.equal(windowStates.at(-1).effectStrength, 0.75, 'Window movement updates strength');
    shell.window_manager.emit('minimize', { get_meta_window: () => first });
    assert.equal(windowStates.at(-1).effectStrength, 0, 'Minimization excludes the window before its flag changes');
    shell.window_manager.emit('unminimize');
    assert.equal(windowStates.at(-1).effectStrength, 0.75, 'Unminimization restores the detected strength');
    count = windowStates.length;
    screenShield.emit('unlock-screen');
    assert.equal(windowStates.length, count + 1, 'Unlock forces a refresh');
});

test('workspace swipes refresh endpoints, retrace reversal and release completed listeners', async t => {
    const fixture = await createEventsFixture(t);
    const { first, second, workspaceA, workspaceB, state, workspaceManager, windowStates, startSwipe, config } = fixture;
    const events = fixture.createEvents();
    events.configure(config);
    first.y = 42;
    let group = startSwipe(workspaceA, workspaceB, 0.5);
    assert.equal(windowStates.at(-1).type, 'progress');
    assert.equal(windowStates.at(-1).startStrength, 0.75);
    assert.equal(windowStates.at(-1).endStrength, 1);
    let count = windowStates.length;
    first.y = 52;
    first.emit('position-changed');
    fixture.flush();
    assert.equal(windowStates.length, count, 'Window changes do not overwrite an active swipe');
    group.progress = 0.25;
    group.emit('notify::progress');
    assert.equal(windowStates.at(-1).progress, 0.25, 'A reversed swipe retraces progress');
    assert.equal(windowStates.at(-1).startStrength, 0.5, 'Swipe endpoints use fresh window state');
    state.activeWorkspace = workspaceB;
    workspaceManager.emit('workspace-switched');
    group.emit('destroy');
    assert.equal(windowStates.at(-1).type, 'complete');
    assert.equal(windowStates.at(-1).effectStrength, 1);
    assert.equal(group.handlers.size, 0, 'Completed swipe releases its connections');
    count = windowStates.length;
    second.emit('position-changed');
    fixture.flush();
    assert.equal(windowStates.length, count, 'Completion updates the deduplication baseline');
});

test('cancelled workspace swipes restore the active workspace', async t => {
    const fixture = await createEventsFixture(t);
    const { workspaceA, workspaceB, state, windowStates, startSwipe, config } = fixture;
    const events = fixture.createEvents();
    events.configure(config);
    state.activeWorkspace = workspaceB;
    const group = startSwipe(workspaceB, workspaceA, 0.4);
    group.progress = 0;
    group.emit('notify::progress');
    group.emit('destroy');
    assert.equal(windowStates.at(-1).effectStrength, 1, 'Cancellation restores the still-active workspace');
    assert.equal(windowStates.at(-1).currentWorkspace, workspaceB, 'Swipe completion preserves the full window state');
    assert.equal(windowStates.at(-1).type, 'complete');
});

test('overview interrupts swipes and forwards gesture progress', async t => {
    const fixture = await createEventsFixture(t);
    const { workspaceA, workspaceB, state, overview, adjustment, windowStates, overviewStates, startSwipe, config } = fixture;
    const events = fixture.createEvents();
    events.configure(config);
    state.activeWorkspace = workspaceB;
    const group = startSwipe(workspaceB, workspaceA, 0.5);
    overview.visible = true;
    overview.visibleTarget = true;
    overview.emit('showing');
    assert.equal(group.handlers.size, 0, 'Overview interrupts the desktop swipe');
    const count = windowStates.length;
    group.emit('destroy');
    assert.equal(windowStates.length, count, 'An interrupted swipe cannot emit stale completion');
    adjustment.value = 0.6;
    adjustment.emit('notify::value');
    assert.equal(overviewStates.at(-1).progress, 0.6);
    overview.visible = false;
    overview.visibleTarget = false;
    overview.emit('hidden');
});

test('reconfiguration preserves swipe connections and refreshes endpoint strengths', async t => {
    const fixture = await createEventsFixture(t);
    const { first, workspaceA, workspaceB, state, workspaceManager, windowStates, startSwipe, config } = fixture;
    const events = fixture.createEvents();
    events.configure(config);
    state.activeWorkspace = workspaceB;
    const group = startSwipe(workspaceB, workspaceA, 0.5);
    const connections = first.nextId;
    const swipeSnapshot = events.configure(config);
    assert.equal(first.nextId, connections, 'No-op configuration keeps detector connections');
    assert.equal(group.handlers.size, 2, 'Reconfiguration preserves swipe listeners');
    assert.equal(swipeSnapshot.workspaceTransition.progress, 0.5);
    const distanceSnapshot = events.configure({ ...config, proximityDistance: 80 });
    assert.equal(first.nextId, connections, 'Distance changes do not reconnect the detector');
    assert.equal(distanceSnapshot.workspaceTransition.endStrength, 0.75, 'Distance changes refresh swipe endpoints');
    events.configure(config);
    state.activeWorkspace = workspaceA;
    workspaceManager.emit('workspace-switched');
    group.emit('destroy');
    assert.equal(windowStates.at(-1).effectStrength, 0.5, 'Keyboard switching refreshes the workspace');
});

test('disabling window interaction releases vanished windows and leaves overview active', async t => {
    const fixture = await createEventsFixture(t);
    const { first, second, state, shell, workspaceManager, swipeTracker, overview, screenShield, layoutManager, overviewStates, Window, config } = fixture;
    const events = fixture.createEvents();
    events.configure(config);
    // A disappearing window must be disconnected even when no longer in the display list.
    const vanished = new Window(3, 100);
    state.windows.push(vanished);
    shell.display.emit('window-created', vanished);
    assert(vanished.handlers.size > 0);
    state.windows = [first, second];
    const disabled = events.configure({ ...config, windowBehavior: 'keep-gradient' });
    for (const target of [vanished, first, second, swipeTracker, workspaceManager, screenShield, layoutManager])
        assert.equal(target.handlers.size, 0, 'Disabling window interaction releases its owned signals');
    assert.equal(disabled.window.effectStrength, 0, 'Overview works independently of window tracking');
    const count = overviewStates.length;
    overview.emit('showing');
    assert.equal(overviewStates.length, count + 1);
});

test('detector replacement updates state and unsupported swipe data leaves tracking active', async t => {
    const fixture = await createEventsFixture(t);
    const { first, second, shell, workspaceManager, swipeTracker, controller, overview, adjustment, screenShield, layoutManager, windowStates, config } = fixture;
    const events = fixture.createEvents();
    events.configure(config);
    events.configure(config);
    const count = windowStates.length;
    events.configure({ ...config, styleTrigger: 'maximized' });
    assert.equal(windowStates.length, count, 'Detector replacement does not emit an intermediate render');
    assert.equal([...first.handlers.values()].some(handler => handler.signal === 'position-changed'), false,
        'Switching detectors disconnects proximity-only window signals');
    assert.equal(layoutManager.handlers.size, 1, 'Both detectors observe monitor-layout changes');
    first.get_maximize_flags = () => 3;
    first.emit('size-changed');
    fixture.flush();
    assert.equal(windowStates.at(-1).effectStrength, 1, 'The new detector handles window state');
    events.configure(config);
    controller._switchData.baseMonitorGroup = {};
    swipeTracker.emit('begin');
    first.y = 62;
    first.emit('position-changed');
    fixture.flush();
    assert.equal(windowStates.at(-1).effectStrength, 0.25, 'Unsupported swipe data does not suppress window events');
    events.destroy();
    events.destroy();
    for (const target of [overview, adjustment, first, second, shell.display,
        shell.window_manager, workspaceManager, swipeTracker, screenShield, layoutManager])
        assert.equal(target.handlers.size, 0, 'Destroy releases all observer signals');
});

test('signal connections deduplicate per owner and never disconnect another owner', async t => {
    const fixture = await createEventsFixture(t);
    const { SignalTarget } = fixture;
    const signals = fixture.createConnections();
    const otherSignals = fixture.createConnections();
    const targetA = new SignalTarget();
    const targetB = new SignalTarget();
    let calls = 0;
    signals.connect(targetA, 'changed', () => calls++);
    signals.connect(targetA, 'changed', () => calls++);
    signals.connect(targetB, 'changed', () => calls++);
    otherSignals.connect(targetA, 'changed', () => calls++);
    targetA.emit('changed');
    targetB.emit('changed');
    assert.equal(calls, 3, 'Connections are deduplicated per target and owner');
    signals.disconnectAll();
    targetA.emit('changed');
    assert.equal(calls, 4, 'Cleanup does not disconnect another owner');
    otherSignals.disconnectAll();
    assert.equal(targetA.handlers.size, 0);
    assert.equal(targetB.handlers.size, 0);
});

test('workspace switching still works without private swipe APIs', async t => {
    const fixture = await createEventsFixture(t);
    const { workspaceB, state, workspaceManager, controller, windowStates, config } = fixture;
    controller._swipeTracker = null;
    const events = fixture.createEvents();
    events.configure(config);
    state.activeWorkspace = workspaceB;
    workspaceManager.emit('workspace-switched');
    assert.equal(windowStates.at(-1).effectStrength, 1, 'Workspace switching works without private swipe APIs');
    events.destroy();
});

test('disabled window observers neither connect nor enumerate windows', async t => {
    const fixture = await createEventsFixture(t);
    const { screenShield, layoutManager, Window, SignalTarget } = fixture;
    const detectorWindow = new Window(4, 52);
    const detectorWorkspace = { list_windows: () => { throw new Error('Disabled tracking enumerated windows'); } };
    const detectorDisplay = new SignalTarget();
    detectorDisplay.list_all_windows = () => [detectorWindow];
    const detectorWindowManager = new SignalTarget();
    const observer = fixture.createObserver(detectorDisplay, detectorWindowManager, {
        get_active_workspace: () => detectorWorkspace
    });
    const observedStrengths = [];
    observer.setStateChangeCallback(state => observedStrengths.push(state.effectStrength));
    observer.configure({ isEnabled: false, trigger: 'proximity', distance: 40, isProgressive: true });
    assert.equal(observer.getCurrentState().effectStrength, 0);
    observer.configure({ isEnabled: false, trigger: 'maximized', distance: 40, isProgressive: true });
    assert.equal(observer.getCurrentState().effectStrength, 0);
    assert.deepEqual(observedStrengths, [], 'Configuration never publishes intermediate state');
    assert.equal(observer.isEnabled, false, 'Detector configuration does not enable tracking');
    for (const target of [detectorWindow, detectorDisplay, detectorWindowManager, layoutManager, screenShield])
        assert.equal(target.handlers.size, 0, 'Configuring a disabled observer does not connect signals');
});

test('enabled window observers reuse connections and replace detectors cleanly', async t => {
    const fixture = await createEventsFixture(t);
    const { screenShield, layoutManager, Window, SignalTarget } = fixture;
    const detectorWindow = new Window(4, 52);
    const detectorWorkspace = { list_windows: () => [detectorWindow] };
    const detectorDisplay = new SignalTarget();
    detectorDisplay.list_all_windows = () => [detectorWindow];
    const detectorWindowManager = new SignalTarget();
    const observer = fixture.createObserver(detectorDisplay, detectorWindowManager, {
        get_active_workspace: () => detectorWorkspace
    });
    const observedStrengths = [];
    observer.setStateChangeCallback(state => observedStrengths.push(state.effectStrength));
    observer.configure({ isEnabled: true, trigger: 'proximity', distance: 40, isProgressive: true });
    assert.equal(observer.getCurrentState().effectStrength, 0.5);
    const observerTargets = [detectorWindow, detectorDisplay, detectorWindowManager, layoutManager, screenShield];
    const connectionCounts = observerTargets.map(target => target.nextId);
    observer.configure({ isEnabled: true, trigger: 'proximity', distance: 40, isProgressive: true });
    observer.configure({ isEnabled: true, trigger: 'proximity', distance: 80, isProgressive: true });
    assert.deepEqual(observerTargets.map(target => target.nextId), connectionCounts,
        'No-op and distance-only configuration preserve all connections');
    assert.equal(observer.getCurrentState().effectStrength, 0.75, 'Distance updates change detection without reconnecting');
    observer.configure({ isEnabled: true, trigger: 'proximity', distance: 80, isProgressive: false });
    assert.equal(observer.getCurrentState().effectStrength, 1);
    assert.deepEqual(observerTargets.map(target => target.nextId), connectionCounts,
        'Blending settings also preserve detector connections');
    observer.configure({ isEnabled: true, trigger: 'maximized', distance: 80, isProgressive: false });
    assert.equal(observer.isEnabled, true, 'Replacing a detector preserves enabled tracking');
    assert.equal(observer.getCurrentState().effectStrength, 0);
    assert.deepEqual(observedStrengths, [], 'Reconciliation returns state without callbacks');
    assert.equal([...detectorWindow.handlers.values()].some(handler => handler.signal === 'position-changed'), false,
        'Replacing proximity detection removes its window signals');
    assert.equal(layoutManager.handlers.size, 1, 'Replacing the detector keeps one monitor-layout listener');
    observer.disable();
    for (const target of observerTargets)
        assert.equal(target.handlers.size, 0, 'The observer releases every connection after replacement');
});
