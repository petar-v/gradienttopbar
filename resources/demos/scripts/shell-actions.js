// Loaded inside the verified private GNOME Shell, never in the recorder's GTK process.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let demoWindow;
let demoKeyboard;

export function getSessionInfo() {
    Main.overview.hide();
    const extension = Main.extensionManager.lookup('gradienttopbar@pshow.org');
    const monitor = Main.layoutManager.primaryMonitor;
    return {
        extension: { state: extension?.state, path: extension?.path },
        monitor: { width: monitor.width, height: monitor.height },
        display: GLib.getenv('WAYLAND_DISPLAY')
    };
}

export function getPanelHeight() {
    return Math.round(Main.panel.height);
}

export function placeWindow(title, x, y, width, height) {
    demoWindow = global.get_window_actors().map(actor => actor.meta_window)
        .find(window => window.get_title() === title);
    if (!demoWindow)
        return false;
    demoWindow.move_resize_frame(false, x, y, width, height);
    return true;
}

export function useFirstWorkspace() {
    demoWindow.change_workspace_by_index(0, false);
    global.workspace_manager.get_workspace_by_index(0).activate(0);
}

export function activateWindow() {
    demoWindow.activate(global.get_current_time());
}

export function moveWindow(x, gap) {
    demoWindow.move_frame(false, x, getPanelHeight() + gap);
}

export function toggleLeftTiling() {
    // Send GNOME's native snap shortcut to the private Shell's own seat.
    if (global.display.get_focus_window() !== demoWindow)
        throw new Error('The private demo window must have focus before tiling');
    demoKeyboard ??= global.stage.get_context().get_backend().get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const time = GLib.get_monotonic_time();
    demoKeyboard.notify_keyval(time, Clutter.KEY_Super_L, Clutter.KeyState.PRESSED);
    try {
        demoKeyboard.notify_keyval(time + 1000, Clutter.KEY_Left, Clutter.KeyState.PRESSED);
    } finally {
        demoKeyboard.notify_keyval(time + 2000, Clutter.KEY_Left, Clutter.KeyState.RELEASED);
        demoKeyboard.notify_keyval(time + 3000, Clutter.KEY_Super_L, Clutter.KeyState.RELEASED);
    }
}

export function checkLeftTiling() {
    const frame = demoWindow.get_frame_rect();
    const workArea = demoWindow.get_work_area_for_monitor(demoWindow.get_monitor());
    const close = (actual, expected) => Math.abs(actual - expected) <= 2;
    if (!close(frame.x, workArea.x) || !close(frame.y, workArea.y) ||
        !close(frame.width, workArea.width / 2) || !close(frame.height, workArea.height) ||
        frame.y > Main.layoutManager.primaryMonitor.y + Main.panel.height ||
        demoWindow.is_maximized())
        throw new Error('The private window did not snap to the left half and touch the panel');
}

export function checkRestoredWindow(x, width) {
    const frame = demoWindow.get_frame_rect();
    if (Math.abs(frame.x - x) > 2 || Math.abs(frame.width - width) > 2 ||
        frame.y <= Main.layoutManager.primaryMonitor.y + Main.panel.height)
        throw new Error('The private tiled window did not restore away from the panel');
}

export function beginWorkspaceSwipe(targetIndex, x, y) {
    // Use GNOME 51's native gesture path so the extension receives swipe progress.
    const animation = Main.wm._workspaceAnimation;
    const gesture = animation?._swipeTracker?._touchpadGesture;
    if (!gesture)
        throw new Error('Native workspace gesture is unavailable');
    gesture.emit('begin', Math.floor(GLib.get_monotonic_time() / 1000) >>> 0, x, y);
    const group = animation._switchData?.baseMonitorGroup;
    if (!group)
        throw new Error('Private workspace gesture did not begin');
    return {
        start: group.progress,
        end: group.getWorkspaceProgress(global.workspace_manager.get_workspace_by_index(targetIndex))
    };
}

export function updateWorkspaceSwipe(delta) {
    Main.wm._workspaceAnimation._swipeTracker._touchpadGesture.emit('update',
        Math.floor(GLib.get_monotonic_time() / 1000) >>> 0, delta, 1.0);
}

export function endWorkspaceSwipe() {
    Main.wm._workspaceAnimation._swipeTracker._touchpadGesture.emit('end',
        Math.floor(GLib.get_monotonic_time() / 1000) >>> 0, 1.0);
}

export function getWorkspaceIndex() {
    return global.workspace_manager.get_active_workspace_index();
}

export function maximizeWindow() {
    demoWindow.maximize(3);
}

export function restoreWindow() {
    demoWindow.unmaximize(3);
}

export function cleanup(interruptGesture) {
    demoKeyboard = null;
    if (interruptGesture)
        Main.wm._workspaceAnimation?._swipeTracker?._interrupt();
    demoWindow = null;
}
