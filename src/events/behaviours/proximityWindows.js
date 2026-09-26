import { layoutManager, panel } from 'resource:///org/gnome/shell/ui/main.js';

import { getProximityDistance } from '../../config.js';

const calculateProgress = (windowDistance, proximityDistance) =>
    proximityDistance === 0
        ? Number(windowDistance <= 0)
        : Math.max(0, Math.min(1, 1 - windowDistance / proximityDistance));

// Keeps all panel-layout dependencies inside the proximity behaviour.
export default class ProximityWindows {
    constructor(settings) {
        this.settings = settings;
    }

    getEffectStrength(windows) {
        const { primaryMonitor } = layoutManager;
        if (!primaryMonitor)
            return 0;

        const distance = getProximityDistance(this.settings);
        const panelBottom = primaryMonitor.y + panel.get_height();

        return windows.reduce((effectStrength, window) => {
            const windowDistance = window.get_frame_rect().y - panelBottom;
            return Math.max(
                effectStrength,
                calculateProgress(windowDistance, distance)
            );
        }, 0);
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
