import { wm } from 'resource:///org/gnome/shell/ui/main.js';
import SignalConnections from '../signalConnections.js';

const calculateWorkspaceBlend = (workspaces, snapPoints, progress) => {
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

// Shell's swipe data is private, so fall back to normal workspace changes if it's missing.
const calculateWorkspaceBlendFromSwipe = monitorGroup => {
    if (!Array.isArray(monitorGroup?._workspaceGroups) ||
        typeof monitorGroup.getSnapPoints !== 'function')
        return null;

    return calculateWorkspaceBlend(
        monitorGroup._workspaceGroups.map(group => group.workspace),
        monitorGroup.getSnapPoints(),
        monitorGroup.progress
    );
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
        return calculateWorkspaceBlendFromSwipe(this._transitionGroup);
    }

    #emitWorkspaceProgress() {
        const transition = calculateWorkspaceBlendFromSwipe(this._transitionGroup);
        if (transition)
            this._callback({ type: 'progress', ...transition });
    }

    #observeWorkspaceSwipe(emitInitialProgress = true) {
        const group = wm?._workspaceAnimation?._switchData?.baseMonitorGroup;
        if (!group || group === this._transitionGroup || !calculateWorkspaceBlendFromSwipe(group))
            return;

        this.stopObservingWorkspaceSwipe();
        this._transitionGroup = group;
        this._signals.connect(group, 'notify::progress', () => this.#emitWorkspaceProgress());
        this._signals.connect(group, 'destroy', () => {
            this.stopObservingWorkspaceSwipe();
            this._callback({ type: 'complete' });
        });
        if (emitInitialProgress)
            this.#emitWorkspaceProgress();
    }

    stopObservingWorkspaceSwipe() {
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
            this._signals.connect(swipeTracker, 'begin', () => this.#observeWorkspaceSwipe());
        // Configuration returns the adopted gesture in its final snapshot.
        this.#observeWorkspaceSwipe(false);
    }

    disable() {
        this.stopObservingWorkspaceSwipe();
        this._signals.disconnectAll();
        this.enabled = false;
    }
}
