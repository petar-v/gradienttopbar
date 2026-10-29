import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRendererFixture } from './fixtures/renderer.js';
import { createEventsFixture } from './fixtures/events.js';

const binary = settings => ({ ...settings, styleTrigger: 'maximized', workspaceGestureBlending: false, overviewTransition: false });
const signals = target => [...target.handlers.values()].map(handler => handler.signal).sort();

for (const contentShadows of [false, true]) {
    test(`Shell CSS owns ordinary overview cycles with shadows ${contentShadows}`, async t => {
        const f = await createRendererFixture(t);
        Object.assign(f.settings, binary(f.settings), { contentShadows, windowBehavior: 'apply-style' });
        const extension = f.createExtension();
        extension.enable();
        assert.equal(f.handlers.size, 0, 'CSS overview attaches no lifecycle handlers');
        const updates = f.state.classUpdates;
        const commits = f.state.styleCommits.length;
        for (let i = 0; i < 10; i++) {
            f.showOverview(true);
            f.showOverview(false);
        }
        assert.equal(f.state.classUpdates, updates);
        assert.equal(f.state.styleCommits.length, commits);
        assert.equal(f.state.writes, 1);
        assert.equal(f.state.widgetCreations, 0);
        assert.equal(f.state.timelineCreations ?? 0, 0);
        assert.match(f.state.css, /#panel\.panel-css-overview:overview/);
    });
}

test('binary original-theme overview retains only the required lifecycle callbacks', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure({ ...binary(f.config), overviewBehavior: 'keep-theme' });
    assert.deepEqual(signals(f.overview), ['hiding', 'showing']);
    assert.equal(f.adjustment.handlers.size, 0);
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    f.overview.emit('showing');
    assert.equal(f.overviewStates.length, 1);
});

test('binary Do nothing observes no overview lifecycle or progress', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure({ ...binary(f.config), overviewBehavior: 'do-nothing' });
    assert.deepEqual(signals(f.overview), []);
    assert.equal(f.adjustment.handlers.size, 0);
    assert.equal(f.swipeTracker.handlers.size, 0);
});

test('switching a shown progressive overview to CSS removes obsolete observers immediately', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure(f.config);
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    f.overview.emit('showing');
    events.configure(binary(f.config));
    assert.equal(f.overview.handlers.size, 0);
    assert.equal(f.adjustment.handlers.size, 0);
    assert.equal(f.swipeTracker.handlers.size, 0);
    f.overview.visible = false;
    f.overview.visibleTarget = false;
    const snapshot = events.configure(binary(f.config));
    assert.equal(snapshot.overview.isHidden, true, 'Passive snapshots use current Shell visibility');
});

test('CSS overview to static Do nothing restores the desktop immediately without observers', async t => {
    const f = await createRendererFixture(t);
    Object.assign(f.settings, binary(f.settings));
    const extension = f.createExtension();
    extension.enable();
    assert.equal(f.handlers.size, 0);
    f.showOverview(true);
    f.settings.overviewBehavior = 'do-nothing';
    f.refreshConfiguration();
    assert(f.classes.has('panel-gradient'));
    assert(!f.classes.has('panel-css-overview'));
    assert.equal(f.handlers.size, 0);
    f.showOverview(false);
    assert(f.classes.has('panel-gradient'));
    assert.equal(f.handlers.size, 0);
    assert.equal(f.state.widgetCreations, 0);
});

test('native theme exits resume later desktop updates without a hidden callback', async t => {
    const f = await createRendererFixture(t);
    Object.assign(f.settings, binary(f.settings), { windowBehavior: 'apply-style', overviewBehavior: 'keep-theme' });
    const extension = f.createExtension();
    extension.enable();
    f.showOverview(true);
    assert(!f.classes.has('panel-gradient'));
    f.showOverview(false);
    assert(f.classes.has('panel-gradient'));
    f.state.strength = 1;
    f.windowEvents.updateState();
    assert(f.classes.has('panel-maximized-gradient'));
    assert.deepEqual([...f.handlers.values()].map(handler => handler.signal).sort(), ['hiding', 'showing']);
});

test('custom to CSS while shown preserves the desktop class for later pseudo removal', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    const config = { ...binary(f.settings), windowBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true };
    renderer.configure(config, {
        window: { effectStrength: 0.4 }, workspaceTransition: null,
        overview: { progress: null, isHidden: true, isTargetVisible: false }
    });
    const shown = { progress: null, isHidden: false, isTargetVisible: true };
    f.setOverviewState(shown);
    renderer.updateOverview({ ...shown, effectStrength: 0.4 });
    renderer.configure(binary(config), { window: { effectStrength: 1 }, workspaceTransition: null, overview: shown });
    assert.equal(f.children.size, 0);
    assert(f.classes.has('panel-css-overview'));
    assert(f.classes.has('panel-maximized-gradient'), 'Desktop endpoint survives custom layer teardown');
    assert(!f.classes.has('panel-overview-gradient'));
    f.showOverview(false);
    assert(f.classes.has('panel-maximized-gradient'));
});

test('failed extension CSS handoff restores previous progressive observers', async t => {
    const f = await createRendererFixture(t);
    Object.assign(f.settings, {
        windowBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true,
        overviewTransition: true, workspaceGestureBlending: true
    });
    f.setOverviewProgress(0.4);
    const extension = f.createExtension();
    extension.enable();
    const oldSignals = [...f.handlers.values()].map(handler => handler.signal);
    const load = f.theme.load_stylesheet;
    const oldCss = f.state.css;
    let attempts = 0;
    f.theme.load_stylesheet = file => {
        if (++attempts === 1)
            throw new Error('Theme load failed');
        load(file);
    };
    Object.assign(f.settings, binary(f.settings), { shadowBlur: 8 });
    assert.throws(() => f.refreshConfiguration(), /Theme load failed/);
    assert.equal(f.state.css, oldCss, 'A failed replacement restores usable previous CSS');
    assert.equal(attempts, 2, 'The previous CSS is loaded before returning the failure');
    assert.deepEqual([...f.handlers.values()].map(handler => handler.signal), oldSignals);
    assert(f.hasOverviewProgressHandler(), 'The old custom renderer must keep gesture progress after failure');
    f.theme.load_stylesheet = load;
    f.refreshConfiguration();
    assert.equal(f.handlers.size, 0);
    assert(!f.hasOverviewProgressHandler());
});

test('ordinary binary Do nothing ignores overview entry and continues native desktop updates', async t => {
    const f = await createRendererFixture(t);
    Object.assign(f.settings, binary(f.settings), { windowBehavior: 'apply-style', overviewBehavior: 'do-nothing' });
    const extension = f.createExtension();
    extension.enable();
    f.state.animationsEnabled = true;
    f.state.strength = 1;
    f.windowEvents.updateState();
    f.state.styleCommits.length = 0;
    f.showOverview(true);
    assert.equal(f.state.styleCommits.length, 0, 'Overview entry performs no extension style work');
    assert(!f.classes.has('panel-background-restoring'));
    f.state.strength = 0;
    f.windowEvents.updateState();
    assert(f.classes.has('panel-gradient'));
    f.showOverview(false);
    assert(f.classes.has('panel-gradient'));
    assert.equal(f.state.widgetCreations, 0);
    assert.equal(f.state.timelineCreations ?? 0, 0);
});

test('theme fallback to Do nothing after exit adopts live hidden state', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    events.configure({ ...binary(f.config), overviewBehavior: 'keep-theme' });
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    f.overview.emit('showing');
    f.overview.visibleTarget = false;
    f.overview.emit('hiding');
    f.overview.visible = false;
    f.overview.emit('hidden');
    const snapshot = events.configure({ ...binary(f.config), overviewBehavior: 'do-nothing' });
    assert.equal(snapshot.overview.isHidden, true);
});

for (const overviewBehavior of ['keep-gradient', 'apply-style']) {
    test(`CSS overview ${overviewBehavior} tracks desktop state beneath Shell pseudo and reversals`, async t => {
        const f = await createRendererFixture(t);
        Object.assign(f.settings, binary(f.settings), { windowBehavior: 'keep-theme', overviewBehavior });
        const extension = f.createExtension();
        extension.enable();
        f.showOverview(true);
        f.expectStyle(overviewBehavior === 'keep-gradient' ? 'panel-gradient' : 'panel-overview-gradient');
        f.state.strength = 1;
        f.windowEvents.updateState();
        assert(!f.classes.has('panel-gradient'), 'The desktop class reflects the current theme endpoint');
        const updates = f.state.classUpdates;
        f.windowEvents.updateState();
        assert.equal(f.state.classUpdates, updates, 'Repeated native destinations are deduplicated');
        f.showOverview(false);
        f.expectStyle(null);
        f.showOverview(true);
        f.expectStyle(overviewBehavior === 'keep-gradient' ? 'panel-gradient' : 'panel-overview-gradient');
        f.showOverview(false);
        f.expectStyle(null);
        assert.equal(f.handlers.size, 0);
        assert.equal(f.state.classUpdates, updates, 'Shell reversal changes no extension classes');
        assert.match(f.state.css, /#panel\.panel-css-overview:overview \.panel-button/);
    });
}

test('CSS overview to fractional Do nothing immediately composes the desktop and strips ownership', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    const config = { ...binary(f.settings), windowBehavior: 'apply-style' };
    const hidden = { progress: null, isHidden: true, isTargetVisible: false };
    renderer.configure(config, { window: { effectStrength: 0 }, workspaceTransition: null, overview: hidden });
    const shown = { ...hidden, isHidden: false, isTargetVisible: true };
    f.setOverviewState(shown);
    renderer.configure({ ...config, styleTrigger: 'proximity', proximityTransition: true, overviewBehavior: 'do-nothing' }, {
        window: { effectStrength: 0.4 }, workspaceTransition: null, overview: shown
    });
    assert(f.classes.has('panel-gradient'));
    assert(!f.classes.has('panel-css-overview'));
    renderer.updateOverview({ ...hidden, effectStrength: 0.4 });
    assert.equal(f.children.size, 2);
    for (const actor of f.children)
        assert(!actor.style_class.includes('panel-css-overview'));
    assert.equal([...f.children][1].opacity, 102);
});

test('original-theme overview to Do nothing immediately restores live desktop behavior', async t => {
    const f = await createRendererFixture(t);
    Object.assign(f.settings, binary(f.settings), { windowBehavior: 'apply-style', overviewBehavior: 'keep-theme' });
    const extension = f.createExtension();
    extension.enable();
    f.showOverview(true);
    f.settings.overviewBehavior = 'do-nothing';
    f.refreshConfiguration();
    assert(f.classes.has('panel-gradient'));
    f.setOverviewState({ isHidden: false, isTargetVisible: false });
    for (const { signal, callback } of f.handlers.values()) {
        if (signal === 'hiding')
            callback();
    }
    assert(f.classes.has('panel-gradient'));
    f.state.strength = 1;
    f.windowEvents.updateState();
    assert(f.classes.has('panel-maximized-gradient'), 'Desktop updates apply before overview closes');
    f.showOverview(false);
    assert(f.classes.has('panel-maximized-gradient'));
    assert.equal(f.state.widgetCreations, 0);
});

test('unchanged static Do nothing stays observer-free when configured while shown', async t => {
    const f = await createEventsFixture(t);
    const events = f.createEvents();
    const config = { ...f.config, windowBehavior: 'keep-gradient', overviewBehavior: 'do-nothing' };
    events.configure(config);
    f.overview.visible = true;
    f.overview.visibleTarget = true;
    events.configure(config);
    assert.equal(f.overview.handlers.size, 0);
});

test('stylesheet replacement and restoration failures both remain visible and retryable', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    const snapshot = {
        window: { effectStrength: 0 }, workspaceTransition: null,
        overview: { progress: null, isHidden: true, isTargetVisible: false }
    };
    renderer.configure(binary(f.settings), snapshot);
    const load = f.theme.load_stylesheet;
    f.theme.load_stylesheet = () => { throw new Error('Failed loading CSS'); };
    assert.throws(() => renderer.configure({ ...binary(f.settings), shadowBlur: 9 }, snapshot), error => {
        assert.equal(error.errors?.length, 2);
        assert(error.errors.every(failure => failure.message === 'Failed loading CSS'));
        return true;
    });
    f.theme.load_stylesheet = load;
    renderer.configure(binary(f.settings), snapshot);
    assert(f.classes.has('panel-css-overview'));
});
