import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Workspace } from 'resource:///org/gnome/shell/ui/workspace.js';
import { WorkspacesView } from 'resource:///org/gnome/shell/ui/workspacesView.js';
import SignalConnections from '../../signalConnections.js';

export default class WorkspacePreviewLifecycle {
    constructor(callback) {
        this._callback = callback;
        this._signals = new SignalConnections();
        this._views = new Set();
        this._workspaces = new Map();
        this._display = null;
    }

    configure(isEnabled) {
        if (!isEnabled) {
            this.destroy();
            return;
        }
        if (this._display)
            return;

        const display = Main.overview._overview?.controls?._workspacesDisplay;
        if (!display)
            return;
        this._display = display;
        this._signals.connect(display, 'child-added', (_display, view) => this.#addView(view));
        for (const view of display.get_children())
            this.#addView(view);
    }

    #addView(view) {
        if (!(view instanceof WorkspacesView) || view._monitorIndex !== Main.layoutManager.primaryIndex || this._views.has(view))
            return;
        this._views.add(view);
        this._signals.connect(view, 'child-added', (_view, workspace) => this.#addWorkspace(view, workspace));
        this._signals.connect(view, 'destroy', () => {
            this._signals.disconnect(view);
            this._views.delete(view);
            for (const [workspace, owner] of this._workspaces) {
                if (owner === view)
                    this.#removeWorkspace(workspace);
            }
        });
        for (const workspace of view.get_children())
            this.#addWorkspace(view, workspace);
    }

    #addWorkspace(view, workspace) {
        if (!(workspace instanceof Workspace))
            return;
        const isKnown = this._workspaces.has(workspace);
        this._workspaces.set(workspace, view);
        if (isKnown)
            return;
        this._signals.connect(workspace, 'destroy', () => this.#removeWorkspace(workspace));
        this._callback({ type: 'added', workspace });
    }

    #removeWorkspace(workspace) {
        if (!this._workspaces.delete(workspace))
            return;
        this._signals.disconnect(workspace);
        // Removal only forgets the target; destroying actors must not be restored.
        this._callback({ type: 'removed', workspace });
    }

    destroy() {
        this._signals.disconnectAll();
        this._views.clear();
        this._workspaces.clear();
        this._display = null;
    }
}
