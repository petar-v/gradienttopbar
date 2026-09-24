import { layoutManager, panel } from 'resource:///org/gnome/shell/ui/main.js';

const DEFAULT_PROXIMITY_DISTANCE = 5;

// Keeps all panel-layout dependencies inside the proximity behaviour.
export default class ProximityWindows {
    matches(window) {
        const { primaryMonitor } = layoutManager;
        if (!primaryMonitor)
            return false;

        // Include a small tolerance below the panel to avoid an exact-edge requirement.
        const panelBottom = primaryMonitor.y + panel.get_height() + DEFAULT_PROXIMITY_DISTANCE;
        return window.get_frame_rect().y <= panelBottom;
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
