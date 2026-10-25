// Run with: node --experimental-vm-modules tests/eventManager.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

class SignalTarget {
    handlers = new Map();
    nextId = 0;
    connect(signal, callback) {
        this.handlers.set(++this.nextId, { signal, callback });
        return this.nextId;
    }
    disconnect(id) {
        assert(this.handlers.delete(id), 'Disconnect only live connections');
    }
    emit(signal, ...args) {
        for (const [id, handler] of [...this.handlers]) {
            if (this.handlers.has(id) && handler.signal === signal)
                handler.callback(this, ...args);
        }
    }
}
class Window extends SignalTarget {
    constructor(id, y) { super(); this.id = id; this.y = y; }
    get_id() { return this.id; }
    is_on_primary_monitor() { return true; }
    get_window_type() { return 0; }
    get_frame_rect() { return { y: this.y }; }
    is_monitor_sized() { return false; }
    is_screen_sized() { return false; }
    get_maximize_flags() { return 0; }
}
const first = new Window(1, 52);
const second = new Window(2, 32);
const workspaceA = { index: () => 0, list_windows: () => [first] };
const workspaceB = { index: () => 1, list_windows: () => [second] };
let activeWorkspace = workspaceA;
let windows = [first, second];
const workspaceManager = new SignalTarget();
workspaceManager.get_active_workspace = () => activeWorkspace;
globalThis.display = new SignalTarget();
globalThis.display.list_all_windows = () => windows;
globalThis.window_manager = new SignalTarget();
globalThis.get_workspace_manager = () => workspaceManager;
const swipeTracker = new SignalTarget();
const controller = { _swipeTracker: swipeTracker, _switchData: {} };
const overview = new SignalTarget();
Object.assign(overview, { visible: false, visibleTarget: false });
const adjustment = new SignalTarget();
adjustment.value = 0;
overview._overview = { controls: { _stateAdjustment: adjustment } };
Math.clamp ??= (value, min, max) => Math.max(min, Math.min(max, value));
const screenShield = new SignalTarget();
const layoutManager = new SignalTarget();
layoutManager.primaryMonitor = { y: 0 };
const stubs = {
    'resource:///org/gnome/shell/ui/main.js': {
        overview, screenShield, layoutManager,
        panel: { get_height: () => 32 }, wm: { _workspaceAnimation: controller }
    },
    'gi://Meta': { default: { WindowType: { DESKTOP: 1 }, MaximizeFlags: { VERTICAL: 2, BOTH: 3 } } }
};
const src = new URL('../src/', import.meta.url);
const modules = new Map();
const load = url => {
    if (!modules.has(url)) {
        const pending = (async () => {
            const exports = stubs[url] ?? stubs[url.replace(src.href, '')];
            return exports ? new SyntheticModule(Object.keys(exports), function () {
                for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
            }, { identifier: url }) : new SourceTextModule(await readFile(new URL(url), 'utf8'), { identifier: url });
        })();
        modules.set(url, pending);
    }
    return modules.get(url);
};
const module = await load(new URL('events/eventManager.js', src).href);
await module.link((specifier, parent) => load(specifier.startsWith('.')
    ? new URL(specifier, parent.identifier).href : specifier));
await module.evaluate();
const WindowEvents = (await load(new URL('events/observers/windowsEvents/windowEvents.js', src).href)).namespace.default;
assert.deepEqual(Object.getOwnPropertyNames(module.namespace.default.prototype).sort(),
    ['configure', 'constructor', 'destroy'], 'Only lifecycle operations are public');
const windowStates = [];
const overviewStates = [];
let events = new module.namespace.default(
    state => windowStates.push(state),
    (state, strength) => overviewStates.push({ ...state, strength })
);
assert.equal(typeof events.configure, 'function', 'EventManager configures its observers');
const config = { styleTrigger: 'proximity', maximizedBehavior: 'apply-style', proximityDistance: 40 };
const initial = events.configure(config);
assert.equal(initial.window.effectStrength, 0.5, 'Nearby windows supply partial strength');
assert.equal(initial.overview.hidden, true);
assert.equal(windowStates.length, 0, 'Configuration returns a snapshot without intermediate rendering');
assert.equal(overviewStates.length, 0);
let count = windowStates.length;
first.emit('position-changed');
assert.equal(windowStates.length, count, 'Unchanged state is not emitted again');
first.y = 42;
first.emit('position-changed');
assert.equal(windowStates.at(-1).effectStrength, 0.75, 'Window movement updates strength');
globalThis.window_manager.emit('minimize', { get_meta_window: () => first });
assert.equal(windowStates.at(-1).effectStrength, 0, 'Minimization excludes the window before its flag changes');
globalThis.window_manager.emit('unminimize');
assert.equal(windowStates.at(-1).effectStrength, 0.75, 'Unminimization restores the detected strength');
count = windowStates.length;
screenShield.emit('unlock-screen');
assert.equal(windowStates.length, count + 1, 'Unlock forces a refresh');

const startSwipe = (from, to, progress) => {
    const group = new SignalTarget();
    Object.assign(group, {
        _workspaceGroups: [{ workspace: from }, { workspace: to }],
        getSnapPoints: () => [0, 1], progress
    });
    controller._switchData.baseMonitorGroup = group;
    swipeTracker.emit('begin');
    return group;
};
let group = startSwipe(workspaceA, workspaceB, 0.5);
assert.equal(windowStates.at(-1).workspaceTransition, 'progress');
assert.equal(windowStates.at(-1).startEffectStrength, 0.75);
assert.equal(windowStates.at(-1).endEffectStrength, 1);
count = windowStates.length;
first.y = 52;
first.emit('position-changed');
assert.equal(windowStates.length, count, 'Window changes do not overwrite an active swipe');
group.progress = 0.25;
group.emit('notify::progress');
assert.equal(windowStates.at(-1).transitionProgress, 0.25, 'A reversed swipe retraces progress');
assert.equal(windowStates.at(-1).startEffectStrength, 0.5, 'Swipe endpoints use fresh window state');
activeWorkspace = workspaceB;
workspaceManager.emit('workspace-switched');
group.emit('destroy');
assert.equal(windowStates.at(-1).workspaceTransition, 'complete');
assert.equal(windowStates.at(-1).effectStrength, 1);
assert.equal(windowStates.at(-1).currentWorkspace, workspaceB);
assert.equal(group.handlers.size, 0, 'Completed swipe releases its connections');
count = windowStates.length;
second.emit('position-changed');
assert.equal(windowStates.length, count, 'Completion updates the deduplication baseline');

group = startSwipe(workspaceB, workspaceA, 0.4);
group.progress = 0;
group.emit('notify::progress');
group.emit('destroy');
assert.equal(windowStates.at(-1).effectStrength, 1, 'Cancellation restores the still-active workspace');
assert.equal(windowStates.at(-1).workspaceTransition, 'complete');

group = startSwipe(workspaceB, workspaceA, 0.5);
overview.visible = true;
overview.visibleTarget = true;
overview.emit('showing');
assert.equal(group.handlers.size, 0, 'Overview interrupts the desktop swipe');
count = windowStates.length;
group.emit('destroy');
assert.equal(windowStates.length, count, 'An interrupted swipe cannot emit stale completion');
adjustment.value = 0.6;
adjustment.emit('notify::value');
assert.equal(overviewStates.at(-1).progress, 0.6);
overview.visible = false;
overview.visibleTarget = false;
overview.emit('hidden');

group = startSwipe(workspaceB, workspaceA, 0.5);
const connections = first.nextId;
const swipeSnapshot = events.configure(config);
assert.equal(first.nextId, connections, 'No-op configuration keeps detector connections');
assert.equal(group.handlers.size, 2, 'Reconfiguration preserves swipe listeners');
assert.equal(swipeSnapshot.window.transitionProgress, 0.5);
const distanceSnapshot = events.configure({ ...config, proximityDistance: 80 });
assert.equal(first.nextId, connections, 'Distance changes do not reconnect the detector');
assert.equal(distanceSnapshot.window.endEffectStrength, 0.75, 'Distance changes refresh swipe endpoints');
events.configure(config);
activeWorkspace = workspaceA;
workspaceManager.emit('workspace-switched');
group.emit('destroy');
assert.equal(windowStates.at(-1).currentWorkspace, workspaceA, 'Keyboard switching refreshes the workspace');
assert.equal(windowStates.at(-1).effectStrength, 0.5);

// A disappearing window must be disconnected even when no longer in the display list.
const vanished = new Window(3, 100);
windows.push(vanished);
globalThis.display.emit('window-created', vanished);
assert(vanished.handlers.size > 0);
windows = [first, second];
const disabled = events.configure({ ...config, maximizedBehavior: 'keep-gradient' });
for (const target of [vanished, first, second, swipeTracker, workspaceManager, screenShield, layoutManager])
    assert.equal(target.handlers.size, 0, 'Disabling window interaction releases its owned signals');
assert.equal(disabled.window.effectStrength, 0, 'Overview works independently of window tracking');
count = overviewStates.length;
overview.emit('showing');
assert.equal(overviewStates.length, count + 1);
events.configure(config);
count = windowStates.length;
events.configure({ ...config, styleTrigger: 'maximized' });
assert.equal(windowStates.length, count, 'Detector replacement does not emit an intermediate render');
assert.equal([...first.handlers.values()].some(handler => handler.signal === 'position-changed'), false,
    'Switching detectors disconnects proximity-only window signals');
assert.equal(layoutManager.handlers.size, 0, 'Switching detectors disconnects proximity-only global signals');
first.get_maximize_flags = () => 3;
first.emit('size-changed');
assert.equal(windowStates.at(-1).effectStrength, 1, 'The new detector handles window state');
events.configure(config);
controller._switchData.baseMonitorGroup = {};
swipeTracker.emit('begin');
first.y = 62;
first.emit('position-changed');
assert.equal(windowStates.at(-1).effectStrength, 0.25, 'Unsupported swipe data does not suppress window events');
events.destroy();
events.destroy();
for (const target of [overview, adjustment, first, second, globalThis.display,
    globalThis.window_manager, workspaceManager, swipeTracker, screenShield, layoutManager])
    assert.equal(target.handlers.size, 0, 'Destroy releases all observer signals');

// The same signal on distinct targets and on independent owners must remain independent.
const signalsModule = await load(new URL('events/signalConnections.js', src).href);
const SignalConnections = signalsModule.namespace.default;
const signals = new SignalConnections();
const otherSignals = new SignalConnections();
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

controller._swipeTracker = null;
events = new module.namespace.default(state => windowStates.push(state), () => {});
events.configure(config);
activeWorkspace = workspaceB;
workspaceManager.emit('workspace-switched');
assert.equal(windowStates.at(-1).currentWorkspace, workspaceB, 'Workspace switching works without private swipe APIs');
events.destroy();

const detectorWindow = new Window(4, 52);
const detectorWorkspace = { list_windows: () => [detectorWindow] };
const detectorDisplay = new SignalTarget();
detectorDisplay.list_all_windows = () => [detectorWindow];
const detectorWindowManager = new SignalTarget();
const observer = new WindowEvents(detectorDisplay, detectorWindowManager, {
    get_active_workspace: () => detectorWorkspace
});
const observedStrengths = [];
observer.setStateChangeCallback(state => observedStrengths.push(state.effectStrength));
observer.configureDetector('proximity', 40);
assert.equal(observer.getEffectStrength(), 0.5, 'The observer configures proximity detection directly');
observer.configureDetector('maximized', 40);
assert.equal(observer.getEffectStrength(), 0, 'A disabled observer can replace its detector');
assert.equal(observer.enabled, false, 'Detector configuration does not enable tracking');
for (const target of [detectorWindow, detectorDisplay, detectorWindowManager, layoutManager, screenShield])
    assert.equal(target.handlers.size, 0, 'Configuring a disabled observer does not connect signals');

observer.configureDetector('proximity', 40);
observer.enable();
const observerTargets = [detectorWindow, detectorDisplay, detectorWindowManager, layoutManager, screenShield];
const connectionCounts = observerTargets.map(target => target.nextId);
observer.configureDetector('proximity', 40);
observer.configureDetector('proximity', 80);
assert.deepEqual(observerTargets.map(target => target.nextId), connectionCounts,
    'No-op and distance-only configuration preserve all connections');
assert.equal(observer.getEffectStrength(), 0.75, 'Distance updates change detection without reconnecting');
observer.configureDetector('maximized', 80);
assert.equal(observer.enabled, true, 'Replacing a detector preserves enabled tracking');
assert.deepEqual(observedStrengths, [0.5, 0], 'Replacement publishes only the new detector state');
assert.equal([...detectorWindow.handlers.values()].some(handler => handler.signal === 'position-changed'), false,
    'Replacing proximity detection removes its window signals');
assert.equal(layoutManager.handlers.size, 0, 'Replacing proximity detection removes its global signals');
observer.disable();
for (const target of observerTargets)
    assert.equal(target.handlers.size, 0, 'The observer releases every connection after replacement');
console.log('Window, workspace, overview coordination and signal ownership checks passed');
