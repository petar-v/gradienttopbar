import { layoutManager, panel } from 'resource:///org/gnome/shell/ui/main.js';

import { getProximityDistance } from '../../config.js';

// Keeps all panel-layout dependencies inside the proximity behaviour.
export default class ProximityWindows {
    constructor(settings, onProgressChanged) {
        this.settings = settings;
        this.onProgressChanged = onProgressChanged;
    }

    getTriggerWindowIds(windows) {
        const { primaryMonitor } = layoutManager;
        if (!primaryMonitor) {
            // reset on new montiors
            this.onProgressChanged(0);
            return new Set();
        }

        const distance = getProximityDistance(this.settings);
        const panelBottom = primaryMonitor.y + panel.get_height();
        let triggerProgress = 0;
        const triggerWindowIds = new Set();

        windows.forEach(window => {
            const windowDistance = window.get_frame_rect().y - panelBottom;
            // TODO: extract this in a util method
            const progress = distance === 0
                ? Number(windowDistance <= 0)
                : Math.max(0, Math.min(1, 1 - windowDistance / distance));

            if (progress > 0)
                triggerWindowIds.add(window.get_id());
            triggerProgress = Math.max(triggerProgress, progress);
        });

        this.onProgressChanged(triggerProgress);
        return triggerWindowIds;
    }

    // Proximity can change when a window moves, resizes, or changes workspace.
    attachWindowEvents(eventManager, window, updateState) {
        eventManager.attachWindowEventOnce('size-changed', window, updateState);
        eventManager.attachWindowEventOnce('position-changed', window, updateState);
        eventManager.attachWindowEventOnce('workspace-changed', window, updateState);
    }

    // Recalculate the boundary whenever GNOME changes the monitor layout.
    attachGlobalEvents(eventManager, updateState) {
        eventManager.attachGlobalEventOnce(
            'monitors-changed',
            layoutManager,
            () => updateState(true)
        );
    }
}
