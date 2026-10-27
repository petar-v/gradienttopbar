import assert from 'node:assert/strict';
import { createModuleLoader } from './modules.js';

export const createEventsFixture = async t => {
    const targets = new Set();
    class SignalTarget {
        constructor() { targets.add(this); }
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
        constructor(id, y) {
            super();
            this.id = id;
            this.y = y;
        }
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
    const state = { activeWorkspace: workspaceA, windows: [first, second] };
    const workspaceManager = new SignalTarget();
    workspaceManager.get_active_workspace = () => state.activeWorkspace;
    const display = new SignalTarget();
    display.list_all_windows = () => state.windows;
    const windowManager = new SignalTarget();

    const swipeTracker = new SignalTarget();
    const controller = { _swipeTracker: swipeTracker, _switchData: {} };
    const overview = new SignalTarget();
    Object.assign(overview, { visible: false, visibleTarget: false });
    const adjustment = new SignalTarget();
    adjustment.value = 0;
    overview._overview = { controls: { _stateAdjustment: adjustment } };
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

    const shell = { display, window_manager: windowManager, get_workspace_manager: () => workspaceManager };
    const load = createModuleLoader(stubs, shell);
    const { default: EventManager } = (await load('events/eventManager.js')).namespace;
    const { default: WindowEvents } = (await load('events/observers/windowsEvents/windowEvents.js')).namespace;
    const { default: SignalConnections } = (await load('events/signalConnections.js')).namespace;
    const resources = [];
    const windowStates = [];
    const overviewStates = [];
    const track = (resource, dispose) => {
        resources.push(() => resource[dispose]());
        return resource;
    };
    t.after(() => {
        try {
            for (const dispose of resources.reverse())
                dispose();
        } finally {
            for (const target of targets)
                assert.equal(target.handlers.size, 0, 'Fixture leaked observer signals');
        }
    });
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
    return {
        first, second, workspaceA, workspaceB, state, shell, workspaceManager, swipeTracker,
        controller, overview, adjustment, screenShield, layoutManager, windowStates, overviewStates,
        EventManager, WindowEvents, SignalTarget, Window, startSwipe,
        config: { styleTrigger: 'proximity', windowBehavior: 'apply-style', proximityDistance: 40 },
        createEvents: () => track(new EventManager({
            onWindowChanged: snapshot => windowStates.push(snapshot),
            onWorkspaceProgress: snapshot => windowStates.push({ ...snapshot, type: 'progress' }),
            onWorkspaceCompleted: snapshot => windowStates.push({ ...snapshot, type: 'complete' }),
            onOverviewChanged: snapshot => overviewStates.push(snapshot)
        }), 'destroy'),
        createObserver: (targetDisplay, manager, workspaces) => track(new WindowEvents(targetDisplay, manager, workspaces), 'disable'),
        createConnections: () => track(new SignalConnections(), 'disconnectAll')
    };
};
