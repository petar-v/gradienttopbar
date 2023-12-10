import Meta from 'gi://Meta';
import { overview } from 'resource:///org/gnome/shell/ui/main.js';

import EventManager from './eventManager.js';
import { areSameState } from './states.js';

const { VERTICAL, BOTH } = Meta.MaximizeFlags;

const SIZE_CHANGE_EVENT = 'size-changed';
const WORKSPACE_CHANGE_EVENT = 'workspace-switched';
const WINDOW_CREATE_EVENT = 'window-created';
const WINDOW_DESTROY_EVENT = 'destroy';
const WINDOW_MINIMIZED_EVENT = 'minimize';
const WINDOW_RAISED_EVENT = 'unminimize';

const WINDOW_EXIT_MONITOR = 'window-left-monitor';
// const WINDOW_REMOVED_FROM_WORKSPACE = 'window-removed';
// const WINDOW_ADDED_TO_WORKSPACE = 'window-added';
const WINDOW_WORKSPACE_CHANGED = 'workspace-changed';

const OVERVIEW_SHOWING = 'showing';
const OVERVIEW_HIDING = 'hiding';

// FIXME: this causes the overview to close on login
const isDesktopIconsNG = window => window.customJS_ding !== undefined; // this is to ignore "Desktop Icons NG"'s window hacks

const isMaximized = window =>
    !isDesktopIconsNG(window) &&
  (window.is_monitor_sized() ||
    window.is_screen_sized() ||
    [BOTH, VERTICAL].includes(window.get_maximized()));

export default class WindowEvents {
    constructor(display, windowManager, workspaceManager) {
        this.display = display;
        this.windowManager = windowManager;
        this.workspaceManager = workspaceManager;

        this.eventManager = new EventManager();

        this.stateChangeCallback = () => {};

        this.workspace = null;
        this.inOverview = false;
        this.maximizedWindows = new Set();
    }

    setStateChangeCallback(callback) {
        this.stateChangeCallback = callback;
    }

    enable() {
        let lastState = null;
        const emitStateChange = force => {
            const currentState = {
                maximizedWindows: this.maximizedWindows,
                currentWorkspace: this.workspace,
                inOverview: this.inOverview
            };
            if (force || !areSameState(lastState, currentState)) {
                lastState = currentState;
                this.stateChangeCallback(currentState);
            }
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
            const window = windowActor.get_meta_window();
            this.maximizedWindows.delete(window.get_id());
            this.eventManager.disconnectWindowEvents(window);

            emitStateChange();
        };

        const attachWindowEvents = window => {
            if (isDesktopIconsNG(window))
                return;

            if (window.can_maximize())
            { this.eventManager.attachWindowEventOnce(
                SIZE_CHANGE_EVENT,
                window,
                onWindowSizeChange
            ); }

            if (isMaximized(window))
                this.maximizedWindows.add(window.get_id());

            this.eventManager.attachWindowEventOnce(
                WINDOW_WORKSPACE_CHANGED,
                window,
                forceStateChangeEmission
            );
        };

        const onWindowMinimize = (_, windowActor) => {
            const windowId = windowActor.get_meta_window().get_id();
            this.maximizedWindows.delete(windowId);
            emitStateChange();
        };

        const onWindowRaise = (_, windowActor) => {
            const window = windowActor.get_meta_window();
            if (isMaximized(window))
                this.maximizedWindows.add(window.get_id());
            emitStateChange();
        };

        const forceStateChangeEmission = () => emitStateChange(true);

        this.workspace = this.workspaceManager.get_active_workspace();

        // TODO: what if the window starts as maximized dimensions but is not "snapped"?
        // TODO: what if we have tiled windows?

        this.eventManager.attachGlobalEventOnce(
            WINDOW_CREATE_EVENT,
            this.display,
            (_, window) => {
                attachWindowEvents(window);
                emitStateChange();
            }
        );
        this.eventManager.attachGlobalEventOnce(
            WINDOW_DESTROY_EVENT,
            this.windowManager,
            onWindowDestroy
        );
        this.eventManager.attachGlobalEventOnce(
            WORKSPACE_CHANGE_EVENT,
            this.workspaceManager,
            onWorkspaceChanged
        );
        this.eventManager.attachGlobalEventOnce(
            WINDOW_MINIMIZED_EVENT,
            this.windowManager,
            onWindowMinimize
        );
        this.eventManager.attachGlobalEventOnce(
            WINDOW_RAISED_EVENT,
            this.windowManager,
            onWindowRaise
        );

        this.eventManager.attachGlobalEventOnce(
            WINDOW_EXIT_MONITOR,
            this.display,
            forceStateChangeEmission
        );

        // FIXME: the workspace changes so this needs to be attached to every workspace as it is created/deleted
        // this.eventManager.attachGlobalEventOnce(WINDOW_ADDED_TO_WORKSPACE, this.workspace, forceStateChangeEmission);
        // this.eventManager.attachGlobalEventOnce(WINDOW_REMOVED_FROM_WORKSPACE, this.workspace, forceStateChangeEmission);

        // disable style changes when in overview - might make this a config option
        this.eventManager.attachGlobalEventOnce(OVERVIEW_SHOWING, overview, () => {
            this.inOverview = true;
            emitStateChange();
        });
        this.eventManager.attachGlobalEventOnce(OVERVIEW_HIDING, overview, () => {
            this.inOverview = false;
            emitStateChange();
        });

        // TODO: instead of on size change, listen for https://gjs-docs.gnome.org/meta13~13/meta.window#property-maximized_horizontally or vertically
        // to make it work with tiling, I would need to figure out the position in case it is maximized horizontally but on top.
        // if it's maximized vertically, then it's likely on either side. In that case I want to make the bar opaque.
        this.display.list_all_windows().forEach(attachWindowEvents);

        // FIXME: find a way to do that only for the windows on the primary monitor's current workspace
        this.maximizedWindows = new Set(
            this.display
        .list_all_windows()
        .filter(isMaximized)
        .map(window => window.get_id())
        );
        emitStateChange();
    }

    disable() {
        this.eventManager.disconnectAllEvents();
        this.display.list_all_windows().forEach(window => {
            this.eventManager.disconnectWindowEvents(window);
        });
        this.workspace = null;
        this.maximizedWindows = new Set();
        this.inOverview = null;
    }
}
