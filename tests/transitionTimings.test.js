import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRendererFixture } from './fixtures/renderer.js';
import { createEventsFixture } from './fixtures/events.js';
import * as defaultTimings from '../src/gradient/transitionTimings.js';

const timings = {
    WINDOW_ENTER_DURATION_MS: 181,
    WINDOW_EXIT_DURATION_MS: 182,
    OVERVIEW_ENTER_DURATION_MS: 211,
    OVERVIEW_EXIT_DURATION_MS: 212,
    WORKSPACE_SWITCH_DURATION_MS: 231
};
const desktop = { progress: null, isHidden: true, isTargetVisible: false };

test('non-blended overview CSS uses independent entry and exit durations', async t => {
    const f = await createRendererFixture(t, timings);
    f.createRenderer().configure(f.settings, {
        window: { effectStrength: 0 }, workspaceTransition: null, overview: desktop
    });
    assert.match(f.state.css, /#panel\s*\{\s*transition-duration: 212ms;/);
    assert.match(f.state.css, /#panel:overview\s*\{\s*transition-duration: 211ms;/);
    assert.match(f.state.css, /#panel\.panel-background-blending\s*\{[^}]*transition-duration: 0ms;/);
    assert.match(f.state.css, /#panel\.panel-background-restoring\s*\{\s*transition-duration: 0ms;/);
});

test('window entry, restoration and workspace fallback use their own durations', async t => {
    const f = await createRendererFixture(t, timings);
    const renderer = f.createRenderer();
    renderer.configure({ ...f.settings, windowBehavior: 'apply-style' }, {
        window: { effectStrength: 0 }, workspaceTransition: null, overview: desktop
    });
    f.state.animationsEnabled = true;
    renderer.updateWindow({ effectStrength: 1 });
    const timeline = [...f.timelines][0];
    assert.equal(timeline.duration, 181);
    timeline.advance(0.5);
    renderer.updateWindow({ effectStrength: 0 });
    assert.equal([...f.timelines][0], timeline, 'Reversal retains the controller');
    assert.equal(timeline.duration, 182, 'Reversal changes the controller duration');
    timeline.advance(1);
    renderer.updateWindow({ effectStrength: 1 }, true);
    assert.equal([...f.timelines][0].duration, 231);
});

test('overview settling changes duration when its destination reverses', async t => {
    const f = await createRendererFixture(t, timings);
    const renderer = f.createRenderer();
    const snapshot = {
        window: { effectStrength: 0 }, workspaceTransition: null,
        overview: { progress: 0.4, isHidden: false, isTargetVisible: true }
    };
    renderer.configure({ ...f.settings, overviewTransition: true }, snapshot);
    f.state.animationsEnabled = true;
    renderer.configure({ ...f.settings, overviewTransition: false }, snapshot);
    const timeline = [...f.timelines][0];
    assert.equal(timeline.duration, 211);
    timeline.advance(0.5);
    renderer.updateOverview({ progress: null, isHidden: false, isTargetVisible: false, effectStrength: 0 });
    assert.equal([...f.timelines][0], timeline);
    assert.equal(timeline.duration, 212);
});

test('separate non-blending timings preserve structural fades and gesture tracking', async t => {
    const f = await createRendererFixture(t, timings);
    const renderer = f.createRenderer();
    renderer.configure({
        ...f.settings, windowBehavior: 'apply-style', styleTrigger: 'proximity',
        proximityTransition: true, overviewTransition: true
    }, { window: { effectStrength: 0 }, workspaceTransition: null, overview: desktop });
    f.state.animationsEnabled = true;
    renderer.updateWindow({ effectStrength: 0.4 });
    assert.equal([...f.timelines][0].duration, 181, 'Structural proximity changes use the window fade');
    renderer.updateWorkspaceProgress({ startStrength: 0.2, endStrength: 0.8, progress: 0.5 });
    assert.equal(f.timelines.size, 0);
    assert.equal([...f.children][1].opacity, 128, 'Workspace progress applies directly');
    renderer.updateOverview({ progress: 0.4, isHidden: false, isTargetVisible: true, effectStrength: 0.4 });
    assert.equal(f.timelines.size, 0);
    assert.equal([...f.children][1].opacity, 102, 'Overview progress applies directly');
});

test('event coordination identifies workspace fallbacks without changing window snapshots', async t => {
    const f = await createEventsFixture(t);
    const sources = [];
    const events = f.createEvents({ onWindowChanged: (_state, isWorkspaceChanged) => sources.push(isWorkspaceChanged) });
    events.configure({ ...f.config, proximityTransition: false });
    f.first.y = 92;
    f.first.emit('position-changed');
    f.flush();
    assert.deepEqual(sources, [false]);
    f.state.activeWorkspace = f.workspaceB;
    f.workspaceManager.emit('workspace-switched');
    assert.deepEqual(sources, [false, true]);
    assert.equal(f.windowStates.at(-1).currentWorkspace, f.workspaceB);
});

test('extension forwards workspace timing to the renderer', async t => {
    const f = await createRendererFixture(t, timings);
    f.settings.windowBehavior = 'apply-style';
    f.createExtension().enable();
    f.state.animationsEnabled = true;
    f.windowEvents.callback({ effectStrength: 0, currentWorkspace: { index: () => 0 } }, true);
    f.windowEvents.callback({ effectStrength: 1, currentWorkspace: { index: () => 1 } }, true);
    assert.equal([...f.timelines][0].duration, 231);
});

test('a zero fade duration commits immediately without starting a timeline', async t => {
    const f = await createRendererFixture(t);
    f.state.animationsEnabled = true;
    const blend = f.createBlend({ gradientClass: 'panel-gradient' }, { gradientClass: null });
    let completed = false;
    blend.animateTo(1, () => { completed = true; }, 0);
    assert.equal(f.timelines.size, 0);
    assert.equal(blend.progress, 1);
    assert.equal(completed, true);
});

test('repeated and retargeted fades avoid redundant native duration access', async t => {
    const f = await createRendererFixture(t);
    f.state.animationsEnabled = true;
    const blend = f.createBlend({ gradientClass: 'panel-gradient' }, { gradientClass: null });
    const completions = [];
    blend.animateTo(0.8, () => completions.push('initial'), 200);
    const timeline = [...f.timelines][0];
    timeline.advance(0.5);
    const progress = blend.progress;
    for (let i = 0; i < 60; i++)
        blend.animateTo(0.8, () => completions.push('duplicate'), 200);
    assert.equal(blend.progress, progress);
    assert.equal(f.state.timelineStops, 0, 'Identical requests retain the running fade');
    for (let i = 0; i < 60; i++)
        blend.animateTo(i % 2 ? 0.8 : 0.6, () => completions.push(i), 200);
    assert.equal(blend.progress, progress, 'Retargeting preserves the current mixture');
    assert.equal(f.state.timelineDurationReads, 0);
    assert.equal(f.state.timelineDurationWrites, 0, 'Construction supplies the initial duration');
    blend.animateTo(0.8, () => completions.push('new duration'), 350);
    assert.equal(f.state.timelineDurationWrites, 1, 'The same target accepts a changed duration');
    assert.equal(timeline.duration, 350);
    timeline.advance(1);
    assert.equal(blend.progress, 0.8);
    assert.deepEqual(completions, ['new duration']);
    assert.equal(f.state.timelineCreations, 1);
});

test('workspace progress after a completed partial fade does not stop an idle timeline', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    renderer.configure({
        ...f.settings, windowBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true
    }, { window: { effectStrength: 0.2 }, workspaceTransition: null, overview: desktop });
    f.state.animationsEnabled = true;
    renderer.updateWindow({ effectStrength: 0.6 });
    [...f.timelines][0].advance(1);
    const stops = f.state.timelineStops;
    for (let i = 1; i <= 60; i++)
        renderer.updateWorkspaceProgress({ startStrength: 0.2, endStrength: 0.8, progress: i / 60 });
    assert.equal(f.state.timelineStops, stops);
    assert.equal(f.timelines.size, 0);
    assert.equal([...f.children][1].opacity, 204);
    renderer.updateWindow({ effectStrength: 0.4 });
    assert.equal(f.state.timelineCreations, 1, 'The completed controller can restart');
    [...f.timelines][0].advance(1);
    assert.equal([...f.children][1].opacity, 102);
});

test('progressive mode is derived during configuration and refreshed when settings change', async t => {
    const f = await createRendererFixture(t, timings);
    const renderer = f.createRenderer();
    for (const [trigger, blending, progressive] of [
        ['proximity', true, true], ['proximity', false, false],
        ['proximity', true, true], ['maximized', true, false]
    ]) {
        let triggerReads = 0;
        const config = {
            ...f.settings, windowBehavior: 'apply-style', proximityTransition: blending,
            get styleTrigger() { triggerReads++; return trigger; }
        };
        f.state.animationsEnabled = false;
        renderer.configure(config, {
            window: { effectStrength: 0 }, workspaceTransition: null, overview: desktop
        });
        triggerReads = 0;
        f.state.animationsEnabled = true;
        renderer.updateWindow({ effectStrength: 0.4 });
        const timeline = [...f.timelines][0];
        assert.equal(timeline.duration, 181);
        if (progressive) {
            timeline.advance(1);
            assert.equal([...f.children][1].opacity, 102);
        }
        renderer.updateWorkspaceProgress({ startStrength: 0.2, endStrength: 0.8, progress: 0.5 });
        if (progressive)
            assert.equal([...f.children][1].opacity, 128);
        else
            f.expectStyle('panel-maximized-gradient');
        renderer.completeWorkspace({ effectStrength: 0.4 });
        renderer.updateOverview({ progress: null, isHidden: true, isTargetVisible: false, effectStrength: 0.4 });
        assert.equal(triggerReads, 0, 'Updates reuse the configured mode');
    }
});

test('fixed fades default to 150ms', () => {
    for (const duration of Object.values(defaultTimings))
        assert.equal(duration, 150);
});

test('progressive geometry follows every input directly and cancels a structural fade', async t => {
    const f = await createRendererFixture(t, timings);
    const renderer = f.createRenderer();
    renderer.configure({
        ...f.settings, windowBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true
    }, { window: { effectStrength: 0 }, workspaceTransition: null, overview: desktop });
    f.state.animationsEnabled = true;
    for (const strength of [0.2, 0.6, 0.4, 0.8]) {
        renderer.followWindow({ effectStrength: strength });
        assert.equal(f.timelines.size, 0, 'Geometry has no timed tail');
        assert.equal([...f.children][1].opacity, Math.round(strength * 255));
    }
    assert.equal(f.state.timelineCreations ?? 0, 0);
    renderer.updateWindow({ effectStrength: 0.4 });
    assert.equal([...f.timelines][0].duration, 181, 'Structural changes still fade');
    [...f.timelines][0].advance(0.5);
    renderer.followWindow({ effectStrength: 0.3 });
    assert.equal(f.timelines.size, 0, 'Movement takes over from the running structural fade');
    assert.equal([...f.children][1].opacity, 77);
});

for (const [styleTrigger, proximityTransition, proximityDistance] of [
    ['proximity', false, 40], ['proximity', true, 0], ['maximized', true, 40]
]) {
    test(`${styleTrigger}/${proximityTransition}/${proximityDistance} geometry retains binary fades`, async t => {
        const f = await createRendererFixture(t, timings);
        const renderer = f.createRenderer();
        renderer.configure({
            ...f.settings, windowBehavior: 'apply-style', styleTrigger, proximityTransition, proximityDistance
        }, { window: { effectStrength: 0 }, workspaceTransition: null, overview: desktop });
        f.state.animationsEnabled = true;
        renderer.updateWindow({ effectStrength: 1 });
        assert.equal([...f.timelines][0].duration, 181);
    });
}

test('workspace fallback retains its fade when queued geometry changes workspace', async t => {
    const f = await createRendererFixture(t, timings);
    const renderer = f.createRenderer();
    renderer.configure({
        ...f.settings, windowBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true
    }, { window: { effectStrength: 0 }, workspaceTransition: null, overview: desktop });
    f.state.animationsEnabled = true;
    renderer.updateWindow({ effectStrength: 0.5 }, true);
    assert.equal([...f.timelines][0].duration, 231);
});

test('extension wires window progress to direct proximity and discrete changes to fades', async t => {
    const f = await createRendererFixture(t, timings);
    Object.assign(f.settings, { windowBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true });
    f.createExtension().enable();
    f.state.animationsEnabled = true;
    f.windowEvents.callback({ effectStrength: 0.4 }, false, true);
    assert.equal(f.timelines.size, 0);
    assert.equal([...f.children][1].opacity, 102);
    f.windowEvents.callback({ effectStrength: 0.8 });
    assert.equal([...f.timelines][0].duration, 181);
});
