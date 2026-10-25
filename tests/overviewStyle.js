// Run with: node --experimental-vm-modules --test tests/overviewStyle.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRendererFixture } from './fixtures/renderer.js';

const overviewUpdate = renderer => (progress, target = true, hidden = false, strength = 0) =>
    renderer.updateOverview({ progress, target, hidden }, strength);

test('renderer fixtures isolate settings, actors, timelines and stylesheet caches', async t => {
    const fixture = await createRendererFixture(t);
    const otherFixture = await createRendererFixture(t);
    const renderer = fixture.createRenderer();
    const otherRenderer = otherFixture.createRenderer();
    renderer.configure(fixture.settings);
    otherRenderer.configure(otherFixture.settings);
    assert.equal(fixture.state.writes, 1);
    assert.equal(otherFixture.state.writes, 1, 'Each module graph owns its stylesheet cache');
    assert.notEqual(fixture.settings.colors, otherFixture.settings.colors);
    fixture.settings.colors.start = 'rgba(255,255,0,1)';
    assert.equal(otherFixture.settings.colors.start, 'rgba(0,0,0,1)');
    fixture.state.animationsEnabled = true;
    Object.assign(fixture.settings, { maximizedBehavior: 'apply-style' });
    renderer.configure(fixture.settings);
    renderer.updateWindow({ effectStrength: 1 });
    assert.equal(fixture.timelines.size, 1);
    assert.equal(otherFixture.timelines.size, 0);
    assert.equal(fixture.children.size, 2);
    assert.equal(otherFixture.children.size, 0);
    assert.equal(fixture.allocations.size, 1);
    assert.equal(otherFixture.allocations.size, 0);
    const before = otherFixture.state.writes;
    renderer.configure({ ...fixture.settings, shadowBlur: 9 });
    assert.equal(otherFixture.state.writes, before);
    assert.equal(otherFixture.settings.shadowBlur, 3);
    renderer.destroy();
    assert.equal(otherFixture.classes.has('panel-gradient'), true, 'Destroying one fixture cannot clear another panel');
    otherRenderer.configure(otherFixture.settings);
    assert.equal(otherFixture.state.writes, before, 'Destroying another fixture cannot invalidate this stylesheet cache');
});

test('overview styling works without window tracking and includes content shadows', async t => {
    const fixture = await createRendererFixture(t);
    const { state, expectStyle, showOverview } = fixture;
    const extension = fixture.createExtension();
    extension.enable();
    expectStyle('panel-gradient');
    showOverview(true);
    expectStyle('panel-overview-gradient');
    assert.equal(fixture.windowEvents.enabled, false, 'Overview must work without window tracking');
    assert.match(state.css, /panel-overview-gradient/);
    assert.match(state.css, /background-gradient-start: rgba\(0,255,0,0.4\)/);
    assert.match(state.css, /#panel\.panel-overview-gradient \.panel-button/);
});

for (const behavior of ['keep-gradient', 'keep-theme', 'apply-style']) {
    for (const windowBehavior of ['keep-gradient', 'keep-theme', 'apply-style']) {
        test(`overview ${behavior} overrides window ${windowBehavior}`, async t => {
            const fixture = await createRendererFixture(t);
            const { settings, state, children, expectStyle, showOverview } = fixture;
            const extension = fixture.createExtension();
            extension.enable();
            showOverview(true);
            settings.overviewBehavior = behavior;
            settings.maximizedBehavior = windowBehavior;
            state.strength = 1;
            extension.configure(settings);
            const expected = { 'keep-gradient': 'panel-gradient', 'keep-theme': null, 'apply-style': 'panel-overview-gradient' }[behavior];
            expectStyle(expected);
            fixture.windowEvents.callback({ effectStrength: 1, workspaceTransition: 'progress', startEffectStrength: 0, endEffectStrength: 1, transitionProgress: 0.5 });
            fixture.windowEvents.callback({ effectStrength: 1, workspaceTransition: 'complete' });
            expectStyle(expected);
            assert.equal(children.size, 0, 'Window transitions cannot cover overview');
            showOverview(false);
            expectStyle({ 'keep-gradient': 'panel-gradient', 'keep-theme': null, 'apply-style': 'panel-maximized-gradient' }[windowBehavior]);
            assert.equal(children.size, 0, 'Reduced-motion exit commits the destination without temporary actors');
            showOverview(true);
            expectStyle(expected);
            assert.equal(children.size, 0, 'Entering overview removes the old transition overlay');
        });
    }
}

test('overview exit refreshes proximity and disable/re-enable releases observers', async t => {
    const fixture = await createRendererFixture(t);
    const { settings, state, children, handlers, expectStyle, showOverview } = fixture;
    Object.assign(settings, { maximizedBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true });
    const extension = fixture.createExtension();
    extension.enable();
    showOverview(true);
    settings.styleTrigger = 'proximity';
    settings.proximityTransition = true;
    settings.overviewBehavior = 'apply-style';
    extension.configure(settings);
    state.strength = 0.25;
    showOverview(false);
    assert.equal([...children][1].opacity, 64, 'Exit recalculates partial proximity on the destination workspace');
    showOverview(true);
    extension.disable();
    expectStyle(null);
    assert.equal(children.size, 0);
    assert.equal(handlers.size, 0, 'Disable disconnects overview signals');
    extension.enable();
    expectStyle('panel-overview-gradient');
    assert.equal(handlers.size, 4, 'Re-enable while open installs one set of overview handlers');
    extension.disable();
});

test('configuration preserves gesture actors and settles disabled gesture blending', async t => {
    const fixture = await createRendererFixture(t);
    const { settings, state, children, timelines, handlers, expectStyle, showOverview } = fixture;
    Object.assign(settings, { styleTrigger: 'proximity', proximityTransition: true, overviewTransition: true });
    fixture.setOverviewProgress(0.4);
    showOverview(true);
    const extension = fixture.createExtension();
    extension.enable();
    showOverview(true);
    assert.equal(children.size, 2, 'Extension forwards gesture progress');
    const configuredLayers = [...children];
    const previousWrites = state.writes;
    const previousLoads = state.loads;
    extension.configure(settings);
    assert([...children].every((actor, index) => actor === configuredLayers[index]), 'No-op configuration retains gesture actors');
    assert.equal(state.writes, previousWrites, 'Identical CSS is not written');
    assert.equal(state.loads, previousLoads, 'Identical CSS is not reloaded');
    settings.shadowBlur++;
    extension.configure(settings);
    assert([...children].every((actor, index) => actor === configuredLayers[index]), 'Shadow changes retain gesture actors');
    assert.equal([...children][1].opacity, 102, 'Shadow changes retain gesture progress');
    settings.maximizedBehavior = 'apply-style';
    state.strength = 0.6;
    extension.configure(settings);
    assert.equal([...children][1].opacity, 102, 'Mixed behavior and appearance changes retain overview progress');
    assert.equal([...children][0].get_children()[1].opacity, 153, 'The same update refreshes the desktop destination');
    fixture.setOverviewProgress(0.2);
    state.animationsEnabled = true;
    settings.overviewTransition = false;
    extension.configure(settings);
    const settling = [...timelines][0];
    assert(settling, 'Disabling gesture blending settles using an animation');
    assert.equal([...children][1].opacity, 51, 'Settling starts at the current gesture progress');
    settings.shadowBlur++;
    extension.configure(settings);
    assert(timelines.has(settling), 'Cosmetic updates retain a settling overview animation');
    settling.advance(0.5);
    assert.equal([...children][1].opacity, 153);
    settling.advance(1);
    expectStyle('panel-overview-gradient');
    assert.equal(children.size, 0, 'Settling commits the destination and removes temporary actors');
    state.animationsEnabled = false;
    settings.overviewTransition = true;
    extension.disable();
    assert.equal(children.size, 0, 'Disable cleans up an active overview gesture');
    assert.equal(handlers.size, 0);
    expectStyle(null);
    extension.enable();
    extension.disable();
    assert.equal(children.size, 0, 'Re-enable starts with fresh overview state');
});

test('background snapshots preserve custom panel classes, pseudo-classes and inline style', async t => {
    const fixture = await createRendererFixture(t);
    const { panel } = fixture;
    panel.get_style_class_name = () => 'custom-panel panel-gradient panel-background-blending';
    panel.get_style_pseudo_class = () => 'overview custom-state';
    panel.get_style = () => 'background-color: red';
    const themeBackground = fixture.createPanelBackground({ gradientClass: null, inOverview: true });
    assert.equal(themeBackground.name, 'panel');
    assert.equal(themeBackground.style_class, 'custom-panel');
    assert.equal(themeBackground.pseudo_class, 'custom-state overview');
    assert.match(themeBackground.style, /background-color: red; transition-duration: 0ms;/);
    const desktopBackground = fixture.createPanelBackground({ gradientClass: 'panel-gradient' });
    assert.equal(desktopBackground.style_class, 'custom-panel panel-gradient');
    assert.equal(desktopBackground.pseudo_class, 'custom-state');
    themeBackground.destroy();
    desktopBackground.destroy();
});

test('overview gestures reuse endpoints, retrace reversal and clean up cancellation', async t => {
    const fixture = await createRendererFixture(t);
    const { settings, children, allocations, expectStyle } = fixture;
    Object.assign(settings, { maximizedBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true, overviewTransition: true });
    const renderer = fixture.createRenderer();
    renderer.configure(settings);
    const update = overviewUpdate(renderer);
    update(0, false, true);
    update(0.25);
    assert.equal(children.size, 2, 'A gesture owns two root backgrounds');
    assert.equal(allocations.size, 1, 'A gesture owns one allocation handler');
    const originalLayers = [...children];
    const originalOpacities = originalLayers.map(actor => actor.opacity);
    update(0.75);
    assert.deepEqual([...children], originalLayers, 'Progress reuses the same actors');
    update(0.25, false);
    assert.deepEqual([...children], originalLayers, 'Reversal reuses the original endpoints');
    assert.deepEqual(originalLayers.map(actor => actor.opacity), originalOpacities, 'Reversal retraces the same blend');
    // Mean destination alpha is 0.7. Assert correction independently of the production helper.
    assert.equal(originalLayers[0].opacity, Math.round(0.75 / (1 - 0.25 * 0.7) * 255));
    assert.equal(originalLayers[1].opacity, 64);
    update(0, false, true);
    assert.equal(children.size, 0, 'Cancellation removes temporary actors');
    assert.equal(allocations.size, 0, 'Cancellation removes allocation handlers');
    expectStyle('panel-gradient');
});

test('overview exit refreshes endpoints and reduced motion commits the destination', async t => {
    const fixture = await createRendererFixture(t);
    const { settings, children, classes, allocations, expectStyle } = fixture;
    Object.assign(settings, { maximizedBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true, overviewTransition: true });
    const renderer = fixture.createRenderer();
    renderer.configure(settings);
    const update = overviewUpdate(renderer);
    update(1);
    const completedLayers = [...children];
    update(0.5, false, false, 1);
    assert.equal(children.size, 2);
    assert.notEqual([...children][0], completedLayers[0], 'Exit replaces the stale desktop endpoint');
    assert.match([...children][0].get_style_class_name(), /panel-maximized-gradient/,
        'Exit resolves the endpoint for the current desktop');
    renderer.configure({ ...settings, overviewBehavior: 'keep-theme' });
    assert.equal(children.size, 2, 'Endpoint changes preserve an active gesture');
    assert.equal([...children][1].opacity, 128, 'Endpoint changes preserve gesture progress');
    assert.equal(allocations.size, 1);
    assert(!classes.has('panel-overview-gradient'), 'Endpoint changes update the panel content styling too');
    update(0.5);
    assert.equal([...children][0].opacity, Math.round(0.5 / (1 - 0.5 * 0.6) * 255), 'Native theme alpha participates in correction');
    renderer.configure({ ...settings, overviewBehavior: 'keep-theme', overviewTransition: false });
    assert.equal(children.size, 0, 'Reduced motion commits a disabled gesture blend immediately');
    expectStyle(null);
    renderer.destroy();
    renderer.destroy();
    assert.equal(children.size, 0, 'Repeated cleanup is safe');
    expectStyle(null);
});

test('overview captures partial proximity and refreshes nested alpha and allocation', async t => {
    const fixture = await createRendererFixture(t);
    const { settings, panel, children, allocations } = fixture;
    Object.assign(settings, { maximizedBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true, overviewTransition: true });
    const renderer = fixture.createRenderer();
    const update = overviewUpdate(renderer);
    renderer.configure({ ...settings, maximizedBehavior: 'apply-style' });
    update(0, false, true);
    renderer.updateWindow({ effectStrength: 0.4 });
    const partialDesktop = [...children];
    assert.equal(partialDesktop[1].opacity, 102);
    update(0.5);
    assert.ok(partialDesktop.every(actor => !children.has(actor)), 'Overview replaces the desktop actors');
    const source = [...children][0];
    assert.equal(source.get_children()[1].opacity, 102, 'Overview preserves the partial desktop composition');
    const nestedLayers = source.get_children();
    renderer.configure({
        ...settings, maximizedBehavior: 'apply-style',
        maximizedColors: { start: 'rgba(255,0,0,0.5)', end: 'rgba(0,0,255,0.5)' }
    });
    assert.equal([...children][0], source, 'Alpha changes retain a composed source actor');
    assert.equal(nestedLayers[0].opacity, Math.round(0.6 / (1 - 0.4 * 0.5) * 255),
        'Alpha changes refresh opacity correction inside the captured desktop blend');
    assert.equal(nestedLayers[1].opacity, 102);
    const oldWidth = panel.width;
    panel.width = 1280;
    allocations.get(source).callback();
    assert.equal(source.get_children()[1].box.x2, 1280, 'Nested backgrounds follow panel allocation');
    panel.width = oldWidth;
    update(0, false, true, 0.4);
    assert.equal([...children][1].opacity, 102, 'Cancellation restores the partial desktop appearance');
    renderer.destroy();
    assert.equal(allocations.size, 0);
});

test('paused captures refresh native theme alpha without traversing on gesture frames', async t => {
    const fixture = await createRendererFixture(t);
    const { settings, state, children, styleHandlers } = fixture;
    Object.assign(settings, { maximizedBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true, overviewTransition: true });
    const renderer = fixture.createRenderer();
    const update = overviewUpdate(renderer);
    renderer.configure({ ...settings, maximizedBehavior: 'keep-theme' });
    renderer.updateWindow({ effectStrength: 0.4 });
    update(0.5);
    const pausedActors = [...children];
    const [capturedMain, capturedTheme] = pausedActors[0].get_children();
    const capturedReads = capturedTheme.themeReads;
    update(0.6);
    update(0.5);
    assert.equal(capturedTheme.themeReads, capturedReads, 'Gesture frames do not traverse the captured desktop blend');
    state.nativeAlpha = 51;
    assert(styleHandlers.has(capturedTheme), 'Captured backgrounds observe native theme changes');
    styleHandlers.get(capturedTheme).callback();
    assert.equal(capturedMain.opacity, Math.round(0.6 / (1 - 0.4 * 0.2) * 255),
        'A paused captured blend refreshes when native theme alpha changes');
    assert.equal(pausedActors[1].opacity, 128, 'Theme refresh leaves overview progress unchanged');
    assert([...children].every((actor, index) => actor === pausedActors[index]), 'Theme refresh retains background actors');
    renderer.destroy();
    assert.equal(styleHandlers.size, 0, 'Destroy releases background style listeners');
});

test('workspace swipes apply directly and overview interruption restores current windows', async t => {
    const fixture = await createRendererFixture(t);
    const { settings, state, children, timelines, expectStyle } = fixture;
    Object.assign(settings, { maximizedBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true, overviewTransition: true });
    const renderer = fixture.createRenderer();
    const update = overviewUpdate(renderer);
    renderer.configure({ ...settings, maximizedBehavior: 'apply-style' });
    const swipeState = {
        effectStrength: 0, workspaceTransition: 'progress',
        startEffectStrength: 0, endEffectStrength: 1, transitionProgress: 0.25
    };
    state.animationsEnabled = true;
    renderer.updateWindow(swipeState);
    assert.equal([...children][1].opacity, 64);
    assert.equal(timelines.size, 0, 'Workspace progress is applied directly without a timed animation');
    const swipeLayers = [...children];
    renderer.configure({ ...settings, maximizedBehavior: 'apply-style', shadowBlur: 8 });
    assert([...children].every((actor, index) => actor === swipeLayers[index]), 'Workspace settings updates retain actors');
    assert.equal([...children][1].opacity, 64, 'Workspace settings updates retain the gesture position');
    update(0, false, true);
    expectStyle('panel-gradient');
    assert.equal(children.size, 0, 'Restoration uses current window strength rather than workspace gesture progress');
    renderer.updateWindow(swipeState);
    update(0.5, true, false, 1);
    update(0, false, true, 1);
    expectStyle('panel-maximized-gradient');
    assert.equal(children.size, 0, 'Overview exit cannot restore an interrupted workspace gesture');
    renderer.destroy();
});

test('initial overview state and repeated targets retain progress and restore latest strength', async t => {
    const fixture = await createRendererFixture(t);
    const { settings, state, children, timelines } = fixture;
    Object.assign(settings, { maximizedBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true, overviewTransition: true });
    state.animationsEnabled = true;
    const renderer = fixture.createRenderer();
    const update = overviewUpdate(renderer);
    renderer.configure({ ...settings, maximizedBehavior: 'apply-style' }, {
        window: { effectStrength: 0.4 }, overview: { progress: 0.25, hidden: false, target: true }
    });
    const initialOverviewLayers = [...children];
    assert.equal(initialOverviewLayers[0].get_children()[1].opacity, 102,
        'Starting in overview captures the supplied desktop strength');
    update(null, true, false, 0.4);
    const overviewSettling = [...timelines][0];
    overviewSettling.advance(0.5);
    update(null, true, false, 0.4);
    assert(timelines.has(overviewSettling), 'Repeated overview targets retain the settling timeline');
    assert.deepEqual([...children], initialOverviewLayers, 'Repeated targets retain the overview actors');
    assert.equal(initialOverviewLayers[1].opacity, 159, 'Repeated targets preserve visual progress');
    update(null, false, false, 0.4);
    assert(!timelines.has(overviewSettling), 'Reversing the overview target replaces the settling timeline');
    const overviewExit = [...timelines][0];
    renderer.updateWindow({ effectStrength: 0.75 });
    update(null, false, false, 0.75);
    assert(timelines.has(overviewExit), 'Repeated exit targets retain the settling timeline');
    overviewExit.advance(1);
    assert.equal([...children][1].opacity, 191, 'Settling restores the latest window strength');
    update(null, false, true, 0.75);
    assert.equal([...children][1].opacity, 191, 'The hidden notification preserves the restored appearance');
    renderer.destroy();
});

test('timed desktop transitions retain actors, retarget and stop on destroy', async t => {
    const fixture = await createRendererFixture(t);
    const { settings, state, children, timelines, allocations, expectStyle } = fixture;
    Object.assign(settings, { maximizedBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true, overviewTransition: true });
    state.animationsEnabled = true;
    const renderer = fixture.createRenderer();
    const update = overviewUpdate(renderer);
    renderer.configure({ ...settings, maximizedBehavior: 'apply-style' });
    update(0, false, true);
    renderer.updateWindow({ effectStrength: 1 });
    assert.equal(timelines.size, 1, 'Window changes start a timed transition');
    const interrupted = [...timelines][0];
    interrupted.advance(0.5);
    const animatedLayers = [...children];
    renderer.configure({ ...settings, maximizedBehavior: 'apply-style', shadowBlur: 9 });
    assert([...children].every((actor, index) => actor === animatedLayers[index]), 'Appearance changes retain animated actors');
    assert(timelines.has(interrupted), 'Appearance changes retain the running timeline');
    assert.equal([...children][1].opacity, 128, 'Appearance changes preserve timed progress');
    renderer.configure({ ...settings, maximizedBehavior: 'apply-style', proximityDistance: 80 }, {
        window: { effectStrength: 0.25 }, overview: { progress: 0, hidden: true, target: false }
    });
    assert(!timelines.has(interrupted), 'A changed destination retargets the previous animation');
    assert.equal([...children][1].opacity, 128, 'Retargeting starts at the current visual progress');
    const retargeted = [...timelines][0];
    retargeted.advance(0.5);
    assert.equal([...children][1].opacity, 96, 'Retargeting moves from current progress toward the new strength');
    renderer.updateWindow({ effectStrength: 0 });
    assert(!timelines.has(retargeted), 'A new destination stops the previous animation');
    [...timelines][0].advance(1);
    expectStyle('panel-gradient');
    assert.equal(children.size, 0, 'Completed animations remove endpoint actors');
    renderer.updateWindow({ effectStrength: 1 });
    renderer.destroy();
    assert.equal(timelines.size, 0, 'Disable stops an unfinished animation');
    assert.equal(allocations.size, 0);
    assert.equal(children.size, 0);
    expectStyle(null);
});

test('inactive distance edits preserve a captured desktop animation', async t => {
    const fixture = await createRendererFixture(t);
    const { settings, state, children, timelines } = fixture;
    Object.assign(settings, { maximizedBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true, overviewTransition: true });
    state.animationsEnabled = true;
    const renderer = fixture.createRenderer();
    const update = overviewUpdate(renderer);
    renderer.configure({ ...settings, maximizedBehavior: 'apply-style', styleTrigger: 'maximized' });
    renderer.updateWindow({ effectStrength: 1 });
    [...timelines][0].advance(0.5);
    update(0.4, true, false, 1);
    const capturedSource = [...children][0];
    const beforeInactiveEdit = state.writes;
    renderer.configure({ ...settings, maximizedBehavior: 'apply-style', styleTrigger: 'maximized', proximityDistance: 123 });
    assert.equal([...children][0], capturedSource, 'An inactive distance setting does not replace a captured desktop blend');
    assert.equal(state.writes, beforeInactiveEdit, 'Behavior changes with identical CSS do not reload it');
    renderer.destroy();
});

test('composed blends retain equivalent endpoints and release replaced actors and listeners', async t => {
    const fixture = await createRendererFixture(t);
    const { settings, state, children, timelines, allocations, styleHandlers } = fixture;
    Object.assign(settings, { maximizedBehavior: 'apply-style', styleTrigger: 'proximity', proximityTransition: true, overviewTransition: true });
    state.animationsEnabled = true;
    const renderer = fixture.createRenderer();
    renderer.configure(settings);
    const mainStyle = { gradientClass: 'panel-gradient' };
    const alternateStyle = { gradientClass: 'panel-maximized-gradient' };
    const overviewStyle = { gradientClass: 'panel-overview-gradient', inOverview: true };
    const capturedStyle = { source: mainStyle, target: alternateStyle, progress: 0.4 };
    const blend = fixture.createBlend(capturedStyle, overviewStyle);
    blend.setProgress(0.4);
    assert.deepEqual({ ...blend.getStyle() }, { source: capturedStyle, target: overviewStyle, progress: 0.4 },
        'Snapshots contain endpoint descriptions and progress, without derived opacities');
    const blendActors = [...children];
    blend.updateStyles({
        progress: 0.4,
        target: { inOverview: false, gradientClass: 'panel-maximized-gradient' },
        source: { inOverview: false, gradientClass: 'panel-gradient' }
    }, { inOverview: true, gradientClass: 'panel-overview-gradient' });
    assert([...children].every((actor, index) => actor === blendActors[index]),
        'Equivalent nested styles retain actors regardless of property order or omitted false flags');
    blend.updateStyles({ ...capturedStyle, progress: 0 }, overviewStyle);
    assert.deepEqual([...children][0].get_children().map(actor => actor.opacity), [255, 0],
        'A zero-progress composition still creates both endpoints and displays only its source');
    blend.updateStyles(capturedStyle, overviewStyle);
    assert.equal([...children][0].get_children()[1].opacity, 102, 'Restoring captured progress restores the nested blend');
    const restoredSource = [...children][0];
    blend.updateStyles(capturedStyle, { gradientClass: null });
    assert.equal([...children][0], restoredSource, 'Replacing the target retains the source');
    assert.notEqual([...children][1], blendActors[1]);
    assert(!styleHandlers.has(blendActors[1]), 'Replacing a target releases its style listener');
    const retainedTarget = [...children][1];
    const retiredSource = [...children][0];
    const retiredLeaves = retiredSource.get_children();
    blend.updateStyles(mainStyle, { gradientClass: null });
    const replacementSource = [...children][0];
    assert.equal([...children][1], retainedTarget, 'Replacing the source retains the target');
    assert(!allocations.has(retiredSource), 'Replacing a source disconnects its allocation handler');
    assert(allocations.has(replacementSource), 'The new source owns the allocation handler');
    assert(retiredLeaves.every(actor => !styleHandlers.has(actor)), 'Replacing a source releases all nested style listeners');
    let completions = 0;
    const complete = () => completions++;
    blend.animateTo(1, complete);
    const retainedTimeline = [...timelines][0];
    retainedTimeline.advance(0.5);
    const currentProgress = blend.progress;
    assert.equal(blend.getStyle().progress, currentProgress, 'Snapshots capture the current position of a timed transition');
    assert.notEqual(currentProgress, 1);
    state.nativeAlpha = 51;
    styleHandlers.get(retainedTarget).callback();
    assert.equal(blend.progress, currentProgress, 'Theme refresh preserves timed progress');
    assert(timelines.has(retainedTimeline), 'Theme refresh retains the running animation');
    blend.animateTo(1, complete);
    assert(timelines.has(retainedTimeline), 'Repeated destination requests retain the running animation');
    retainedTimeline.advance(1);
    assert.equal(completions, 1, 'An unchanged destination completes exactly once');
    blend.destroy();
    blend.destroy();
    assert.equal(styleHandlers.size, 0);
    assert.equal(allocations.size, 0);
    assert.equal(children.size, 0);
    renderer.destroy();
});

test('failed stylesheet loads remain retryable on identical configuration', async t => {
    const fixture = await createRendererFixture(t);
    const { settings, state, theme } = fixture;
    const renderer = fixture.createRenderer();
    const loadStylesheet = theme.load_stylesheet;
    theme.load_stylesheet = () => { throw new Error('Theme load failed'); };
    assert.throws(() => renderer.configure(settings), /Theme load failed/);
    const failedWrites = state.writes;
    theme.load_stylesheet = loadStylesheet;
    renderer.configure(settings);
    assert.equal(state.writes, failedWrites + 1, 'A failed load is retried on identical configuration');
    renderer.destroy();
});

for (const [a, b] of [[1, 1], [0.1, 0.6], [0, 0], [1, 0]]) {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        test(`uniform-alpha compositing at progress ${p}, source ${a}, destination ${b}`, async t => {
            const { calculateBackgroundBlend } = await createRendererFixture(t);
            const { sourceOpacity: s, destinationOpacity: d } = calculateBackgroundBlend(p, b, b);
            assert(Math.abs(d * b + s * a * (1 - d * b) - ((1 - p) * a + p * b)) < 1e-12,
                `Uniform-alpha compositing at progress ${p}, source ${a}, destination ${b}`);
        });
    }
}
for (const invalid of [NaN, Infinity, -0.1, 1.1]) {
    for (const [index, args] of [[invalid, 0, 1], [0.5, invalid, 1], [0.5, 0, invalid]].entries()) {
        test(`blend rejects ${invalid} at argument ${index}`, async t => {
            const { calculateBackgroundBlend } = await createRendererFixture(t);
            assert.throws(() => calculateBackgroundBlend(...args), { name: 'RangeError' });
        });
    }
}
