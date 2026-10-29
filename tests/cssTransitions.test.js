import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as appearance from '../src/gradient/appearance.js';
import { createRendererFixture } from './fixtures/renderer.js';

const hidden = { progress: null, isHidden: true, isTargetVisible: false };
const visible = { progress: null, isHidden: false, isTargetVisible: true };
const snapshot = (strength = 0, overview = hidden) => ({ window: { effectStrength: strength }, workspaceTransition: null, overview });
const binary = settings => ({ ...settings, windowBehavior: 'apply-style', workspaceGestureBlending: false, overviewTransition: false });
const timings = { WINDOW_ENTER_DURATION_MS: 181, WINDOW_EXIT_DURATION_MS: 197, WORKSPACE_SWITCH_DURATION_MS: 231, OVERVIEW_ENTER_DURATION_MS: 163, OVERVIEW_EXIT_DURATION_MS: 179 };
const duration = f => {
    const name = [...f.classes].find(value => value.startsWith('panel-native-duration-'));
    assert(name, 'Native transition owns a duration class');
    const rule = f.state.css.match(new RegExp(`#panel\\.${name}\\s*\\{([^}]+)\\}`))?.[1];
    return Number(rule?.match(/transition-duration: (\d+)ms/)?.[1]);
};

test('effective input capabilities do not decide unrelated native transitions', async t => {
    const f = await createRendererFixture(t);
    const config = binary(f.settings);
    for (const [edit, isDesktopCompositionExpected, isPassiveOverviewExpected] of [
        [{}, false, true],
        [{ styleTrigger: 'proximity', proximityTransition: true }, true, false],
        [{ styleTrigger: 'proximity', proximityTransition: true, proximityDistance: 0 }, false, true],
        [{ workspaceGestureBlending: true }, true, false],
        [{ overviewTransition: true }, false, false],
        [{ overviewBehavior: 'do-nothing' }, false, false],
        [{ windowBehavior: 'keep-gradient', overviewBehavior: 'do-nothing', workspaceGestureBlending: true, overviewTransition: true, styleTrigger: 'proximity', proximityTransition: true }, false, false],
        [{ gradients: { main: config.gradients.main, alternate: config.gradients.main, overview: config.gradients.main }, workspaceGestureBlending: true, overviewTransition: true, styleTrigger: 'proximity', proximityTransition: true }, false, false]
    ]) {
        assert.equal(appearance.isDesktopCompositionPossible({ ...config, ...edit }), isDesktopCompositionExpected, JSON.stringify(edit));
        assert.equal(appearance.isShellOverviewPassive({ ...config, ...edit }), isPassiveOverviewExpected, JSON.stringify(edit));
    }
});

test('binary class changes own durations without actors, timelines or stylesheet reloads', async t => {
    const f = await createRendererFixture(t, timings);
    const renderer = f.createRenderer();
    renderer.configure({ ...binary(f.settings), overviewBehavior: 'keep-theme' }, snapshot());
    f.state.animationsEnabled = true;
    renderer.updateWindow({ effectStrength: 1 });
    assert.equal(f.children.size, 0);
    assert.equal(f.timelines.size, 0);
    assert(f.classes.has('panel-maximized-gradient'));
    assert.equal(duration(f), 181);
    renderer.updateWindow({ effectStrength: 0 });
    assert.equal(duration(f), 197);
    renderer.updateWindow({ effectStrength: 1 }, true);
    assert.equal(duration(f), 231);
    renderer.updateOverview({ ...visible, effectStrength: 1 });
    assert(![...f.classes].some(name => /gradient$/.test(name)));
    assert.equal(duration(f), 163);
    renderer.updateWindow({ effectStrength: 0 });
    assert(![...f.classes].some(name => /gradient$/.test(name)));
    renderer.updateOverview({ ...hidden, isHidden: false, effectStrength: 0 });
    assert(f.classes.has('panel-gradient'));
    assert.equal(duration(f), 179);
    const classes = [...f.classes];
    renderer.updateOverview({ ...hidden, effectStrength: 0 });
    assert.deepEqual([...f.classes], classes, 'Hidden notification does not restart the exit');
    assert.equal(f.state.writes, 1);
    assert.equal(f.state.loads, 1);
    assert.equal(f.state.timelineCreations ?? 0, 0);
    assert.equal(f.allocations.size, 0);
    assert.equal(f.styleHandlers.size, 0);
});

test('native original theme and reduced motion keep resource-free cleanup and re-enable', async t => {
    const f = await createRendererFixture(t);
    const config = { ...binary(f.settings), windowBehavior: 'keep-theme', overviewBehavior: 'keep-theme' };
    const renderer = f.createRenderer();
    renderer.configure(config, snapshot());
    renderer.updateWindow({ effectStrength: 1 });
    assert(![...f.classes].some(name => /gradient$/.test(name)));
    renderer.updateOverview({ ...visible, effectStrength: 0 });
    assert(![...f.classes].some(name => /gradient$/.test(name)));
    renderer.updateOverview({ ...hidden, effectStrength: 0 });
    assert(f.classes.has('panel-gradient'));
    assert.equal(f.children.size, 0);
    assert.equal(f.timelines.size, 0);
    renderer.destroy();
    assert.equal(f.classes.size, 0);
    renderer.configure(config, snapshot(1));
    assert(![...f.classes].some(name => /gradient$/.test(name)));
});

test('native to Do nothing immediately restores normal desktop updates', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    const config = binary(f.settings);
    renderer.configure(config, snapshot());
    f.state.animationsEnabled = true;
    f.setOverviewState(visible);
    renderer.configure({ ...config, overviewBehavior: 'do-nothing' }, snapshot(0, visible));
    assert(f.classes.has('panel-gradient'));
    assert.equal(f.children.size, 0);
    renderer.updateWindow({ effectStrength: 1 });
    assert(f.classes.has('panel-maximized-gradient'));
    renderer.updateOverview({ ...hidden, effectStrength: 1 });
    assert(f.classes.has('panel-maximized-gradient'));
});

test('Do nothing releases an obsolete desktop mixture immediately when settings select a native style', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    const config = { ...binary(f.settings), styleTrigger: 'proximity', proximityTransition: true, overviewBehavior: 'do-nothing' };
    renderer.configure(config, snapshot(0.4));
    renderer.updateOverview({ ...visible, effectStrength: 0.4 });
    renderer.configure({ ...config, windowBehavior: 'keep-gradient' }, snapshot(0.4, visible));
    assert.equal(f.children.size, 0);
    assert(f.classes.has('panel-gradient'));
    renderer.updateOverview({ ...hidden, effectStrength: 0 });
    assert.equal(f.children.size, 0);
    assert(f.classes.has('panel-gradient'));
    assert([...f.classes].some(name => name.startsWith('panel-native-duration-')));
});


test('redundant native targets do not change classes, while third targets use current inputs', async t => {
    const f = await createRendererFixture(t, timings);
    const renderer = f.createRenderer();
    const config = { ...binary(f.settings), overviewBehavior: 'keep-theme' };
    renderer.configure(config, snapshot());
    for (const strength of [1, 0, 1])
        renderer.updateWindow({ effectStrength: strength });
    renderer.updateOverview({ ...visible, effectStrength: 1 });
    const updates = f.state.classUpdates;
    renderer.updateOverview({ ...visible, effectStrength: 1 });
    renderer.updateWindow({ effectStrength: 0 });
    renderer.configure(config, snapshot(0, visible));
    assert.equal(f.state.classUpdates, updates);
    renderer.updateOverview({ ...hidden, isHidden: false, effectStrength: 0 });
    assert.equal(duration(f), 179);
    const exitUpdates = f.state.classUpdates;
    renderer.updateWindow({ effectStrength: 1 });
    assert.equal(f.state.classUpdates, exitUpdates + 1, 'Native desktop resumes immediately when overview targets hidden');
    renderer.updateOverview({ ...hidden, effectStrength: 1 });
    assert(f.classes.has('panel-maximized-gradient'));
    assert.equal(f.state.widgetCreations, 0);
    assert.equal(f.state.timelineCreations ?? 0, 0);
});

test('native handoff settles the old destination under a guard before installing code layers', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    const config = { ...binary(f.settings), overviewBehavior: 'keep-theme' };
    renderer.configure(config, snapshot());
    renderer.updateWindow({ effectStrength: 1 });
    f.state.styleCommits.length = 0;
    renderer.configure({ ...config, styleTrigger: 'proximity', proximityTransition: true }, snapshot(0.4));
    assert(f.state.styleCommits[0].includes('panel-background-restoring'));
    assert(f.state.styleCommits[0].includes('panel-maximized-gradient'));
    assert.equal(f.children.size, 2);
    assert.equal([...f.children][1].opacity, 102);
    assert.equal(f.timelines.size, 0, 'Mode changes settle instead of double animating');
    for (const actor of f.children)
        assert(!actor.style_class.includes('panel-native-duration-'), 'Code snapshots exclude native duration classes');
    assert(!f.classes.has('panel-background-restoring'));
    assert(![...f.classes].some(name => name.startsWith('panel-native-duration-')));
    for (const actor of f.children) {
        const destroy = actor.destroy.bind(actor);
        actor.destroy = () => {
            assert(f.classes.has('panel-maximized-gradient'), 'Destination is installed before removing covering layers');
            assert(f.classes.has('panel-native-duration-0'));
            destroy();
        };
    }
    renderer.configure(config, snapshot(1));
    assert.equal(f.children.size, 0);
    assert.equal(f.timelines.size, 0);
});

test('a failed stylesheet reload during a mode change leaves the old renderer retryable', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    const config = binary(f.settings);
    renderer.configure(config, snapshot());
    const load = f.theme.load_stylesheet;
    f.theme.load_stylesheet = () => { throw new Error('Theme load failed'); };
    const changed = { ...config, styleTrigger: 'proximity', proximityTransition: true, shadowBlur: 8 };
    assert.throws(() => renderer.configure(changed, snapshot(0.4)), /Theme load failed/);
    assert(!f.classes.has('panel-background-restoring'), 'Failure releases the temporary guard');
    f.theme.load_stylesheet = load;
    renderer.configure(changed, snapshot(0.4));
    assert.equal(f.children.size, 2);
    assert.equal([...f.children][1].opacity, 102);
});


test('static native Do nothing restores the desktop while overview remains visible', async t => {
    const f = await createRendererFixture(t);
    const renderer = f.createRenderer();
    const config = { ...binary(f.settings), windowBehavior: 'keep-gradient' };
    renderer.configure(config, snapshot());
    f.setOverviewState(visible);
    f.state.styleCommits.length = 0;
    renderer.configure({ ...config, overviewBehavior: 'do-nothing' }, snapshot(0, visible));
    assert(f.state.styleCommits[0]?.includes('panel-background-restoring'), 'Reconfiguration settles the previous native destination');
    assert(f.classes.has('panel-gradient'));
    renderer.updateOverview({ ...hidden, isHidden: false, effectStrength: 0 });
    assert(f.classes.has('panel-gradient'));
    renderer.updateOverview({ ...hidden, effectStrength: 0 });
    assert(f.classes.has('panel-gradient'));
    assert.equal(f.state.widgetCreations, 0);
    assert.equal(f.state.timelineCreations ?? 0, 0);
});


test('static native Do nothing removes all overview observers and preserves unrelated panel classes', async t => {
    const f = await createRendererFixture(t);
    f.panel.add_style_class_name('other-extension');
    t.after(() => f.panel.remove_style_class_name('other-extension'));
    const extension = f.createExtension();
    extension.enable();
    f.showOverview(true);
    f.settings.overviewBehavior = 'do-nothing';
    f.refreshConfiguration();
    assert(f.classes.has('panel-gradient'));
    assert.equal(f.handlers.size, 0);
    f.showOverview(false);
    assert(f.classes.has('panel-gradient'));
    assert.equal(f.handlers.size, 0);
    extension.disable();
    assert.deepEqual([...f.classes], ['other-extension']);
    f.panel.remove_style_class_name('other-extension');
});
