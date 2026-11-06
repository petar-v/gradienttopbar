import assert from 'node:assert/strict';
import { createModuleLoader } from './modules.js';

export const createOverviewZoomFixture = async t => {
    class ActorBox {
        x1 = 0;
        y1 = 0;
        x2 = 0;
        y2 = 0;
        set_origin(x, y) {
            const [width, height] = this.get_size();
            Object.assign(this, { x1: x, y1: y, x2: x + width, y2: y + height });
        }
        set_size(width, height) { this.x2 = this.x1 + width; this.y2 = this.y1 + height; }
        get_size() { return [this.x2 - this.x1, this.y2 - this.y1]; }
        interpolate(other, progress) {
            const result = new ActorBox();
            for (const key of ['x1', 'x2', 'y1', 'y2'])
                result[key] = this[key] + (other[key] - this[key]) * progress;
            return result;
        }
    }
    const rect = (x, y, width, height) => {
        const box = new ActorBox();
        box.set_origin(x, y);
        box.set_size(width, height);
        return box;
    };
    const state = { errors: [], scaleFactor: 1, failReplacement: false, failBackground: false };
    const alive = new Set();
    class WorkspaceBackground {
        constructor(monitorIndex, adjustment) {
            if (state.failBackground)
                throw new Error('background unavailable');
            this._monitorIndex = monitorIndex;
            this._stateAdjustment = adjustment;
            this._bin = {
                allocate: box => { this.contentBox = box; },
                get_size: () => this.contentBox.get_size()
            };
            this._backgroundGroup = { allocate: box => { this.wallpaperBox = box; } };
            this._bgManager = {
                backgroundActor: {
                    content: {
                        set_rounded_clip_bounds: bounds => { this.clipBounds = bounds; }
                    }
                }
            };
            alive.add(this);
        }
        vfunc_allocate(box) {
            this.nativeAllocationCalls = (this.nativeAllocationCalls ?? 0) + 1;
            this.set_allocation(state.nativeAllocation ?? box);
            this._bin.allocate(this.allocation);
            this._backgroundGroup.allocate(rect(-10, -32, 220, 132));
        }
        set_allocation(box) { this.allocation = box; }
        get_theme_node() { return { get_content_box: box => box }; }
        _updateRoundedClipBounds() {}
        destroy() { alive.delete(this); this.destroyed = true; }
    }
    const monitor = { index: 0, x: -1920, y: 240, width: 1920, height: 1080 };
    const workarea = { x: -1910, y: 272, width: 1900, height: 1028 };
    const layoutManager = { primaryMonitor: monitor, primaryIndex: 0, monitors: [monitor], getWorkAreaForMonitor: () => workarea };
    const controlsLayout = Object.create({
        _computeWorkspacesBoxForState(value) {
            return value === 0
                ? rect(workarea.x - monitor.x, workarea.y - monitor.y, workarea.width, workarea.height)
                : rect(10, 20, 800, 600);
        }
    });
    const workspaces = [];
    const overview = { _overview: { controls: { layout_manager: controlsLayout, _workspacesDisplay: { _workspacesViews: [{ _workspaces: workspaces }] } } } };
    class Workspace {
        constructor(...args) { this._init(...args); }
        connect() { assert.fail('Geometry must not subscribe to workspace signals'); }
        disconnect() { assert.fail('Geometry must not disconnect workspace signals'); }
        destroy() {
            if (this.destroyed)
                return;
            this.destroyed = true;
            this._background.destroy();
        }
        _init(_metaWorkspace, monitorIndex, adjustment) {
            this.monitorIndex = monitorIndex;
            this._container = {
                layout_manager: {
                    _monitorIndex: monitorIndex,
                    _workarea: workarea,
                    stateAdjustment: adjustment,
                    layout_changed() { this.layoutChanged = true; }
                }
            };
            this._background = new WorkspaceBackground(monitorIndex, adjustment);
            this.children = [this._background];
        }
        replace_child(old, next) {
            if (state.failReplacement) {
                state.failReplacement = false;
                throw new Error('replacement failed');
            }
            const index = this.children.indexOf(old);
            assert.notEqual(index, -1);
            this.children[index] = next;
        }
    }
    const originalInit = Workspace.prototype._init;
    const originalCompute = controlsLayout._computeWorkspacesBoxForState;
    const load = createModuleLoader({
        'gi://Clutter': { default: { ActorBox } },
        'gi://GObject': { default: { registerClass: cls => cls } },
        'gi://Mtk': { default: { Rectangle: class { constructor(values) { Object.assign(this, values); } } } },
        'gi://Graphene': {
            default: {
                Rect: class {
                    init(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
                }
            }
        },
        'resource:///org/gnome/shell/ui/main.js': { overview, layoutManager },
        'resource:///org/gnome/shell/ui/overviewControls.js': { ControlsState: { HIDDEN: 0 } },
        'resource:///org/gnome/shell/ui/workspace.js': { Workspace, WorkspaceBackground }
    }, { stage: {}, logError: error => state.errors.push(error) });
    const { default: OverviewZoom } = (await load('overview/workspaceBackground.js')).namespace;
    const zoom = new OverviewZoom();
    const createWorkspace = (index = 0) => {
        const workspace = new Workspace(null, index, { value: 0 });
        workspaces.push(workspace);
        return workspace;
    };
    t.after(() => {
        zoom.destroy();
        for (const workspace of workspaces)
            workspace.destroy();
        assert.equal(alive.size, 0, 'No replaced background leaked');
    });
    return { zoom, state, alive, rect, monitor, workarea, layoutManager, overview, controlsLayout, Workspace, WorkspaceBackground, originalInit, originalCompute, createWorkspace };
};
