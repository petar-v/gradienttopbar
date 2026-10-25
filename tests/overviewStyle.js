// Run with: node --experimental-vm-modules tests/overviewStyle.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const handlers = new Map();
let nextId = 0;
const overview = {
    visibleTarget: false,
    connect(signal, callback) { handlers.set(++nextId, { signal, callback }); return nextId; },
    disconnect(id) { handlers.delete(id); }
};
const showOverview = visible => {
    overview.visible = visible;
    overview.visibleTarget = visible;
    for (const event of visible ? ['showing', 'shown'] : ['hiding', 'hidden']) {
        for (const { signal, callback } of handlers.values()) {
            if (signal === event)
                callback();
        }
    }
};
let animationsEnabled = false;
const timelines = new Set();
class Timeline {
    constructor() { this.handlers = new Map(); }
    set_progress_mode() {}
    connect(signal, callback) { this.handlers.set(signal, callback); }
    start() { timelines.add(this); }
    stop() { timelines.delete(this); }
    get_progress() { return this.progress; }
    advance(progress) {
        assert(timelines.has(this), 'Only live animations can advance');
        this.progress = progress;
        this.handlers.get('new-frame')();
        if (progress === 1) {
            timelines.delete(this);
            this.handlers.get('completed')();
        }
    }
}
const classes = new Set();
const children = new Set();
const allocations = new Map();
const styleHandlers = new Map();
let nativeAlpha = 153;
const panel = {
    width: 1920, height: 32,
    add_style_class_name: name => classes.add(name),
    remove_style_class_name: name => classes.delete(name),
    insert_child_at_index: (actor, index) => {
        const ordered = [...children];
        ordered.splice(index, 0, actor);
        children.clear();
        ordered.forEach(child => children.add(child));
    },
    get_style_class_name: () => [...classes].join(' '),
    get_style_pseudo_class: () => '',
    get_style: () => '',
    ensure_style() {},
    connectObject(signal, callback, owner) { allocations.set(owner, { signal, callback }); },
    disconnectObject(owner) { allocations.delete(owner); }
};
class Widget {
    constructor(properties) { Object.assign(this, properties); }
    connectObject(signal, callback, owner) {
        assert.equal(signal, 'style-changed');
        styleHandlers.set(this, { callback, owner });
    }
    add_child(actor) { (this.children ??= []).push(actor); }
    get_style_class_name() { return this.style_class; }
    get_children() { return this.children ?? []; }
    allocate(box) { this.box = { ...box }; }
    get_theme_node() {
        this.themeReads = (this.themeReads ?? 0) + 1;
        // Model only background alpha; actual CSS parsing/rendering belongs to Shell.
        const gradientClass = this.style_class?.match(/panel-(?:maximized-|overview-)?gradient/)?.[0];
        const rule = gradientClass && css.match(new RegExp(`\\.${gradientClass}\\s*\\{([^}]+)\\}`))?.[1];
        const alpha = property => {
            const color = rule.match(new RegExp(`${property}: (rgba\\([^)]+\\))`))?.[1];
            assert(color, `Missing normalized ${property} in fixture`);
            return { alpha: Number(color.slice(color.lastIndexOf(',') + 1, -1)) * 255 };
        };
        return {
            get_background_image: () => null,
            get_border_image: () => null,
            get_background_gradient: () => rule
                ? [1, alpha('background-gradient-start'), alpha('background-gradient-end')]
                : [0, null, null],
            get_background_color: () => ({ alpha: nativeAlpha })
        };
    }
    destroy() {
        for (const [actor, handler] of styleHandlers) {
            if (actor === this || handler.owner === this)
                styleHandlers.delete(actor);
        }
        this.children?.forEach(child => child.destroy());
        children.delete(this);
        allocations.delete(this);
    }
}
let strength = 0;
let windowEvents;
class WindowEvents {
    constructor() { windowEvents = this; }
    setStateChangeCallback(callback) { this.callback = callback; }
    configureDetector() {}
    enable() { this.enabled = true; }
    disable() { this.enabled = false; }
    updateState() { this.callback({ effectStrength: strength }); }
    getEffectStrength() { return strength; }
    getCurrentState() { return { effectStrength: strength }; }
}
class WorkspaceEvents {
    enable() {}
    disable() {}
    detachTransition() {}
}
let css;
let writes = 0;
let loads = 0;
const stylesheetPath = fileURLToPath(new URL('../src/user-stylesheet.css', import.meta.url));
const mockFile = path => ({
    path,
    get_parent: () => mockFile(dirname(path)),
    get_child: name => mockFile(join(path, name)),
    replace() { assert.equal(path, stylesheetPath, 'Generated CSS belongs in the extension root'); }
});
const theme = {
    load_stylesheet(file) { assert.equal(file.path, stylesheetPath); loads++; },
    unload_stylesheet(file) { assert.equal(file.path, stylesheetPath); }
};
const stubs = {
    'resource:///org/gnome/shell/ui/main.js': { overview, panel },
    'resource:///org/gnome/shell/extensions/extension.js': { Extension: class {} },
    'gi://GLib': { default: { Source: { remove() {} } } },
    'gi://St': { default: {
        Widget, GradientType: { NONE: 0 },
        Settings: { get: () => ({ enable_animations: animationsEnabled }) },
        ThemeContext: { get_for_stage: () => ({ get_theme: () => theme }) }
    } },
    'gi://Clutter': { default: { ActorBox: class {}, Timeline, AnimationMode: { EASE_OUT_QUAD: 1 } } },
    'gi://Gio': { default: {
        File: { new_for_uri: uri => mockFile(fileURLToPath(uri)) },
        FileCreateFlags: { NONE: 0 },
        DataOutputStream: class { static new() { return new this(); } put_string(value) { css = value; writes++; } close() {} }
    } },
    'config.js': {
        TOP_BAR_STYLE_SETTINGS: 'top-bar-style-settings',
        getTopBarStyleSettings: settings => settings.get_boolean('top-bar-style-settings'),
        attachSettingListener: (settings, key, callback) => settings.connect(`changed::${key}`, callback),
        getConfig: settings => ({ ...settings }),
        attachSettingsListeners: () => [], detachSettingsListeners() {}
    },
    'topBarMenu.js': { default: class {} },
    'events/observers/windowsEvents/windowEvents.js': { default: WindowEvents },
    'events/observers/workspaceEvents.js': { default: WorkspaceEvents }
};
const modules = new Map();
const src = new URL('../src/', import.meta.url);
const load = url => {
    if (modules.has(url))
        return modules.get(url);
    const pending = (async () => {
        const exports = stubs[url] ?? stubs[url.replace(src.href, '')];
        return exports
            ? new SyntheticModule(Object.keys(exports), function () {
                for (const [key, value] of Object.entries(exports))
                    this.setExport(key, value);
            }, { identifier: url })
            : new SourceTextModule(await readFile(new URL(url), 'utf8'), {
                identifier: url,
                initializeImportMeta(meta) { meta.url = url; }
            });
    })();
    modules.set(url, pending);
    return pending;
};
const module = await load(new URL('extension.js', src).href);
await module.link((specifier, parent) => load(specifier.startsWith('.')
    ? new URL(specifier, parent.identifier).href : specifier));
await module.evaluate();
globalThis.get_workspace_manager = () => ({});
const settings = {
    get_boolean: () => false,
    connect: () => 1,
    disconnect() {},
    maximizedBehavior: 'keep-gradient', styleTrigger: 'maximized', proximityTransition: false,
    overviewBehavior: 'apply-style',
    // Rendering receives normalized config; overviewSettings.js exercises real settings normalization.
    colors: { start: 'rgba(0,0,0,1)', end: 'rgba(0,0,0,0)' }, gradientDirection: 'vertical',
    maximizedColors: { start: 'rgba(255,0,0,1)', end: 'rgba(0,0,255,1)' }, maximizedGradientDirection: 'horizontal',
    overviewColors: { start: 'rgba(0,255,0,0.4)', end: 'rgba(255,255,255,1)' }, overviewGradientDirection: 'horizontal',
    contentShadows: true, shadowColor: 'black', shadowBlur: 3, shadowOffsetX: 0, shadowOffsetY: 0
};
const extension = new module.namespace.default();
extension.getSettings = () => settings;
const expectStyle = expected => assert.deepEqual([...classes], expected ? [expected] : []);

extension.enable();
expectStyle('panel-gradient');
showOverview(true);
expectStyle('panel-overview-gradient');
assert.equal(windowEvents.enabled, false, 'Overview must work without window tracking');
assert.match(css, /panel-overview-gradient/);
assert.match(css, /background-gradient-start: rgba\(0,255,0,0.4\)/);
assert.match(css, /#panel\.panel-overview-gradient \.panel-button/);

for (const behavior of ['keep-gradient', 'keep-theme', 'apply-style']) {
    for (const windowBehavior of ['keep-gradient', 'keep-theme', 'apply-style']) {
        settings.overviewBehavior = behavior;
        settings.maximizedBehavior = windowBehavior;
        strength = 1;
        extension.configure(settings);
        const expected = { 'keep-gradient': 'panel-gradient', 'keep-theme': null, 'apply-style': 'panel-overview-gradient' }[behavior];
        expectStyle(expected);
        windowEvents.callback({ effectStrength: 1, workspaceTransition: 'progress', startEffectStrength: 0, endEffectStrength: 1, transitionProgress: 0.5 });
        windowEvents.callback({ effectStrength: 1, workspaceTransition: 'complete' });
        expectStyle(expected);
        assert.equal(children.size, 0, 'Window transitions cannot cover overview');
        showOverview(false);
        expectStyle({ 'keep-gradient': 'panel-gradient', 'keep-theme': null, 'apply-style': 'panel-maximized-gradient' }[windowBehavior]);
        assert.equal(children.size, 0, 'Reduced-motion exit commits the destination without temporary actors');
        showOverview(true);
        expectStyle(expected);
        assert.equal(children.size, 0, 'Entering overview removes the old transition overlay');
    }
}

settings.styleTrigger = 'proximity';
settings.proximityTransition = true;
settings.overviewBehavior = 'apply-style';
extension.configure(settings);
strength = 0.25;
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
console.log('Overview precedence, transitions, cleanup and reconfiguration passed');

// Exercise overview state through configure/update/disable as well as the functions below.
overview.visibleTarget = false;
settings.maximizedBehavior = 'keep-gradient';
settings.overviewTransition = true;
let gestureProgress = 0.4;
let onProgress;
const adjustment = {
    get value() { return gestureProgress; },
    connect(_signal, callback) { onProgress = callback; return 1; },
    disconnect() { onProgress = null; }
};
Math.clamp ??= (value, min, max) => Math.max(min, Math.min(max, value));
overview._overview = { controls: { _stateAdjustment: adjustment } };
extension.enable();
showOverview(true);
assert.equal(children.size, 2, 'Extension forwards gesture progress');
const configuredLayers = [...children];
const previousWrites = writes;
const previousLoads = loads;
extension.configure(settings);
assert([...children].every((actor, index) => actor === configuredLayers[index]), 'No-op configuration retains gesture actors');
assert.equal(writes, previousWrites, 'Identical CSS is not written');
assert.equal(loads, previousLoads, 'Identical CSS is not reloaded');
settings.shadowBlur++;
extension.configure(settings);
assert([...children].every((actor, index) => actor === configuredLayers[index]), 'Shadow changes retain gesture actors');
assert.equal([...children][1].opacity, 102, 'Shadow changes retain gesture progress');
settings.maximizedBehavior = 'apply-style';
strength = 0.6;
extension.configure(settings);
assert.equal([...children][1].opacity, 102, 'Mixed behavior and appearance changes retain overview progress');
assert.equal([...children][0].get_children()[1].opacity, 153, 'The same update refreshes the desktop destination');
gestureProgress = 0.2;
onProgress();
animationsEnabled = true;
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
animationsEnabled = false;
settings.overviewTransition = true;
extension.disable();
assert.equal(children.size, 0, 'Disable cleans up an active overview gesture');
assert.equal(handlers.size, 0);
expectStyle(null);
extension.enable();
extension.disable();
assert.equal(children.size, 0, 'Re-enable starts with fresh overview state');

// Exercise the current renderer API directly, preserving gesture and ownership checks.
const { default: Gradient } = (await modules.get(new URL('gradient/gradient.js', src).href)).namespace;
const { createPanelBackground } = (await modules.get(new URL('gradient/panelBackground.js', src).href)).namespace;
const { default: BackgroundBlend, calculateBackgroundBlend } =
    (await modules.get(new URL('gradient/backgroundBlend.js', src).href)).namespace;
const oldClasses = panel.get_style_class_name;
const oldPseudoClasses = panel.get_style_pseudo_class;
const oldStyle = panel.get_style;
panel.get_style_class_name = () => 'custom-panel panel-gradient panel-background-blending';
panel.get_style_pseudo_class = () => 'overview custom-state';
panel.get_style = () => 'background-color: red';
const themeBackground = createPanelBackground({ gradientClass: null, inOverview: true });
assert.equal(themeBackground.name, 'panel');
assert.equal(themeBackground.style_class, 'custom-panel');
assert.equal(themeBackground.pseudo_class, 'custom-state overview');
assert.match(themeBackground.style, /background-color: red; transition-duration: 0ms;/);
const desktopBackground = createPanelBackground({ gradientClass: 'panel-gradient' });
assert.equal(desktopBackground.style_class, 'custom-panel panel-gradient');
assert.equal(desktopBackground.pseudo_class, 'custom-state');
themeBackground.destroy();
desktopBackground.destroy();
panel.get_style_class_name = oldClasses;
panel.get_style_pseudo_class = oldPseudoClasses;
panel.get_style = oldStyle;

let renderer = new Gradient();
renderer.configure(settings);
const update = (progress, target = true, hidden = false, strength = 0) =>
    renderer.updateOverview({ progress, target, hidden }, strength);
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

update(1);
const completedLayers = [...children];
update(0.5, false, false, 1);
assert.equal(children.size, 2);
assert.ok([...children].every(actor => !completedLayers.includes(actor)), 'Exit rebuilds endpoints for the current desktop');
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

renderer = new Gradient();
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
renderer.configure({ ...settings, maximizedBehavior: 'apply-style',
    maximizedColors: { start: 'rgba(255,0,0,0.5)', end: 'rgba(0,0,255,0.5)' } });
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

renderer = new Gradient();
renderer.configure({ ...settings, maximizedBehavior: 'keep-theme' });
renderer.updateWindow({ effectStrength: 0.4 });
update(0.5);
const pausedActors = [...children];
const [capturedMain, capturedTheme] = pausedActors[0].get_children();
const capturedReads = capturedTheme.themeReads;
update(0.6);
update(0.5);
assert.equal(capturedTheme.themeReads, capturedReads, 'Gesture frames do not traverse the captured desktop blend');
nativeAlpha = 51;
assert(styleHandlers.has(capturedTheme), 'Captured backgrounds observe native theme changes');
styleHandlers.get(capturedTheme).callback();
assert.equal(capturedMain.opacity, Math.round(0.6 / (1 - 0.4 * 0.2) * 255),
    'A paused captured blend refreshes when native theme alpha changes');
assert.equal(pausedActors[1].opacity, 128, 'Theme refresh leaves overview progress unchanged');
assert([...children].every((actor, index) => actor === pausedActors[index]), 'Theme refresh retains background actors');
nativeAlpha = 153;
renderer.destroy();
assert.equal(styleHandlers.size, 0, 'Destroy releases background style listeners');

renderer = new Gradient();
renderer.configure({ ...settings, maximizedBehavior: 'apply-style' });
const swipeState = { effectStrength: 0, workspaceTransition: 'progress',
    startEffectStrength: 0, endEffectStrength: 1, transitionProgress: 0.25 };
animationsEnabled = true;
renderer.updateWindow(swipeState);
assert.equal([...children][1].opacity, 64);
assert.equal(timelines.size, 0, 'Workspace progress is applied directly without a timed animation');
const swipeLayers = [...children];
renderer.configure({ ...settings, maximizedBehavior: 'apply-style', shadowBlur: 8 });
assert([...children].every((actor, index) => actor === swipeLayers[index]), 'Workspace settings updates retain actors');
assert.equal([...children][1].opacity, 64, 'Workspace settings updates retain the gesture position');
renderer.restoreDesktop();
expectStyle('panel-gradient');
assert.equal(children.size, 0, 'Restoration uses current window strength rather than workspace gesture progress');
renderer.updateWindow(swipeState);
update(0.5, true, false, 1);
update(0, false, true, 1);
expectStyle('panel-maximized-gradient');
assert.equal(children.size, 0, 'Overview exit cannot restore an interrupted workspace gesture');
renderer.destroy();

// Drive timed transitions deterministically, with no wall-clock waits.
animationsEnabled = true;
renderer = new Gradient();
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

renderer = new Gradient();
renderer.configure({ ...settings, maximizedBehavior: 'apply-style', styleTrigger: 'maximized' });
renderer.updateWindow({ effectStrength: 1 });
[...timelines][0].advance(0.5);
update(0.4, true, false, 1);
const capturedSource = [...children][0];
const beforeInactiveEdit = writes;
renderer.configure({ ...settings, maximizedBehavior: 'apply-style', styleTrigger: 'maximized', proximityDistance: 123 });
assert.equal([...children][0], capturedSource, 'An inactive distance setting does not replace a captured desktop blend');
assert.equal(writes, beforeInactiveEdit, 'Behavior changes with identical CSS do not reload it');
renderer.destroy();

renderer = new Gradient();
renderer.configure(settings);
const mainStyle = { gradientClass: 'panel-gradient' };
const alternateStyle = { gradientClass: 'panel-maximized-gradient' };
const overviewStyle = { gradientClass: 'panel-overview-gradient', inOverview: true };
const capturedStyle = { progress: 0.4, layers: [mainStyle, alternateStyle] };
const blend = new BackgroundBlend(capturedStyle, overviewStyle);
blend.setProgress(0.4);
assert.deepEqual(blend.getStyle(), { progress: 0.4, layers: [capturedStyle, overviewStyle] },
    'Snapshots contain endpoint descriptions and progress, without derived opacities');
const blendActors = [...children];
blend.updateStyles({ layers: [
    { inOverview: false, gradientClass: 'panel-gradient' },
    { inOverview: false, gradientClass: 'panel-maximized-gradient' }
], progress: 0.4 }, { inOverview: true, gradientClass: 'panel-overview-gradient' });
assert([...children].every((actor, index) => actor === blendActors[index]),
    'Equivalent nested styles retain actors regardless of property order or omitted false flags');
blend.updateStyles(capturedStyle, { gradientClass: null });
assert.equal([...children][0], blendActors[0], 'Replacing the target retains the source');
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
nativeAlpha = 51;
styleHandlers.get(retainedTarget).callback();
assert.equal(blend.progress, currentProgress, 'Theme refresh preserves timed progress');
assert(timelines.has(retainedTimeline), 'Theme refresh retains the running animation');
blend.animateTo(1, complete);
assert(timelines.has(retainedTimeline), 'Repeated destination requests retain the running animation');
retainedTimeline.advance(1);
assert.equal(completions, 1, 'An unchanged destination completes exactly once');
nativeAlpha = 153;
blend.destroy();
blend.destroy();
assert.equal(styleHandlers.size, 0);
assert.equal(allocations.size, 0);
assert.equal(children.size, 0);
renderer.destroy();

// Failed stylesheet loads must remain retryable, rather than poisoning the no-op cache.
renderer = new Gradient();
const loadStylesheet = theme.load_stylesheet;
theme.load_stylesheet = () => { throw new Error('Theme load failed'); };
assert.throws(() => renderer.configure(settings), /Theme load failed/);
const failedWrites = writes;
theme.load_stylesheet = loadStylesheet;
renderer.configure(settings);
assert.equal(writes, failedWrites + 1, 'A failed load is retried on identical configuration');
renderer.destroy();

for (const [a, b] of [[1, 1], [0.1, 0.6], [0, 0], [1, 0]]) {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        const { sourceOpacity: s, destinationOpacity: d } = calculateBackgroundBlend(p, b, b);
        assert(Math.abs(d * b + s * a * (1 - d * b) - ((1 - p) * a + p * b)) < 1e-12,
            `Uniform-alpha compositing at progress ${p}, source ${a}, destination ${b}`);
    }
}
for (const invalid of [NaN, Infinity, -0.1, 1.1]) {
    for (const args of [[invalid, 0, 1], [0.5, invalid, 1], [0.5, 0, invalid]])
        assert.throws(() => calculateBackgroundBlend(...args), { name: 'RangeError' });
}
console.log('Overview progress, reversal, cancellation, partial blends, animation and cleanup passed');
