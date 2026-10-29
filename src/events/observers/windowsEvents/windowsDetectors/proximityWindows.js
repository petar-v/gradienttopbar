import { layoutManager, panel } from 'resource:///org/gnome/shell/ui/main.js';

const calculateProximityStrength = (windowDistance, proximityDistance) =>
    proximityDistance === 0
        ? Number(windowDistance <= 0)
        : Math.max(0, Math.min(1, 1 - windowDistance / proximityDistance));

// measures window distance from the primary panel.
export default class ProximityWindows {
    constructor(distance) {
        this.distance = distance;
    }

    getEffectStrength(windows) {
        const { primaryMonitor } = layoutManager;
        if (!primaryMonitor)
            return 0;

        const distance = this.distance;
        const panelBottom = primaryMonitor.y + panel.get_height();

        let effectStrength = 0;
        for (const window of windows) {
            const windowDistance = window.get_frame_rect().y - panelBottom;
            const strength = calculateProximityStrength(windowDistance, distance);
            if (!this.isProgressive && strength > 0)
                return 1;
            effectStrength = Math.max(effectStrength, strength);
            if (effectStrength === 1)
                break;
        }
        return effectStrength;
    }

    // Proximity can change when a window moves, resizes, or changes workspace.
    attachWindowEvents(signals, window, { geometryChanged, workspaceChanged }) {
        signals.connect(window, 'size-changed', geometryChanged);
        signals.connect(window, 'position-changed', geometryChanged);
        signals.connect(window, 'workspace-changed', workspaceChanged);
    }
}
