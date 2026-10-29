import assert from 'node:assert/strict';
import { createModuleLoader } from './modules.js';

export const createEventsFixture = async t => {
    const targets = new Set();
    const reads = { scans: 0, geometry: 0 };
    const pending = new Map();
    let nextLaterId = 0;
    const laters = {
        add(when, callback) {
            assert.equal(when, 4, 'Refresh before redraw');
            pending.set(++nextLaterId, callback);
            return nextLaterId;
        },
        remove(id) { assert(pending.delete(id), 'Cancel only live callbacks'); }
    };
    const flush = () => {
        const callbacks = [...pending.values()];
        pending.clear();
        callbacks.forEach(callback => assert.equal(callback(), false, 'Refresh is one-shot'));
    };
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
            this.primary = true;
            this.workspace = null;
        }
        get_id() { return this.id; }
        is_on_primary_monitor() { return this.primary; }
        located_on_workspace(workspace) { return this.sticky || this.workspace === workspace; }
        get_window_type() { return 0; }
        get_frame_rect() { reads.geometry++; return { y: this.y }; }
        is_monitor_sized() { return false; }
        is_screen_sized() { return false; }
        get_maximize_flags() { return 0; }
    }
    const first = new Window(1, 52);
    const second = new Window(2, 32);
    const listWindows = workspace => {
        reads.scans++;
        return state.windows.filter(window => window.located_on_workspace(workspace));
    };
    const workspaceA = { index: () => 0, list_windows() { return listWindows(this); } };
    const workspaceB = { index: () => 1, list_windows() { return listWindows(this); } };
    first.workspace = workspaceA;
    second.workspace = workspaceB;
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
        'gi://Meta': { default: { WindowType: { DESKTOP: 1 }, MaximizeFlags: { VERTICAL: 2, BOTH: 3 }, LaterType: { BEFORE_REDRAW: 4 } } }
    };

    const shell = { display, window_manager: windowManager, get_workspace_manager: () => workspaceManager, compositor: { get_laters: () => laters } };
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
            assert.equal(pending.size, 0, 'Fixture leaked a before-redraw callback');
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
        reads, pending, flush, targets,
        config: {
            styleTrigger: 'proximity', windowBehavior: 'apply-style', proximityDistance: 40, proximityTransition: true,
            overviewBehavior: 'apply-style', overviewTransition: true,
            gradients: {
                main: { colors: { start: 'rgba(0,0,0,1)', end: 'rgba(0,0,0,0)' }, direction: 'vertical' },
                alternate: { colors: { start: 'rgba(255,0,0,1)', end: 'rgba(0,0,255,1)' }, direction: 'horizontal' },
                overview: { colors: { start: 'rgba(0,255,0,0.4)', end: 'rgba(255,255,255,1)' }, direction: 'horizontal' }
            }
        },
        createEvents: (callbacks = {}) => track(new EventManager({
            onWindowChanged: (snapshot, isWorkspaceChanged) => { windowStates.push(snapshot); callbacks.onWindowChanged?.(snapshot, isWorkspaceChanged); },
            onWindowProgress: snapshot => { windowStates.push(snapshot); callbacks.onWindowProgress?.(snapshot); },
            onWorkspaceProgress: snapshot => { windowStates.push({ ...snapshot, type: 'progress' }); callbacks.onWorkspaceProgress?.(snapshot); },
            onWorkspaceCompleted: snapshot => { windowStates.push({ ...snapshot, type: 'complete' }); callbacks.onWorkspaceCompleted?.(snapshot); },
            onOverviewChanged: snapshot => { overviewStates.push(snapshot); callbacks.onOverviewChanged?.(snapshot); }
        }), 'destroy'),
        createObserver: (targetDisplay, manager, workspaces) => track(new WindowEvents(targetDisplay, manager, workspaces), 'disable'),
        createConnections: () => track(new SignalConnections(), 'disconnectAll')
    };
};
