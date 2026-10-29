import assert from 'node:assert/strict';
import test from 'node:test';
import { createEventsFixture } from './fixtures/events.js';
import { createRendererFixture } from './fixtures/renderer.js';

const createFixture = async t => {
    const f = await createEventsFixture(t);
    const r = await createRendererFixture(t);
    const renderer = r.createRenderer();
    const events = f.createEvents({
        onWindowChanged: (state, isWorkspaceChanged) => renderer.updateWindow(state, isWorkspaceChanged),
        onWindowProgress: state => renderer.followWindow(state),
        onWorkspaceProgress: state => renderer.updateWorkspaceProgress(state),
        onWorkspaceCompleted: state => renderer.completeWorkspace(state),
        onOverviewChanged: state => renderer.updateOverview(state)
    });
    return { f, r, events, renderer };
};

for (const overviewTransition of [false, true]) {
    test(`Do nothing observes no overview signals and keeps window/workspace updates live, saved gesture ${overviewTransition}`, async t => {
        const { f, r, events, renderer } = await createFixture(t);
        const config = { ...r.settings, ...f.config, overviewBehavior: 'do-nothing', overviewTransition };
        renderer.configure(config, events.configure(config));
        assert.equal(f.overview.handlers.size, 0);
        assert.equal(f.adjustment.handlers.size, 0);
        f.overview.visible = true;
        f.overview.visibleTarget = true;
        f.overview.emit('showing');
        f.first.y = 32;
        f.first.emit('position-changed');
        f.flush();
        r.expectStyle('panel-maximized-gradient');
        assert.equal(r.children.size, 0);
        f.first.y = 100;
        f.first.emit('position-changed');
        f.flush();
        r.expectStyle('panel-gradient');
        f.state.activeWorkspace = f.workspaceB;
        f.workspaceManager.emit('workspace-switched');
        r.expectStyle('panel-maximized-gradient');
        f.overview.visibleTarget = false;
        f.overview.emit('hiding');
        f.overview.visible = false;
        f.overview.emit('hidden');
        assert.equal(f.overviewStates.length, 0);
    });
}

test('Do nothing leaves an ongoing desktop animation running through overview', async t => {
    const r = await createRendererFixture(t);
    const renderer = r.createRenderer();
    const hidden = { progress: 0, isHidden: true, isTargetVisible: false };
    const config = { ...r.settings, windowBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true, overviewBehavior: 'do-nothing' };
    renderer.configure(config, { window: { effectStrength: 0.4 }, workspaceTransition: null, overview: hidden });
    r.state.animationsEnabled = true;
    renderer.updateWindow({ effectStrength: 0.8 });
    const timeline = [...r.timelines][0];
    timeline.advance(0.4);
    renderer.updateOverview({ progress: 0.5, isHidden: false, isTargetVisible: true, effectStrength: 1 });
    assert(r.timelines.has(timeline), 'Overview must not stop an ordinary desktop fade');
    timeline.advance(1);
    assert.equal([...r.children][1].opacity, 204);
});

for (const strength of [0.75, 1]) {
    test(`switching an active overview blend to Do nothing immediately adopts desktop strength ${strength}`, async t => {
        const { f, r, renderer, events } = await createFixture(t);
        const config = { ...r.settings, ...f.config };
        renderer.configure(config, events.configure(config));
        f.overview.visible = true;
        f.overview.visibleTarget = true;
        f.overview.emit('showing');
        f.adjustment.value = 0.4;
        f.adjustment.emit('notify::value');
        const oldLayers = [...r.children];
        f.first.y = strength === 1 ? 32 : 42;
        f.first.emit('position-changed');
        f.flush();
        r.state.animationsEnabled = true;
        const ignored = { ...config, overviewBehavior: 'do-nothing' };
        renderer.configure(ignored, events.configure(ignored));
        assert.equal(f.overview.handlers.size, 0);
        assert.equal(f.adjustment.handlers.size, 0);
        assert.equal(r.timelines.size, 0, 'Switching modes needs no deferred overview cleanup');
        assert([...r.children].every(actor => !oldLayers.includes(actor)));
        if (strength === 1) {
            assert.equal(r.children.size, 0);
            r.expectStyle('panel-maximized-gradient');
        } else {
            assert.equal([...r.children][1].opacity, 191);
        }
    });
}
