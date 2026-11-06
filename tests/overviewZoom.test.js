import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOverviewZoomFixture } from './fixtures/overviewZoom.js';

test('full monitor endpoint includes top and side struts and preserves other overview states', async t => {
    const f = await createOverviewZoomFixture(t);
    f.zoom.configure(true);
    assert.deepEqual(f.controlsLayout._computeWorkspacesBoxForState(0), f.rect(0, 0, 1920, 1080));
    assert.deepEqual(f.controlsLayout._computeWorkspacesBoxForState(1), f.rect(10, 20, 800, 600));
    f.zoom.configure(true);
    f.zoom.configure(false);
    assert.equal(f.controlsLayout._computeWorkspacesBoxForState, f.originalCompute);
    assert.equal(f.Workspace.prototype._init, f.originalInit);
    assert.equal(Object.hasOwn(f.controlsLayout, '_computeWorkspacesBoxForState'), false);
});

test('primary workspace layout and wallpaper share full monitor geometry and restore live', async t => {
    const f = await createOverviewZoomFixture(t);
    f.zoom.configure(true);
    const workspace = f.createWorkspace();
    f.zoom.addWorkspace(workspace);
    const layout = workspace._container.layout_manager;
    assert.equal(layout._workarea.x, -1920);
    assert.equal(layout._workarea.height, 1080);
    assert.equal(layout._workarea, layout._workarea, 'Per-frame geometry uses cached rectangle');
    assert.notEqual(workspace._background.constructor, f.WorkspaceBackground);
    const modified = workspace._background;
    modified.vfunc_allocate(f.rect(0, 0, 200, 100));
    assert.deepEqual(modified.contentBox, f.rect(0, 0, 200, 100));
    layout.stateAdjustment.value = 0.5;
    f.state.nativeAllocation = f.rect(12, 6, 176, 88);
    modified.vfunc_allocate(f.rect(0, 0, 200, 100));
    assert.deepEqual(modified.contentBox, f.rect(12, 6, 176, 88));
    assert.equal(modified.nativeAllocationCalls, 2, 'Shell owns the animation geometry');
    assert.deepEqual(modified.wallpaperBox, f.rect(0, 0, 176, 88));
    modified._updateRoundedClipBounds();
    assert.equal(modified.clipBounds.width, f.monitor.width);
    assert.equal(modified.clipBounds.height, f.monitor.height);
    f.workarea.height = 1000;
    f.zoom.configure(false);
    assert.equal(layout._workarea, f.workarea);
    assert.equal(layout.layoutChanged, true);
    assert.equal(workspace._background.constructor, f.WorkspaceBackground);
    assert.equal(modified.destroyed, true);
});

test('secondary workspace and foreign accessors are left alone', async t => {
    const f = await createOverviewZoomFixture(t);
    f.zoom.configure(true);
    const secondary = f.createWorkspace(1);
    f.zoom.addWorkspace(secondary);
    assert.equal(secondary._background.constructor, f.WorkspaceBackground);
    assert.equal(secondary._container.layout_manager._workarea, f.workarea);
    const foreign = () => f.workarea;
    Object.defineProperty(secondary._container.layout_manager, '_workarea', { configurable: true, get: foreign });
    f.zoom.configure(false);
    assert.equal(secondary._background.constructor, f.WorkspaceBackground);
    assert.equal(Object.getOwnPropertyDescriptor(secondary._container.layout_manager, '_workarea').get, foreign);
});

test('monitor identity invalidates geometry cache and a missing monitor falls back to workarea', async t => {
    const f = await createOverviewZoomFixture(t);
    f.zoom.configure(true);
    const workspace = f.createWorkspace();
    f.zoom.addWorkspace(workspace);
    const layout = workspace._container.layout_manager;
    const old = layout._workarea;
    f.layoutManager.monitors[0] = { ...f.monitor, width: 2560 };
    assert.equal(layout._workarea.width, 2560);
    assert.notEqual(layout._workarea, old);
    f.layoutManager.monitors = [];
    assert.equal(layout._workarea, f.workarea);
});

test('later method wrappers survive disable and retained originals become inert', async t => {
    const f = await createOverviewZoomFixture(t);
    f.zoom.configure(true);
    const retainedCompute = f.controlsLayout._computeWorkspacesBoxForState;
    function laterCompute(value) { return retainedCompute.call(this, value); }
    f.controlsLayout._computeWorkspacesBoxForState = laterCompute;
    assert.deepEqual(f.controlsLayout._computeWorkspacesBoxForState(0), f.rect(0, 0, 1920, 1080));
    const retainedInit = f.Workspace.prototype._init;
    function laterInit(...args) { retainedInit.apply(this, args); }
    f.Workspace.prototype._init = laterInit;
    f.zoom.configure(false);
    assert.equal(f.controlsLayout._computeWorkspacesBoxForState, laterCompute);
    assert.equal(f.Workspace.prototype._init, laterInit);
    assert.deepEqual(retainedCompute.call(f.controlsLayout, 0), f.rect(10, 32, 1900, 1028));
    assert.equal(f.createWorkspace()._background.constructor, f.WorkspaceBackground);
    f.zoom.configure(true);
    const workspace = f.createWorkspace();
    f.zoom.addWorkspace(workspace);
    assert.notEqual(workspace._background.constructor, f.WorkspaceBackground);
});

test('replaced descriptors and background are not clobbered by cleanup', async t => {
    const f = await createOverviewZoomFixture(t);
    f.zoom.configure(true);
    const workspace = f.createWorkspace();
    f.zoom.addWorkspace(workspace);
    const layout = workspace._container.layout_manager;
    const foreignArea = () => ({ width: 900 });
    Object.defineProperty(layout, '_workarea', { configurable: true, get: foreignArea });
    const foreignCompute = () => f.originalCompute;
    Object.defineProperty(f.controlsLayout, '_computeWorkspacesBoxForState', { configurable: true, get: foreignCompute });
    workspace._background.destroy();
    workspace._background = new f.WorkspaceBackground(0, layout.stateAdjustment);
    const background = workspace._background;
    f.zoom.configure(false);
    assert.equal(Object.getOwnPropertyDescriptor(layout, '_workarea').get, foreignArea);
    assert.equal(Object.getOwnPropertyDescriptor(f.controlsLayout, '_computeWorkspacesBoxForState').get, foreignCompute);
    assert.equal(workspace._background, background);
});

test('failed background replacement rolls back the current workspace and all hooks', async t => {
    const f = await createOverviewZoomFixture(t);
    f.zoom.configure(true);
    f.state.failReplacement = true;
    const workspace = f.createWorkspace();
    f.zoom.addWorkspace(workspace);
    assert.equal(workspace._container.layout_manager._workarea, f.workarea);
    assert.equal(workspace._background.constructor, f.WorkspaceBackground);
    assert.equal(f.alive.size, 1);
    assert.equal(f.controlsLayout._computeWorkspacesBoxForState, f.originalCompute);
    assert.equal(f.Workspace.prototype._init, f.originalInit);
    assert.equal(f.state.errors.length, 1);
});

test('unsupported controls layout fails without changing Workspace init', async t => {
    const f = await createOverviewZoomFixture(t);
    delete f.overview._overview.controls.layout_manager;
    f.zoom.configure(true);
    assert.equal(f.Workspace.prototype._init, f.originalInit);
    assert.equal(f.state.errors.length, 1);
});

test('zero-sized wallpaper allocations stay finite', async t => {
    const f = await createOverviewZoomFixture(t);
    f.zoom.configure(true);
    const workspace = f.createWorkspace();
    f.zoom.addWorkspace(workspace);
    const background = workspace._background;
    background._stateAdjustment.value = 1;
    background.vfunc_allocate(f.rect(0, 0, 0, 0));
    assert.deepEqual(background.contentBox, f.rect(0, 0, 0, 0));
    assert.deepEqual(background.wallpaperBox, f.rect(0, 0, 0, 0));
    assert.equal(background.nativeAllocationCalls, undefined);
});

test('two later wrappers retain their complete chain through disable and re-enable', async t => {
    const f = await createOverviewZoomFixture(t);
    const calls = [];
    f.zoom.configure(true);
    const firstOriginal = f.controlsLayout._computeWorkspacesBoxForState;
    f.controlsLayout._computeWorkspacesBoxForState = function (value) {
        calls.push('first');
        return firstOriginal.call(this, value);
    };
    const secondOriginal = f.controlsLayout._computeWorkspacesBoxForState;
    f.controlsLayout._computeWorkspacesBoxForState = function (value) {
        calls.push('second');
        return secondOriginal.call(this, value);
    };
    for (const enabled of [true, false, true]) {
        f.zoom.configure(enabled);
        calls.length = 0;
        const result = f.controlsLayout._computeWorkspacesBoxForState(0);
        assert.deepEqual(calls, ['second', 'first']);
        assert.deepEqual(result, enabled ? f.rect(0, 0, 1920, 1080) : f.rect(10, 32, 1900, 1028));
    }
});

test('setup failure restores workspaces before their parent view is published', async t => {
    const f = await createOverviewZoomFixture(t);
    f.overview._overview.controls._workspacesDisplay._workspacesViews = [];
    f.zoom.configure(true);
    const first = f.createWorkspace();
    f.zoom.addWorkspace(first);
    f.state.failReplacement = true;
    f.zoom.addWorkspace(f.createWorkspace());
    assert.equal(first._background.constructor, f.WorkspaceBackground);
    assert.equal(first._container.layout_manager._workarea, f.workarea);
    assert.equal(f.Workspace.prototype._init, f.originalInit);
});

test('destroyed workspaces are forgotten before cleanup', async t => {
    const f = await createOverviewZoomFixture(t);
    f.zoom.configure(true);
    const workspace = f.createWorkspace();
    f.zoom.addWorkspace(workspace);
    workspace.destroy();
    f.zoom.removeWorkspace(workspace);
    Object.defineProperty(workspace, '_container', { get() { throw new Error('Destroyed actor accessed'); } });
    f.zoom.destroy();
    assert.equal(f.alive.size, 0);
    assert.equal(f.state.errors.length, 0);
});

test('geometry leaves constructors and subscriptions untouched and requires explicit workspace delivery', async t => {
    const f = await createOverviewZoomFixture(t);
    const workspace = f.createWorkspace();
    f.zoom.addWorkspace(workspace);
    assert.equal(workspace._background.constructor, f.WorkspaceBackground, 'Inactive delivery is ignored');
    f.zoom.configure(true);
    assert.equal(f.Workspace.prototype._init, f.originalInit);
    assert.equal(workspace._background.constructor, f.WorkspaceBackground, 'Enable does not discover actors');
    f.zoom.addWorkspace(workspace);
    const modified = workspace._background;
    f.zoom.addWorkspace(workspace);
    assert.equal(workspace._background, modified, 'Repeated delivery is idempotent');
    f.zoom.destroy();
    assert.equal(f.Workspace.prototype._init, f.originalInit);
    assert.equal(workspace._background.constructor, f.WorkspaceBackground);
});

test('invalid workspace delivery rolls back earlier geometry without retaining actor records', async t => {
    const f = await createOverviewZoomFixture(t);
    f.zoom.configure(true);
    const first = f.createWorkspace();
    f.zoom.addWorkspace(first);
    const invalid = f.createWorkspace();
    Object.defineProperty(invalid._container.layout_manager, '_workarea', { configurable: false });
    f.zoom.addWorkspace(invalid);
    assert.equal(first._background.constructor, f.WorkspaceBackground);
    assert.equal(invalid._background.constructor, f.WorkspaceBackground);
    assert.equal(f.controlsLayout._computeWorkspacesBoxForState, f.originalCompute);
    assert.equal(f.state.errors.length, 1);
    f.zoom.configure(true);
    f.zoom.addWorkspace(first);
    assert.notEqual(first._background.constructor, f.WorkspaceBackground);
});


test('setup invalidates cached workspace layout', async t => {
    const f = await createOverviewZoomFixture(t);
    f.zoom.configure(true);
    const workspace = f.createWorkspace();
    const layout = workspace._container.layout_manager;
    layout._needsLayout = false;
    f.zoom.addWorkspace(workspace);
    assert.equal(layout._needsLayout, true);
    assert.equal(layout.layoutChanged, true);
});

test('failed background restoration remains retryable', async t => {
    const f = await createOverviewZoomFixture(t);
    f.zoom.configure(true);
    const workspace = f.createWorkspace();
    f.zoom.addWorkspace(workspace);
    const custom = workspace._background;
    f.state.failReplacement = true;
    f.zoom.destroy();
    assert.equal(workspace._background, custom);
    assert.equal(workspace._container.layout_manager._workarea, f.workarea);
    f.zoom.destroy();
    assert.equal(workspace._background.constructor, f.WorkspaceBackground);
    assert.equal(custom.destroyed, true);
});

test('workarea restoration failure does not prevent background restoration', async t => {
    const f = await createOverviewZoomFixture(t);
    f.zoom.configure(true);
    const workspace = f.createWorkspace();
    f.zoom.addWorkspace(workspace);
    const layout = workspace._container.layout_manager;
    const original = layout.layout_changed;
    layout.layout_changed = () => { throw new Error('layout unavailable'); };
    f.zoom.destroy();
    assert.equal(workspace._background.constructor, f.WorkspaceBackground);
    layout.layout_changed = original;
    f.zoom.destroy();
    assert.equal(f.state.errors.length, 1);
});
