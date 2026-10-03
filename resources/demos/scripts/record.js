/* eslint-disable no-await-in-loop -- Animation steps and UI readiness checks run sequentially. */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

const [expectedPid, profile, scenario] = ARGV;
const scenarios = ['proximity', 'touch', 'workspace', 'maximized', 'tiling', 'preferences'];
const desktopWidth = 1024;
const desktopHeight = 640;
// A half-screen tile needs a floating window narrower than half the desktop.
const demoWindowWidth = scenario === 'tiling' ? 440 : 620;
const demoWindowX = Math.round((desktopWidth - demoWindowWidth) / 2);
if (ARGV.length !== 3 || !/^\d+$/.test(expectedPid ?? '') ||
    !profile?.startsWith('/tmp/gradienttopbar-demo.') || !scenarios.includes(scenario) ||
    GLib.getenv('XDG_CONFIG_HOME') !== `${profile}/config` ||
    GLib.getenv('XDG_DATA_HOME') !== `${profile}/data` ||
    !GLib.getenv('DBUS_SESSION_BUS_ADDRESS') ||
    GLib.getenv('DBUS_SESSION_BUS_ADDRESS') === GLib.getenv('demo_parent_bus')) {
    printerr('Run this recorder through a named scenario script');
    imports.system.exit(1);
}
const bus = Gio.DBus.session;
const loop = new GLib.MainLoop(null, false);
let demoWindow;
let recording = false;
let recordingFilename;
let gestureActive = false;
let exitCode = 0;

function call(name, path, iface, method, args, signature) {
    return new Promise((resolve, reject) => {
        bus.call(name, path, iface, method, args,
            new GLib.VariantType(signature), Gio.DBusCallFlags.NONE, 15000, null,
            (connection, result) => {
                try {
                    resolve(connection.call_finish(result).deep_unpack());
                } catch (error) {
                    reject(error);
                }
            });
    });
}

function pause(milliseconds) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

async function evaluate(code) {
    const [ok, result] = await call('org.gnome.Shell', '/org/gnome/Shell',
        'org.gnome.Shell', 'Eval', new GLib.Variant('(s)', [code]), '(bs)');
    if (!ok)
        throw new Error(`Private Shell Eval failed: ${result}`);
    return result ? JSON.parse(result) : null;
}

async function stopRecording() {
    const [ok] = await call('org.gnome.Shell.Screencast', '/org/gnome/Shell/Screencast',
        'org.gnome.Shell.Screencast', 'StopScreencast', null, '(b)');
    recording = false;
    if (!ok)
        throw new Error('Private screencast did not stop successfully');
}

async function startRecording() {
    const [ok, filename] = await call('org.gnome.Shell.Screencast', '/org/gnome/Shell/Screencast',
        'org.gnome.Shell.Screencast', 'ScreencastArea',
        new GLib.Variant('(iiiisa{sv})', [0, 0, desktopWidth, desktopHeight, `${profile}/${scenario}`, {
            'draw-cursor': new GLib.Variant('b', false),
            'framerate': new GLib.Variant('i', 30),
            'pipeline': new GLib.Variant('s', 'videoconvert ! video/x-raw,format=Y444 ! x264enc pass=quant quantizer=0 speed-preset=ultrafast tune=zerolatency threads=2 ! matroskamux')
        }]), '(bs)');
    if (!ok)
        throw new Error('Private screencast failed to start');
    recording = true;
    recordingFilename = filename;
    print(`Recording ${filename}`);
}

async function preparePrivateSession() {
    const [pid] = await call('org.freedesktop.DBus', '/org/freedesktop/DBus',
        'org.freedesktop.DBus', 'GetConnectionUnixProcessID',
        new GLib.Variant('(s)', ['org.gnome.Shell']), '(u)');
    if (pid !== Number(expectedPid))
        throw new Error(`Refusing to control Shell PID ${pid}; expected private PID ${expectedPid}`);

    await pause(2500);
    await evaluate('Main.overview.hide()');
    const extension = await evaluate("(() => { const e = Main.extensionManager.lookup('gradienttopbar@pshow.org'); return {state: e?.state, path: e?.path}; })()");
    if (extension.state !== 1 || extension.path !== `${profile}/extensions-data/gnome-shell/extensions/gradienttopbar@pshow.org`)
        throw new Error(`Private extension is not active: ${JSON.stringify(extension)}`);
    const monitor = await evaluate('({width: Main.layoutManager.primaryMonitor.width, height: Main.layoutManager.primaryMonitor.height})');
    if (monitor.width !== desktopWidth || monitor.height !== desktopHeight)
        throw new Error(`Expected a ${desktopWidth}×${desktopHeight} private monitor: ${JSON.stringify(monitor)}`);
    const display = await evaluate("GLib.getenv('WAYLAND_DISPLAY')");
    if (!display || display === GLib.getenv('demo_host_display'))
        throw new Error('A separate private Wayland display is required');
    GLib.setenv('WAYLAND_DISPLAY', display, true);
    print(`Controlling private Shell PID ${pid} on ${display}`);

    Gtk.init();
}

async function placeWindow(title, x, y, width, height) {
    for (let attempt = 0; attempt < 50; attempt++) {
        const found = await evaluate(`(() => {
            global.demoWindow = global.get_window_actors().map(a => a.meta_window)
                .find(w => w.get_title() === ${JSON.stringify(title)});
            if (!global.demoWindow) return false;
            global.demoWindow.move_resize_frame(false, ${x}, ${y}, ${width}, ${height});
            return true;
        })()`);
        if (found) {
            await pause(500);
            return;
        }
        await pause(100);
    }
    throw new Error(`Window missing from private Shell: ${title}`);
}

async function showDemoWindow() {
    const labels = {
        proximity: 'Proximity blend\n\nWatch the panel change as this window approaches.',
        touch: 'Touch detection · 0 px\n\nTouch the panel to apply the alternate style.',
        workspace: 'Workspace transition\n\nSwipe between different panel styles.',
        maximized: 'Maximized mode\n\nMaximize and restore to switch panel styles.',
        tiling: 'Tiling · proximity mode · 0 px\n\nSnap left to change the panel style.'
    };
    demoWindow = new Gtk.Window({ title: 'Gradient Top Bar Demo', default_width: demoWindowWidth, default_height: 360 });
    demoWindow.set_child(new Gtk.Label({
        label: labels[scenario],
        justify: Gtk.Justification.CENTER, margin_top: 40, margin_bottom: 40,
        margin_start: 40, margin_end: 40
    }));
    demoWindow.present();
    const panelHeight = await evaluate('Math.round(Main.panel.height)');
    let gap = 130;
    if (scenario === 'touch')
        gap = 45;
    if (scenario === 'workspace')
        gap = 0;
    await placeWindow('Gradient Top Bar Demo', demoWindowX, panelHeight + gap, demoWindowWidth, 360);
    await evaluate('global.demoWindow.change_workspace_by_index(0, false); global.workspace_manager.get_workspace_by_index(0).activate(0); true');
    if (scenario === 'tiling')
        await evaluate('global.demoWindow.activate(global.get_current_time()); true');
    await pause(500);
}

async function toggleLeftTiling() {
    // Send GNOME's native snap shortcut to the verified private Shell's own seat.
    await evaluate(`(() => {
        if (global.display.get_focus_window() !== global.demoWindow)
            throw new Error('The private demo window must have focus before tiling');
        const Clutter = imports.gi.Clutter;
        global.demoKeyboard ??= global.stage.get_context().get_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        const keyboard = global.demoKeyboard;
        const time = GLib.get_monotonic_time();
        keyboard.notify_keyval(time, Clutter.KEY_Super_L, Clutter.KeyState.PRESSED);
        try {
            keyboard.notify_keyval(time + 1000, Clutter.KEY_Left, Clutter.KeyState.PRESSED);
        } finally {
            keyboard.notify_keyval(time + 2000, Clutter.KEY_Left, Clutter.KeyState.RELEASED);
            keyboard.notify_keyval(time + 3000, Clutter.KEY_Super_L, Clutter.KeyState.RELEASED);
        }
        return true;
    })()`);
    await pause(550);
}

async function recordTiling() {
    await toggleLeftTiling();
    await evaluate(`(() => {
        const window = global.demoWindow;
        const frame = window.get_frame_rect();
        const workArea = window.get_work_area_for_monitor(window.get_monitor());
        const close = (actual, expected) => Math.abs(actual - expected) <= 2;
        if (!close(frame.x, workArea.x) || !close(frame.y, workArea.y) ||
            !close(frame.width, workArea.width / 2) || !close(frame.height, workArea.height) ||
            frame.y > Main.layoutManager.primaryMonitor.y + Main.panel.height ||
            window.is_maximized())
            throw new Error('The private window did not snap to the left half and touch the panel');
        return true;
    })()`);
    await pause(1200);
    // Untiling restores the size but keeps GNOME's tile origin; move back away from the panel.
    await toggleLeftTiling();
    await evaluate(`global.demoWindow.move_frame(false, ${demoWindowX}, Math.round(Main.panel.height) + 130); true`);
    await pause(300);
    await evaluate(`(() => {
        const frame = global.demoWindow.get_frame_rect();
        if (Math.abs(frame.x - ${demoWindowX}) > 2 ||
            Math.abs(frame.width - ${demoWindowWidth}) > 2 ||
            frame.y <= Main.layoutManager.primaryMonitor.y + Main.panel.height)
            throw new Error('The private tiled window did not restore away from the panel');
        return true;
    })()`);
    await pause(1100);
}

async function moveWindow(startGap, endGap, steps, interval) {
    for (let step = 0; step <= steps; step++) {
        const gap = Math.round(startGap + (endGap - startGap) * step / steps);
        await evaluate(`global.demoWindow.move_frame(false, ${demoWindowX}, Math.round(Main.panel.height) + ${gap}); true`);
        await pause(interval);
    }
}

async function swipeWorkspace(targetIndex) {
    gestureActive = true;
    // Use GNOME 51's native gesture path so the extension receives swipe progress.
    const { start, end } = await evaluate(`(() => {
        const animation = Main.wm._workspaceAnimation;
        const gesture = animation?._swipeTracker?._touchpadGesture;
        if (!gesture) throw new Error('Native workspace gesture is unavailable');
        gesture.emit('begin', Math.floor(GLib.get_monotonic_time() / 1000) >>> 0, ${desktopWidth / 2}, ${desktopHeight / 2});
        const group = animation._switchData?.baseMonitorGroup;
        if (!group) throw new Error('Private workspace gesture did not begin');
        return {start: group.progress, end: group.getWorkspaceProgress(global.workspace_manager.get_workspace_by_index(${targetIndex}))};
    })()`);
    const steps = 55;
    for (let step = 0; step < steps; step++) {
        await evaluate(`Main.wm._workspaceAnimation._swipeTracker._touchpadGesture.emit('update', Math.floor(GLib.get_monotonic_time() / 1000) >>> 0, ${(end - start) / steps}, 1.0); true`);
        await pause(25);
    }
    await pause(150);
    await evaluate("Main.wm._workspaceAnimation._swipeTracker._touchpadGesture.emit('end', Math.floor(GLib.get_monotonic_time() / 1000) >>> 0, 1.0); true");
    await pause(500);
    const index = await evaluate('global.workspace_manager.get_active_workspace_index()');
    if (index !== targetIndex)
        throw new Error(`Workspace gesture ended on ${index}, expected ${targetIndex}`);
    gestureActive = false;
}

function findRow(widget, title) {
    if (widget.get_title?.() === title)
        return widget;
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) {
        const found = findRow(child, title);
        if (found)
            return found;
    }
    return null;
}

async function showPreferences() {
    Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource')._register();
    imports.package.initFormat();
    const Adw = (await import('gi://Adw?version=1')).default;
    Adw.init();
    const { extensionManager } = await import('resource:///org/gnome/Shell/Extensions/js/extensionsService.js');
    const { ExtensionPrefsDialog } = await import('resource:///org/gnome/Shell/Extensions/js/extensionPrefsDialog.js');
    const [serialized] = await call('org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell.Extensions',
        'GetExtensionInfo', new GLib.Variant('(s)', ['gradienttopbar@pshow.org']), '(a{sv})');
    const extension = extensionManager.createExtensionObject(serialized);
    demoWindow = new ExtensionPrefsDialog(extension);
    await new Promise(resolve => demoWindow.connect('loaded', resolve));
    demoWindow.visible_page_name = 'Behavior';
    if (demoWindow.visible_page_name !== 'Behavior')
        throw new Error('The actual Behaviour preferences page did not load');
    demoWindow.set_default_size(880, 560);
    demoWindow.present();
    await placeWindow(extension.metadata.name, 72, 50, 880, 560);
    const trigger = findRow(demoWindow, 'Style trigger');
    const distance = findRow(demoWindow, 'Proximity distance');
    const transition = findRow(demoWindow, 'Transition proximity style');
    if (!trigger || !distance || !transition)
        throw new Error('The actual preferences controls were not found');
    return { trigger, distance, transition };
}

async function recordDemo() {
    await preparePrivateSession();
    let controls;
    if (scenario === 'preferences')
        controls = await showPreferences();
    else
        await showDemoWindow();
    await startRecording();
    await pause(650);
    switch (scenario) {
        case 'proximity':
            await moveWindow(130, 0, 50, 35);
            await pause(500);
            await moveWindow(0, 130, 50, 35);
            await pause(500);
            break;
        case 'touch':
            await moveWindow(45, 0, 30, 25);
            await pause(650);
            await moveWindow(0, 45, 30, 25);
            await pause(650);
            break;
        case 'workspace':
            await swipeWorkspace(1);
            await pause(300);
            await swipeWorkspace(0);
            await pause(300);
            break;
        case 'maximized':
            await evaluate('global.demoWindow.maximize(3); true');
            await pause(1500);
            await evaluate('global.demoWindow.unmaximize(3); true');
            await pause(1300);
            break;
        case 'tiling':
            await recordTiling();
            break;
        case 'preferences':
            controls.trigger.set_selected(1);
            await pause(1100);
            controls.distance.set_value(0);
            await pause(1000);
            controls.distance.set_value(100);
            await pause(1100);
            controls.transition.set_active(true);
            await pause(1100);
            break;
    }
    await stopRecording();
    GLib.file_set_contents(`${profile}/recording.path`, recordingFilename);
    print(`Demo complete: ${scenario}`);
}

recordDemo().catch(async error => {
    printerr(`${error.message}\n${error.stack ?? ''}`);
    exitCode = 1;
    if (recording) {
        try {
            await stopRecording();
        } catch (stopError) {
            printerr(`Cleanup: ${stopError}`);
        }
    }
}).finally(async () => {
    if (scenario === 'tiling') {
        try {
            await evaluate('global.demoKeyboard = null; true');
        } catch (error) {
            printerr(`Keyboard cleanup: ${error}`);
        }
    }
    if (gestureActive) {
        try {
            await evaluate('Main.wm._workspaceAnimation?._swipeTracker?._interrupt(); true');
        } catch (error) {
            printerr(`Gesture cleanup: ${error}`);
        }
    }
    demoWindow?.close();
    loop.quit();
});
loop.run();
imports.system.exit(exitCode);
