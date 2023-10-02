import Meta from 'gi://Meta';

// I've created this file with the wish that I delete it one day.

const { BOTH } = Meta.MaximizeFlags;

const isMaximized = window => window.get_maximized() === BOTH;

const SIZE_CHANGE_EVENT = 'size-changed';
const WORKSPACE_CHANGE_EVENT = 'workspace-switched';
const WINDOW_CREATE_EVENT = 'window-created';
const WINDOW_DESTROY_EVENT = 'destroy';

class EventManager {
    constructor() {
        this.evenIds = {}; // event name -> {target, eventID}
        this.monitoredWindows = {}; // windowID -> {eventName -> eventID}
    }

    attachGlobalEventOnce(eventName, target, callback) {
        if (this.evenIds[eventName] === undefined) {
            const id = target.connect(eventName, callback);
            this.evenIds[eventName] = {
                target,
                id
            };
        }
    }

    disconnectAllEvents() {
        Object.keys(this.evenIds).forEach(eventName => {
            const event = this.evenIds[eventName];
            event.target.disconnect(event.id);
        });
        this.evenIds = {};
    }

    attachWindowEventOnce(eventName, window, callback) {
        const windowId = window.get_id();
        if (this.monitoredWindows[windowId] === undefined)
            this.monitoredWindows[windowId] = {};

        if (this.monitoredWindows[windowId][eventName] === undefined) {
            this.monitoredWindows[windowId][eventName] = window.connect(
                eventName,
                callback
            );
        }
    }

    disconnectWindowEvents(window) {
        const windowId = window.get_id();
        if (this.monitoredWindows[windowId] === undefined)
            return;

        Object.keys(this.monitoredWindows[windowId]).forEach(eventName => window.disconnect(this.monitoredWindows[windowId][eventName]));
        delete this.monitoredWindows[windowId];
    }
}

export default class WindowEvents {
    constructor(display, windowManager, workspaceManager) {
        this.display = display;
        this.windowManager = windowManager;
        this.workspaceManager = workspaceManager;

        this.eventManager = new EventManager();

        this.stateChangeCallback = () => {};

        this.workspace = null;
        this.maximizedWindows = [];
    }

    setStateChangeCallback(callback) {
        this.stateChangeCallback = callback;
    }

    enable() {
        const emitStateChange = () => {
            this.stateChangeCallback({
                maximizedWindows: this.maximizedWindows,
                currentWorkspace: this.workspace
            });
        };

        const onWindowSizeChange = window => {
            if (isMaximized(window))
                this.maximizedWindows.add(window.get_id());
            else
                this.maximizedWindows.delete(window.get_id());

            emitStateChange();
        };

        const onWorkspaceChanged = workspaceManager => {
            this.workspace = workspaceManager.get_active_workspace();
            emitStateChange();
        };

        const onWindowDestroy = (_, windowActor) => {
            const windowId = windowActor.get_meta_window().get_id();
            this.maximizedWindows.delete(windowId);
            delete this.monitoredWindows[windowId];

            emitStateChange();
        };

        const onWindowCreate = (_, window) => {
            if (window.can_maximize())
                this.eventManager.attachWindowEventOnce(SIZE_CHANGE_EVENT, window, onWindowSizeChange);

            if (isMaximized(window))
                this.maximizedWindows.add(window.get_id());

            emitStateChange();
        };

        // TODO: what if the window starts as maximized dimensions but is not "snapped"?
        // TODO: what if we have tiled windows?

        // listen for window created events and attach a size change event listener
        this.eventManager.attachGlobalEventOnce(WINDOW_CREATE_EVENT, this.display, onWindowCreate);
        this.eventManager.attachGlobalEventOnce(WINDOW_DESTROY_EVENT, this.windowManager, onWindowDestroy);
        this.eventManager.attachGlobalEventOnce(WORKSPACE_CHANGE_EVENT, this.windowManager, onWorkspaceChanged);
        // TODO: add minimized event

        this.display.list_all_windows().forEach(window => this.eventManager.attachWindowEventOnce(SIZE_CHANGE_EVENT, window, onWindowSizeChange));

        this.workspace = this.workspaceManager.get_active_workspace();
        this.maximizedWindows = this.display.list_all_windows().filter(isMaximized).map(window => window.get_id());
        emitStateChange();
    }

    disable() {
        this.eventManager.disconnectAllEvents();
        this.display.list_all_windows().forEach(window => {
            this.eventManager.disconnectWindowEvents(window);
        });
    }
}
