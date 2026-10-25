import { layoutManager, panel } from 'resource:///org/gnome/shell/ui/main.js';

import { getProximityDistance } from '../../../../config.js';

const calculateProximityStrength = (windowDistance, proximityDistance) =>
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
                calculateProximityStrength(windowDistance, distance)
            );
        }, 0);
    }

    // Proximity can change when a window moves, resizes, or changes workspace.
    attachWindowEvents(signals, window, updateState) {
        signals.connect(window, 'size-changed', updateState);
        signals.connect(window, 'position-changed', updateState);
        signals.connect(window, 'workspace-changed', updateState);
    }

    // Recalculate the boundary whenever GNOME changes the monitor layout.
    attachGlobalEvents(signals, updateState) {
        signals.connect(
            layoutManager,
            'monitors-changed',
            () => updateState(true)
        );
    }
}
