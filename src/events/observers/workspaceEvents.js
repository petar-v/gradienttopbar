import { wm } from 'resource:///org/gnome/shell/ui/main.js';
import SignalConnections from '../signalConnections.js';

const getWorkspaceTransition = (workspaces, snapPoints, progress) => {
    if (workspaces.length === 0 || workspaces.length !== snapPoints.length)
        return null;

    const lastIndex = snapPoints.length - 1;
    const endIndex = snapPoints.findIndex(point => point >= progress);

    if (endIndex <= 0) {
        const index = endIndex === 0 ? 0 : lastIndex;
        return {
            startWorkspace: workspaces[index],
            endWorkspace: workspaces[index],
            progress: 0
        };
    }

    const startIndex = endIndex - 1;
    const distance = snapPoints[endIndex] - snapPoints[startIndex];
    return {
        startWorkspace: workspaces[startIndex],
        endWorkspace: workspaces[endIndex],
        progress: distance === 0
            ? 0
            : (progress - snapPoints[startIndex]) / distance
    };
};

export default class WorkspaceEvents {
    constructor(workspaceManager, callback) {
        this._workspaceManager = workspaceManager;
        this._callback = callback;
        this._signals = new SignalConnections();
        this._transitionGroup = null;
        this.enabled = false;
    }

    get transitioning() {
        return this._transitionGroup !== null;
    }

    get transition() {
        return this.getTransition(this._transitionGroup);
    }

    getTransition(monitorGroup) {
        if (!Array.isArray(monitorGroup?._workspaceGroups) ||
            typeof monitorGroup.getSnapPoints !== 'function')
            return null;

        return getWorkspaceTransition(
            monitorGroup._workspaceGroups.map(group => group.workspace),
            monitorGroup.getSnapPoints(),
            monitorGroup.progress
        );
    }

    updateTransition() {
        const transition = this.getTransition(this._transitionGroup);
        if (transition)
            this._callback({ type: 'progress', ...transition });
    }

    startTransition() {
        const group = wm?._workspaceAnimation?._switchData?.baseMonitorGroup;
        if (!group || group === this._transitionGroup || !this.getTransition(group))
            return;

        this.detachTransition();
        this._transitionGroup = group;
        this._signals.connect(group, 'notify::progress', () => this.updateTransition());
        this._signals.connect(group, 'destroy', () => {
            this.detachTransition();
            this._callback({ type: 'complete' });
        });
        this.updateTransition();
    }

    detachTransition() {
        if (this._transitionGroup)
            this._signals.disconnect(this._transitionGroup);
        this._transitionGroup = null;
    }

    enable() {
        if (this.enabled)
            return;

        this.enabled = true;
        this._signals.connect(this._workspaceManager, 'workspace-switched', () => {
            this._callback({ type: 'change' });
        });
        const swipeTracker = wm?._workspaceAnimation?._swipeTracker;
        if (swipeTracker)
            this._signals.connect(swipeTracker, 'begin', () => this.startTransition());
    }

    disable() {
        this.detachTransition();
        this._signals.disconnectAll();
        this.enabled = false;
    }
}
