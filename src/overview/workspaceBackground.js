// Inspired by Overview Seamless Zoom by jguece.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Mtk from 'gi://Mtk';
import Graphene from 'gi://Graphene';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ControlsState } from 'resource:///org/gnome/shell/ui/overviewControls.js';
import { WorkspaceBackground } from 'resource:///org/gnome/shell/ui/workspace.js';

const createMonitorWorkareaGetter = (layoutManager, monitorIndex) => {
    let cachedMonitor;
    let rectangle;
    return () => {
        const monitor = layoutManager.monitors[monitorIndex];
        if (!monitor)
            return layoutManager.getWorkAreaForMonitor(monitorIndex);
        if (cachedMonitor !== monitor) {
            cachedMonitor = monitor;
            rectangle = new Mtk.Rectangle({ x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height });
        }
        return rectangle;
    };
};

const replaceWorkspaceBackground = (workspace, previous, replacement) => {
    try {
        workspace.replace_child(previous, replacement);
    } catch (error) {
        replacement.destroy();
        throw error;
    }
    workspace._background = replacement;
    previous.destroy();
};

const installControlsGeometry = (layout, gate, layoutManager) => {
    const original = layout._computeWorkspacesBoxForState;
    const descriptor = Object.getOwnPropertyDescriptor(layout, '_computeWorkspacesBoxForState');
    let inner = original;
    let entered = false;
    function wrap(delegate) {
        return function compute(state, ...args) {
            // Each snapshot preserves later extensions' wrapper chains, even after we disable.
            if (!gate.active || entered)
                return delegate.call(this, state, ...args);
            entered = true;
            try {
                const box = delegate.call(this, state, ...args);
                const monitor = layoutManager.primaryMonitor;
                if (state === ControlsState.HIDDEN && monitor) {
                    const workarea = layoutManager.getWorkAreaForMonitor(monitor.index);
                    box.set_origin(box.x1 - (workarea.x - monitor.x), box.y1 - (workarea.y - monitor.y));
                    box.set_size(monitor.width, monitor.height);
                }
                return box;
            } finally {
                entered = false;
            }
        };
    }
    let compute = wrap(inner);
    const getCompute = () => compute;
    Object.defineProperty(layout, '_computeWorkspacesBoxForState', {
        configurable: true,
        get: getCompute,
        set: value => {
            inner = value;
            compute = wrap(value);
        }
    });
    return () => {
        if (Object.getOwnPropertyDescriptor(layout, '_computeWorkspacesBoxForState')?.get !== getCompute)
            return;
        delete layout._computeWorkspacesBoxForState;
        if (inner !== original) {
            Object.defineProperty(layout, '_computeWorkspacesBoxForState', {
                configurable: true, writable: true, enumerable: descriptor?.enumerable ?? false, value: inner
            });
        } else if (descriptor) {
            Object.defineProperty(layout, '_computeWorkspacesBoxForState', descriptor);
        }
    };
};

const OverviewBackground = GObject.registerClass(
class GradientTopBarWorkspaceBackground extends WorkspaceBackground {
    vfunc_allocate(box) {
        const [width, height] = box.get_size();
        if (width > 0 && height > 0) {
            super.vfunc_allocate(box);
        } else {
            // Shell's native allocator divides by the incoming height.
            this.set_allocation(box);
            this._bin.allocate(box);
        }
        const wallpaperBox = new Clutter.ActorBox();
        wallpaperBox.set_size(...this._bin.get_size());
        // Keep Shell's animation, but undo its strut crop on the wallpaper child.
        this._backgroundGroup.allocate(wallpaperBox);
    }

    _updateRoundedClipBounds() {
        const monitor = Main.layoutManager.monitors[this._monitorIndex];
        if (!monitor)
            return;
        const bounds = new Graphene.Rect();
        bounds.init(0, 0, monitor.width, monitor.height);
        this._bgManager.backgroundActor.content.set_rounded_clip_bounds(bounds);
    }
});

export default class WorkspaceBackgrounds {
    #gate = null;
    #restoreControls = null;
    #workspaces = new Map();

    configure(isEnabled) {
        if (!isEnabled) {
            this.destroy();
            return;
        }
        if (this.#gate)
            return true;
        this.destroy();
        if (this.#workspaces.size || this.#restoreControls)
            return false;

        try {
            this.#install();
            return true;
        } catch (error) {
            this.destroy();
            logError(error, 'Gradient Top Bar: overview wallpaper zoom unavailable');
            return false;
        }
    }

    addWorkspace(workspace) {
        if (!this.#gate?.active || workspace.monitorIndex !== Main.layoutManager.primaryIndex || this.#workspaces.has(workspace))
            return;
        try {
            this.#patchWorkspace(workspace);
        } catch (error) {
            this.destroy();
            logError(error, 'Gradient Top Bar: overview wallpaper zoom setup failed');
            return false;
        }
    }

    removeWorkspace(workspace) {
        this.#workspaces.delete(workspace);
    }

    #install() {
        const controls = Main.overview._overview?.controls;
        const layout = controls?.layout_manager;
        const original = layout?._computeWorkspacesBoxForState;
        if (typeof original !== 'function' || !controls._workspacesDisplay)
            throw new Error('Unsupported overview workspace layout');

        const gate = { active: true };
        this.#gate = gate;
        this.#restoreControls = installControlsGeometry(layout, gate, Main.layoutManager);
    }

    #patchWorkspace(workspace) {
        const layout = workspace._container?.layout_manager;
        const descriptor = layout && Object.getOwnPropertyDescriptor(layout, '_workarea');
        const stock = workspace._background;
        if (!descriptor?.configurable || !layout.stateAdjustment || typeof layout.layout_changed !== 'function' ||
            !(stock instanceof WorkspaceBackground) || typeof workspace.replace_child !== 'function')
            throw new Error('Unsupported workspace background');

        const getWorkarea = createMonitorWorkareaGetter(Main.layoutManager, layout._monitorIndex);
        const background = new OverviewBackground(workspace.monitorIndex, layout.stateAdjustment);
        try {
            Object.defineProperty(layout, '_workarea', {
                configurable: true,
                get: getWorkarea,
                // Shell still refreshes workarea on strut changes; full-monitor geometry ignores those writes.
                set: () => {}
            });
            workspace.replace_child(stock, background);
        } catch (error) {
            Object.defineProperty(layout, '_workarea', descriptor);
            background.destroy();
            throw error;
        }
        workspace._background = background;
        this.#workspaces.set(workspace, { layout, descriptor, getWorkarea, background });
        stock.destroy();
        layout._needsLayout = true;
        layout.layout_changed();
    }

    #restoreWorkspace(workspace) {
        const saved = this.#workspaces.get(workspace);
        if (!saved)
            return;
        const { layout, descriptor, getWorkarea, background } = saved;
        let failed = false;
        const restore = callback => {
            try {
                callback();
            } catch (error) {
                failed = true;
                logError(error, 'Gradient Top Bar: overview wallpaper zoom cleanup failed');
            }
        };
        restore(() => {
            if (Object.getOwnPropertyDescriptor(layout, '_workarea')?.get === getWorkarea) {
                const restored = { ...descriptor };
                if ('value' in restored)
                    restored.value = Main.layoutManager.getWorkAreaForMonitor(layout._monitorIndex);
                Object.defineProperty(layout, '_workarea', restored);
                saved.needsLayout = true;
            }
            if (saved.needsLayout) {
                layout._needsLayout = true;
                layout.layout_changed();
                saved.needsLayout = false;
            }
        });
        restore(() => {
            if (workspace._background === background) {
                const stock = new WorkspaceBackground(workspace.monitorIndex, layout.stateAdjustment);
                replaceWorkspaceBackground(workspace, background, stock);
            }
        });
        if (!failed)
            this.#workspaces.delete(workspace);
    }

    destroy() {
        if (this.#gate)
            this.#gate.active = false;
        const restore = callback => {
            try {
                callback?.();
            } catch (error) {
                logError(error, 'Gradient Top Bar: overview wallpaper zoom cleanup failed');
            }
        };
        restore(() => {
            this.#restoreControls?.();
            this.#restoreControls = null;
        });
        // Restore tracked actors even before Shell publishes their view arrays.
        for (const workspace of this.#workspaces.keys())
            restore(() => this.#restoreWorkspace(workspace));
        this.#gate = null;
    }
}
