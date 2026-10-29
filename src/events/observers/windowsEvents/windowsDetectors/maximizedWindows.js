import Meta from 'gi://Meta';

const { VERTICAL, BOTH } = Meta.MaximizeFlags;

// Detects windows that occupy the full monitor or are vertically maximized.
export default class MaximizedWindows {
    matches(window) {
        if (window.is_monitor_sized() || window.is_screen_sized())
            return true;

        return [BOTH, VERTICAL].includes(window.get_maximize_flags());
    }

    getEffectStrength(windows) {
        for (const window of windows) {
            if (this.matches(window))
                return 1;
        }
        return 0;
    }

    // Maximization changes window size; moving an unmaximized window is irrelevant.
    attachWindowEvents(signals, window, { geometryChanged, workspaceChanged }) {
        signals.connect(window, 'size-changed', geometryChanged);
        signals.connect(window, 'workspace-changed', workspaceChanged);
    }
}
