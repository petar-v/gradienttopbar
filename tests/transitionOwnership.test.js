import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRendererFixture } from './fixtures/renderer.js';
import { createEventsFixture } from './fixtures/events.js';

const hidden = { progress: null, isHidden: true, isTargetVisible: false };
const shown = { progress: null, isHidden: false, isTargetVisible: true };
const snapshot = (effectStrength = 0, overview = hidden) => ({ window: { effectStrength }, workspaceTransition: null, overview });
const configFor = settings => ({ ...settings, windowBehavior: 'apply-style', overviewTransition: false, workspaceGestureBlending: false });

for (const progressSetting of ['overviewTransition', 'workspaceGestureBlending', 'proximityTransition']) {
    test(`ordinary endpoint changes stay native with ${progressSetting} enabled`, async t => {
        const f = await createRendererFixture(t);
        const renderer = f.createRenderer();
        const config = { ...configFor(f.settings), [progressSetting]: true };
        if (progressSetting === 'proximityTransition')
            config.styleTrigger = 'proximity';
        renderer.configure(config, snapshot());
        f.state.animationsEnabled = true;
        renderer.updateWindow({ effectStrength: 1 });
        renderer.updateWindow({ effectStrength: 0 }, true);
        assert(f.classes.has('panel-gradient'));
        assert.equal(f.state.widgetCreations, 0);
        assert.equal(f.state.timelineCreations ?? 0, 0);
        assert.equal(f.state.writes, 1);
    });
}

test('native destination settles before a gesture, which releases actors at its endpoint', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    renderer.configure({ ...configFor(f.settings), workspaceGestureBlending: true }, snapshot());
    f.state.animationsEnabled = true;
    renderer.updateWindow({ effectStrength: 1 });
    f.state.styleCommits.length = 0;
    renderer.updateWorkspaceProgress({ startStrength: 0, endStrength: 1, progress: 0.4 });
    assert(f.state.styleCommits[0]?.includes('panel-background-restoring'));
    assert(f.state.styleCommits[0]?.includes('panel-maximized-gradient'));
    assert.equal([...f.children][1].opacity, 102);
    assert(!f.classes.has('panel-css-overview'));
    assert(![...f.classes].some(name => name.startsWith('panel-native-duration-')));
    const actors = [...f.children];
    const reads = actors.map(actor => actor.themeReads);
    for (const progress of [0.6, 0.3, 0.8])
        renderer.updateWorkspaceProgress({ startStrength: 0, endStrength: 1, progress });
    assert.deepEqual([...f.children], actors);
    assert.deepEqual(actors.map(actor => actor.themeReads), reads);
    assert.equal(f.state.writes, 1, 'Gesture frames never regenerate CSS');
    assert.equal(f.timelines.size, 0);
    renderer.completeWorkspace({ effectStrength: 1 });
    assert.equal(f.children.size, 0);
    assert(f.classes.has('panel-maximized-gradient'));
    renderer.updateWindow({ effectStrength: 0 });
    assert.equal(f.state.timelineCreations ?? 0, 0);
});

test('a discrete fractional workspace target remains a composition', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    renderer.configure({ ...configFor(f.settings), styleTrigger: 'proximity', proximityTransition: true }, snapshot(0.25));
    f.state.animationsEnabled = true;
    const actors = [...f.children];
    renderer.updateWindow({ effectStrength: 0.75 }, true);
    assert.equal(f.timelines.size, 1);
    assert.equal([...f.children][1].opacity, 64);
    [...f.timelines][0].advance(1);
    assert.deepEqual([...f.children], actors);
    assert.equal([...f.children][1].opacity, 191);
    assert.equal(f.timelines.size, 0);
    renderer.followWindow({ effectStrength: 1 });
    assert.equal(f.children.size, 0);
    renderer.updateWindow({ effectStrength: 0 }, true);
    assert.equal(f.state.timelineCreations, 1);
});

test('binary overview takes custom ownership and exits to fresh fractional desktop', async t => {
    const f = await createRendererFixture(t);
    Object.assign(f.settings, configFor(f.settings), { styleTrigger: 'proximity', proximityTransition: true });
    f.state.strength = 0.4;
    const extension = f.createExtension();
    extension.enable();
    assert.equal([...f.children][1].opacity, 102);
    f.showOverview(true);
    assert.equal(f.children.size, 0, 'Binary overview releases desktop layers');
    assert(!f.classes.has('panel-background-blending'));
    f.expectStyle('panel-overview-gradient');
    f.state.strength = 0.7;
    f.windowEvents.updateState();
    assert.equal(f.children.size, 0);
    f.showOverview(false);
    assert.equal([...f.children][1].opacity, 179, 'Exit restores the latest fractional desktop');
    assert(!f.classes.has('panel-css-overview'), 'Shell cannot paint through restored layers');
});

test('mixed binary overview observes takeover and return while pure CSS stays passive', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    const binary = { ...f.config, overviewTransition: false, workspaceGestureBlending: false };
    events.configure(binary);
    assert.deepEqual([...f.overview.handlers.values()].map(handler => handler.signal).sort(), ['hiding', 'showing']);
    assert.equal(f.adjustment.handlers.size, 0);
    events.configure({ ...binary, proximityTransition: false });
    assert.equal(f.overview.handlers.size, 0);
});

test('progressive overview releases settled layers and later desktop changes stay native', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    renderer.configure({ ...configFor(f.settings), overviewTransition: true }, snapshot());
    renderer.updateOverview({ ...shown, progress: 0.4, effectStrength: 0 });
    assert.equal([...f.children][1].opacity, 102);
    renderer.updateOverview({ ...shown, progress: 1, effectStrength: 0 });
    assert.equal(f.children.size, 0);
    renderer.updateOverview({ ...hidden, progress: 0, effectStrength: 0 });
    renderer.updateWindow({ effectStrength: 1 });
    assert.equal(f.children.size, 0);
    assert.equal(f.state.timelineCreations ?? 0, 0);
});


test('overview reversal after native endpoint release starts from fresh fractional input', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    renderer.configure({ ...configFor(f.settings), styleTrigger: 'proximity', proximityTransition: true, overviewTransition: true }, snapshot(0.4));
    renderer.updateOverview({ ...shown, progress: 1, effectStrength: 0.4 });
    assert.equal(f.children.size, 0);
    renderer.updateWindow({ effectStrength: 0.7 });
    renderer.updateOverview({ ...shown, progress: 0.5, effectStrength: 0.7 });
    const source = [...f.children][0];
    assert.equal(source.get_children()[1].opacity, 179);
    assert.equal([...f.children][1].opacity, 128);
    assert.equal(f.timelines.size, 0);
});

test('disabling overview progress retains lifecycle only until its captured mixture settles', async t => {
    const f = await createRendererFixture(t);
    Object.assign(f.settings, configFor(f.settings), { overviewTransition: true });
    f.setOverviewProgress(0.4);
    f.showOverview(true);
    const extension = f.createExtension();
    extension.enable();
    f.state.animationsEnabled = true;
    f.settings.overviewTransition = false;
    f.refreshConfiguration();
    assert.equal(f.timelines.size, 1);
    assert.deepEqual([...f.handlers.values()].map(handler => handler.signal).sort(), ['hidden', 'hiding', 'showing']);
    f.showOverview(false);
    assert.equal(f.children.size, 0, 'Final hidden cancels the obsolete captured overview');
    assert.equal(f.timelines.size, 0);
    assert.equal(f.handlers.size, 0, 'Passive CSS resumes after custom cleanup');
    f.state.strength = 1;
    f.windowEvents.updateState();
    assert(f.classes.has('panel-maximized-gradient'));
});


test('fractional desktop restores gradient content shadows when leaving the native theme endpoint', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    renderer.configure({ ...configFor(f.settings), windowBehavior: 'keep-theme', styleTrigger: 'proximity', proximityTransition: true }, snapshot(1));
    assert(!f.classes.has('panel-gradient'));
    renderer.followWindow({ effectStrength: 0.4 });
    assert.equal(f.children.size, 2);
    assert(f.classes.has('panel-gradient'), 'Custom desktop composition uses its gradient content-shadow base');
    assert.equal(f.timelines.size, 0);
    renderer.followWindow({ effectStrength: 1 });
    assert.equal(f.children.size, 0);
    assert(!f.classes.has('panel-gradient'), 'Native original theme regains its own shadows');
});

test('real workspace changes between binary endpoints remain native with overview progress enabled', async t => {
    const f = await createEventsFixture(t);
    const r = await createRendererFixture(t);
    const renderer = r.createRenderer();
    const events = f.createEvents({
        onWindowChanged: (state, isWorkspaceChanged) => renderer.updateWindow(state, isWorkspaceChanged),
        onOverviewChanged: state => renderer.updateOverview(state)
    });
    const config = { ...r.settings, ...f.config, proximityTransition: false, workspaceGestureBlending: false };
    f.first.y = 100;
    renderer.configure(config, events.configure(config));
    r.state.animationsEnabled = true;
    f.state.activeWorkspace = f.workspaceB;
    f.workspaceManager.emit('workspace-switched');
    assert(r.classes.has('panel-maximized-gradient'));
    f.state.activeWorkspace = f.workspaceA;
    f.workspaceManager.emit('workspace-switched');
    assert(r.classes.has('panel-gradient'));
    assert.equal(r.state.widgetCreations, 0);
    assert.equal(r.state.timelineCreations ?? 0, 0);
    assert.equal(f.swipeTracker.handlers.size, 0);
});

test('custom binary overview exit may finish before hidden without suppressing later desktop changes', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    renderer.configure({ ...configFor(f.settings), styleTrigger: 'proximity', proximityTransition: true }, snapshot(0.4));
    renderer.updateOverview({ ...shown, effectStrength: 0.4 });
    assert.equal(f.children.size, 0);
    f.state.animationsEnabled = true;
    renderer.updateOverview({ ...hidden, isHidden: false, effectStrength: 0.6 });
    assert.equal(f.timelines.size, 1);
    [...f.timelines][0].advance(1);
    assert.equal([...f.children][1].opacity, 153);
    renderer.updateWindow({ effectStrength: 1 });
    assert.equal(f.timelines.size, 1, 'Desktop updates can retarget the visible fractional composition before hidden');
    [...f.timelines][0].advance(1);
    assert.equal(f.children.size, 0);
    renderer.updateWindow({ effectStrength: 0 });
    assert(f.classes.has('panel-gradient'));
    assert.equal(f.timelines.size, 0, 'Ordinary native changes resume before a final hidden signal');
});


test('a captured theme mixture keeps overview content shadows while settings enable passive CSS', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    const config = { ...configFor(f.settings), windowBehavior: 'keep-theme', styleTrigger: 'proximity', proximityTransition: true };
    renderer.configure(config, snapshot(0.4));
    f.setOverviewState(shown);
    f.state.animationsEnabled = true;
    renderer.configure({ ...config, proximityTransition: false }, snapshot(1, shown));
    assert.equal(f.children.size, 2);
    assert.equal(f.timelines.size, 1);
    assert(f.classes.has('panel-overview-gradient'), 'The custom overview base owns its gradient content shadows');
    assert(!f.classes.has('panel-css-overview'), 'Passive CSS begins only after the captured mixture settles');
    const source = [...f.children][0];
    assert.equal(source.get_children()[1].opacity, 102, 'The exact captured theme mixture is retained');
    [...f.timelines][0].advance(1);
    assert.equal(f.children.size, 0);
    assert(f.classes.has('panel-css-overview'));
    assert(!f.classes.has('panel-overview-gradient'), 'The desktop theme endpoint is underneath passive overview CSS');
});


for (const isGestureDriven of [false, true]) {
    test(`overview endpoint restoration allocates no replacement actors, gesture ${isGestureDriven}`, async t => {
        const f = await createRendererFixture(t);
        const renderer = f.createRenderer();
        renderer.configure({ ...configFor(f.settings), overviewTransition: true }, snapshot());
        renderer.updateOverview({ ...shown, progress: 0.4, effectStrength: 0 });
        assert.equal(f.children.size, 2);
        const widgetCreations = f.state.widgetCreations;
        f.state.animationsEnabled = true;
        renderer.updateOverview({ ...shown, progress: isGestureDriven ? 0 : null, isTargetVisible: false, effectStrength: 0 });
        if (!isGestureDriven) {
            assert.equal(f.timelines.size, 1);
            [...f.timelines][0].advance(1);
        }
        assert.equal(f.children.size, 0);
        assert.equal(f.timelines.size, 0);
        assert(f.classes.has('panel-gradient'));
        assert.equal(f.state.widgetCreations, widgetCreations, 'An immediate endpoint commits native styling without building throwaway desktop actors');
    });
}

test('steady overview progress reuses composition without capturing its appearance', async t => {
    const f = await createRendererFixture(t);
    const probe = f.createBlend({ gradientClass: null }, { gradientClass: null });
    const blendPrototype = Object.getPrototypeOf(probe);
    const getStyle = blendPrototype.getStyle;
    probe.destroy();
    let captures = 0;
    blendPrototype.getStyle = function () {
        captures++;
        return getStyle.call(this);
    };
    t.after(() => { blendPrototype.getStyle = getStyle; });
    const renderer = f.createRenderer();
    renderer.configure({ ...configFor(f.settings), styleTrigger: 'proximity', proximityTransition: true, overviewTransition: true }, snapshot(0.4));
    renderer.updateOverview({ ...shown, progress: 0.25, effectStrength: 0.4 });
    assert(captures > 0, 'Overview entry captures the displayed custom desktop at the ownership boundary');
    const actors = [...f.children];
    assert.equal(actors[0].get_children()[1].opacity, 102, 'The boundary capture preserves the exact fractional desktop');
    const boundaryCaptures = captures;
    for (const progress of [0.4, 0.6, 0.5])
        renderer.updateOverview({ ...shown, progress, effectStrength: 0.4 });
    assert.deepEqual([...f.children], actors);
    assert.equal(captures, boundaryCaptures, 'Ordinary progress updates do not allocate capture objects');
});


test('unchanged real geometry cancels a native structural fade once', async t => {
    const f = await createEventsFixture(t);
    const r = await createRendererFixture(t);
    const renderer = r.createRenderer();
    const events = f.createEvents({
        onWindowChanged: (state, isWorkspaceChanged) => renderer.updateWindow(state, isWorkspaceChanged),
        onWindowProgress: state => renderer.followWindow(state)
    });
    const config = { ...r.settings, ...f.config, workspaceGestureBlending: false, overviewTransition: false };
    f.first.y = 100;
    renderer.configure(config, events.configure(config));
    r.state.animationsEnabled = true;
    const created = new f.Window(3, 32);
    created.workspace = f.workspaceA;
    f.state.windows.push(created);
    f.shell.display.emit('window-created', created);
    assert(r.classes.has('panel-native-duration-150'));
    assert(r.classes.has('panel-maximized-gradient'));
    const structuralUpdates = r.state.classUpdates;
    created.emit('position-changed');
    f.flush();
    assert(r.classes.has('panel-native-duration-0'), 'Unchanged geometry installs a zero-duration native node to cancel the structural fade');
    assert(!r.classes.has('panel-native-duration-150'));
    assert.equal(r.state.classUpdates, structuralUpdates + 1);
    assert(r.state.styleCommits.at(-1).includes('panel-native-duration-0'));
    const geometryUpdates = f.windowStates.length;
    created.emit('size-changed');
    f.flush();
    assert.equal(f.windowStates.length, geometryUpdates, 'Further identical geometry remains deduplicated');
    assert.equal(r.state.classUpdates, structuralUpdates + 1);
    assert.equal(r.state.widgetCreations, 0);
    assert.equal(r.state.timelineCreations ?? 0, 0);
});

for (const isWorkspaceDriven of [false, true]) {
    test(`direct endpoint takeover cancels native timing and deduplicates repeats, workspace ${isWorkspaceDriven}`, async t => {
        const f = await createRendererFixture(t, { WINDOW_ENTER_DURATION_MS: 181, WORKSPACE_SWITCH_DURATION_MS: 231 });
        const renderer = f.createRenderer();
        const config = { ...configFor(f.settings), styleTrigger: 'proximity', proximityTransition: true };
        renderer.configure(config, snapshot());
        renderer.updateWindow({ effectStrength: 1 });
        assert(f.classes.has('panel-native-duration-181'));
        const ordinaryUpdates = f.state.classUpdates;
        renderer.updateWindow({ effectStrength: 1 }, true);
        assert(f.classes.has('panel-native-duration-181'), 'Same-target timed requests retain the existing cause duration');
        assert.equal(f.state.classUpdates, ordinaryUpdates);
        const followEndpoint = () => {
            if (isWorkspaceDriven)
                renderer.updateWorkspaceProgress({ startStrength: 1, endStrength: 1, progress: 0.4 });
            else
                renderer.followWindow({ effectStrength: 1 });
        };
        const timedUpdates = f.state.classUpdates;
        followEndpoint();
        assert(f.classes.has('panel-native-duration-0'));
        assert(!f.classes.has('panel-native-duration-181'));
        assert.equal(f.state.classUpdates, timedUpdates + 1);
        followEndpoint();
        assert.equal(f.state.classUpdates, timedUpdates + 1, 'The same endpoint and duration remain a no-op');
        assert(f.classes.has('panel-maximized-gradient'));
        renderer.configure({ ...config, styleTrigger: 'maximized' }, snapshot(1));
        assert(f.classes.has('panel-css-overview'));
        const passiveUpdates = f.state.classUpdates;
        followEndpoint();
        renderer.updateWindow({ effectStrength: 1 });
        assert.equal(f.state.classUpdates, passiveUpdates, 'Passive Shell ownership keeps its CSS timing for repeated destinations');
        assert.equal(f.state.widgetCreations, 0);
        assert.equal(f.state.timelineCreations ?? 0, 0);
    });
}
