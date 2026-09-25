import Meta from 'gi://Meta';

const { VERTICAL, BOTH } = Meta.MaximizeFlags;

// Detects windows that occupy the full monitor or are vertically maximized.
// This behaviour deliberately avoids layout and position-change dependencies.
export default class MaximizedWindows {
    matches(window) {
        if (window.is_monitor_sized() || window.is_screen_sized())
            return true;

        return [BOTH, VERTICAL].includes(window.get_maximize_flags());
    }

    // Maximization changes window size; moving an unmaximized window is irrelevant.
    attachWindowEvents(eventManager, window, updateState) {
        eventManager.attachWindowEventOnce('size-changed', window, updateState);
        eventManager.attachWindowEventOnce('workspace-changed', window, updateState);
    }

    // Maximized detection requires no behaviour-specific global events.
    attachGlobalEvents() {}
}
