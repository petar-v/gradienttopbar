import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as appearance from '../src/gradient/appearance.js';
import { createEventsFixture } from './fixtures/events.js';
import { createRendererFixture } from './fixtures/renderer.js';

const main = { colors: { start: 'rgba(0,0,0,1)', end: 'rgba(0,0,0,0)' }, direction: 'vertical' };
const copyGradient = gradient => ({ ...gradient, colors: { ...gradient.colors } });
const same = copyGradient(main);
const different = { ...main, colors: { ...main.colors, end: 'rgba(0,0,0,0.5)' } };

for (const [windowBehavior, overviewBehavior, alternate, overview, expected] of [
    ['keep-gradient', 'do-nothing', different, different, [false, false, false]],
    ['keep-gradient', 'keep-gradient', different, different, [false, false, false]],
    ['apply-style', 'apply-style', same, same, [false, false, false]],
    ['apply-style', 'keep-theme', same, same, [false, true, true]],
    ['keep-theme', 'keep-theme', same, same, [true, true, true]],
    ['apply-style', 'do-nothing', different, same, [true, false, false]],
    ['apply-style', 'keep-gradient', different, same, [true, true, true]],
    ['apply-style', 'apply-style', same, different, [false, true, true]],
    ['apply-style', 'do-nothing', { ...same, direction: 'horizontal' }, same, [true, false, false]]
]) {
    test(`effective appearance requirements: ${windowBehavior}, ${overviewBehavior}, ${JSON.stringify(expected)}`, () => {
        assert.equal(typeof appearance.getObservationNeeds, 'function');
        const config = { windowBehavior, overviewBehavior, overviewTransition: true, gradients: { main, alternate, overview } };
        const needs = appearance.getObservationNeeds(config);
        assert.deepEqual([needs.isWindowObservationNeeded, needs.isOverviewObservationNeeded, needs.isOverviewProgressNeeded], expected);
        assert.equal(appearance.getObservationNeeds({ ...config, overviewTransition: false }).isOverviewProgressNeeded, false);
    });
}

const createFixture = async t => {
    const f = await createEventsFixture(t);
    const r = await createRendererFixture(t);
    const renderer = r.createRenderer();
    const events = f.createEvents({
        onWindowChanged: (state, workspaceChanged) => renderer.updateWindow(state, workspaceChanged),
        onWindowProgress: state => renderer.followWindow(state),
        onWorkspaceProgress: state => renderer.updateWorkspaceProgress(state),
        onWorkspaceCompleted: state => renderer.completeWorkspace(state),
        onOverviewChanged: state => renderer.updateOverview(state)
    });
    return { f, r, renderer, events, config: { ...r.settings, ...f.config } };
};

for (const overviewTransition of [false, true]) {
    for (const contentShadows of [false, true]) {
        test(`identical gradients do no dynamic work: overview transition ${overviewTransition}, shadows ${contentShadows}`, async t => {
            const { f, r, renderer, events, config } = await createFixture(t);
            const settings = {
                ...config, overviewTransition, contentShadows,
                gradients: { main, alternate: copyGradient(main), overview: copyGradient(main) }
            };
            renderer.configure(settings, events.configure(settings));
            assert([...f.targets].every(target => target.handlers.size === 0));
            assert.equal(f.reads.scans, 0);
            assert.equal(r.children.size, 0);
            assert.equal(r.timelines.size, 0);
            assert.equal(r.state.writes, 1);
            for (let i = 0; i < 10; i++) {
                f.first.y = i % 2 ? 42 : 100;
                f.first.emit('position-changed');
                f.flush();
                f.workspaceManager.emit('workspace-switched');
                f.overview.emit('showing');
                f.overview.emit('hidden');
            }
            assert.equal(f.windowStates.length, 0);
            assert.equal(f.overviewStates.length, 0);
            assert.equal(f.reads.scans, 0);
            assert.equal(r.children.size, 0);
            assert.equal(r.state.writes, 1);
        });
    }
}

test('equalizing desktop endpoints cancels queued work and settles an active fade', async t => {
    const { f, r, renderer, events, config } = await createFixture(t);
    f.first.y = 100;
    r.state.animationsEnabled = true;
    renderer.configure(config, events.configure(config));
    const created = new f.Window(3, 42);
    created.workspace = f.workspaceA;
    f.state.windows.push(created);
    f.shell.display.emit('window-created', created);
    [...r.timelines][0].advance(0.4);
    created.emit('position-changed');
    assert.equal(f.pending.size, 1);
    const equal = { ...config, overviewBehavior: 'keep-gradient', gradients: { ...config.gradients, alternate: copyGradient(config.gradients.main) } };
    renderer.configure(equal, events.configure(equal));
    assert.equal(f.pending.size, 0);
    assert.equal(r.timelines.size, 0);
    assert.equal(r.children.size, 0);
    assert([...f.targets].every(target => target.handlers.size === 0));
    r.expectStyle('panel-gradient');
    renderer.configure(config, events.configure(config));
    assert.equal(f.first.handlers.size, 3);
    for (const timeline of [...r.timelines])
        timeline.advance(1);
    assert.equal([...r.children][1].opacity, 191, 'Reenabling reads current proximity');
});

for (const change of ['behavior', 'definitions']) {
    test(`do-nothing immediately releases its desktop blend when ${change} make the configuration static`, async t => {
        const { f, r, renderer, events, config } = await createFixture(t);
        const settings = {
            ...config, overviewBehavior: 'do-nothing',
            gradients: { ...config.gradients, main: { ...main, colors: { start: 'rgba(0,0,0,1)', end: 'rgba(0,0,0,1)' } } }
        };
        renderer.configure(settings, events.configure(settings));
        const actors = [...r.children];
        assert.equal(actors.length, 2);
        f.overview.visible = true;
        f.overview.visibleTarget = true;
        f.overview.emit('showing');
        const equal = change === 'behavior'
            ? { ...settings, windowBehavior: 'keep-gradient' }
            : { ...settings, gradients: { ...settings.gradients, alternate: copyGradient(settings.gradients.main) } };
        renderer.configure(equal, events.configure(equal));
        assert.equal(f.first.handlers.size, 0);
        assert.equal(f.overview.handlers.size, 0);
        assert.equal(r.children.size, 0);
        assert.equal(r.timelines.size, 0);
        f.overview.visible = false;
        f.overview.visibleTarget = false;
        f.overview.emit('hidden');
        assert.equal(r.children.size, 0);
        assert.equal(r.timelines.size, 0);
        assert([...f.targets].every(target => target.handlers.size === 0));
        r.expectStyle('panel-gradient');
    });
}

test('equalizing an overview gesture releases its animation layers', async t => {
    const { f, r, renderer, events, config } = await createFixture(t);
    renderer.configure(config, events.configure(config));
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    f.overview.emit('showing');
    f.adjustment.value = 0.4;
    f.adjustment.emit('notify::value');
    assert.equal(r.children.size, 2);
    r.state.animationsEnabled = true;
    const equal = { ...config, gradients: { main, alternate: copyGradient(main), overview: copyGradient(main) } };
    renderer.configure(equal, events.configure(equal));
    assert.equal(r.children.size, 0);
    assert.equal(r.timelines.size, 0);
    assert.equal(f.adjustment.handlers.size, 0);
    f.overview.visible = false;
    f.overview.visibleTarget = false;
    f.overview.emit('hidden');
    assert([...f.targets].every(target => target.handlers.size === 0));
    r.expectStyle('panel-gradient');
});

test('reenabling adopts an ongoing workspace swipe without publishing intermediate state', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure({ ...f.config, windowBehavior: 'keep-gradient', overviewBehavior: 'do-nothing' });
    const group = f.startSwipe(f.workspaceA, f.workspaceB, 0.4);
    f.first.y = 42;
    const snapshot = events.configure(f.config);
    assert.equal(snapshot.workspaceTransition?.progress, 0.4);
    assert.equal(snapshot.workspaceTransition.startStrength, 0.75);
    assert.equal(group.handlers.size, 2);
    assert.equal(f.windowStates.length, 0);
    assert.equal(f.overviewStates.length, 0);
    group.progress = 0.7;
    group.emit('notify::progress');
    assert.equal(f.windowStates.at(-1).progress, 0.7);
    group.emit('destroy');
    assert.equal(group.handlers.size, 0);
});

test('reenabling inside overview reads current gesture and keeps desktop swipe tracking stopped', async t => {
    const { f, r, renderer, events, config } = await createFixture(t);
    const equal = { ...config, gradients: { main, alternate: copyGradient(main), overview: copyGradient(main) } };
    renderer.configure(equal, events.configure(equal));
    const group = f.startSwipe(f.workspaceA, f.workspaceB, 0.4);
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    f.adjustment.value = 0.6;
    f.first.y = 42;
    const snapshot = events.configure(config);
    renderer.configure(config, snapshot);
    assert.equal(snapshot.overview.progress, 0.6);
    assert.equal(snapshot.window.effectStrength, 0.75);
    assert.equal(snapshot.workspaceTransition, null);
    assert.equal(group.handlers.size, 0);
    assert.equal(f.adjustment.handlers.size, 1);
    assert.equal([...r.children][1].opacity, 153);
    assert.equal(f.windowStates.length, 0);
});
