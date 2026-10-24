// Run with: node --experimental-vm-modules tests/overviewStyle.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const handlers = new Map();
let nextId = 0;
const overview = {
    visibleTarget: false,
    connect(signal, callback) { handlers.set(++nextId, { signal, callback }); return nextId; },
    disconnect(id) { handlers.delete(id); }
};
const showOverview = visible => {
    overview.visibleTarget = visible;
    for (const { signal, callback } of handlers.values()) {
        if (signal === (visible ? 'showing' : 'hiding'))
            callback();
    }
};
const classes = new Set();
const children = new Set();
const allocations = new Map();
const panel = {
    width: 1920, height: 32,
    add_style_class_name: name => classes.add(name),
    remove_style_class_name: name => classes.delete(name),
    insert_child_at_index: actor => children.add(actor),
    get_style_class_name: () => [...classes].join(' '),
    get_style_pseudo_class: () => '',
    get_style: () => '',
    ensure_style() {},
    connectObject(signal, callback, owner) { allocations.set(owner, { signal, callback }); },
    disconnectObject(owner) { allocations.delete(owner); }
};
class Widget {
    constructor(properties) { Object.assign(this, properties); }
    add_child(actor) { (this.children ??= []).push(actor); }
    get_style_class_name() { return this.style_class; }
    get_children() { return this.children ?? []; }
    hide() { this.hidden = true; }
    show() { this.hidden = false; }
    allocate(box) { this.box = { ...box }; }
    set_style_class_name(name) { this.style_class = name; }
    remove_transition() {}
    ease(properties) { this.opacity = properties.opacity; properties.onComplete?.(); }
    destroy() { this.children?.forEach(child => child.destroy()); children.delete(this); allocations.delete(this); }
}
let strength = 0;
class WindowEvents {
    setStateChangeCallback(callback) { this.callback = callback; }
    setBehaviourDetector() {}
    enable() { this.enabled = true; }
    disable() { this.enabled = false; }
    detachWorkspaceTransitionEvents() {}
    updateState() { this.callback({ effectStrength: strength }); }
    getEffectStrength() { return strength; }
}
let css;
const theme = { load_stylesheet() {}, unload_stylesheet() {} };
const stubs = {
    'resource:///org/gnome/shell/ui/main.js': { overview, panel },
    'resource:///org/gnome/shell/extensions/extension.js': { Extension: class {} },
    'gi://GLib': { default: { Source: { remove() {} } } },
    'gi://St': { default: { Widget, ThemeContext: { get_for_stage: () => ({ get_theme: () => theme }) } } },
    'gi://Clutter': { default: { ActorBox: class {}, AnimationMode: { EASE_OUT_QUAD: 1 } } },
    'gi://Cogl': { default: { Color: { from_string: value => [value !== 'invalid', {
        red: Number.parseInt(value.slice(1, 3), 16), green: Number.parseInt(value.slice(3, 5), 16),
        blue: Number.parseInt(value.slice(5, 7), 16), alpha: Number.parseInt(value.slice(7, 9), 16)
    }] } } },
    'gi://Gio': { default: {
        File: { new_for_path: () => ({ replace() {} }) },
        FileCreateFlags: { NONE: 0 },
        DataOutputStream: class { static new() { return new this(); } put_string(value) { css = value; } close() {} }
    } },
    'config.js': {
        TOP_BAR_STYLE_SETTINGS: 'top-bar-style-settings',
        getTopBarStyleSettings: settings => settings.get_boolean('top-bar-style-settings'),
        attachSettingListener: (settings, key, callback) => settings.connect(`changed::${key}`, callback),
        getConfig: settings => settings,
        attachSettingsListeners: () => [], detachSettingsListeners() {}
    },
    'topBarMenu.js': { default: class {} },
    'events/windowEvents.js': { default: WindowEvents },
    'events/behaviours/maximizedWindows.js': { default: class {} },
    'events/behaviours/proximityWindows.js': { default: class {} }
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
            : new SourceTextModule(await readFile(new URL(url), 'utf8'), { identifier: url });
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
    colors: { start: '#000000ff', end: '#00000000' }, gradientDirection: 'vertical',
    maximizedColors: { start: '#ff0000ff', end: '#0000ffff' }, maximizedGradientDirection: 'horizontal',
    overviewColors: { start: '#00ff0066', end: '#ffffffff' }, overviewGradientDirection: 'horizontal',
    contentShadows: true, shadowColor: 'black', shadowBlur: 3, shadowOffsetX: 0, shadowOffsetY: 0
};
const extension = new module.namespace.default();
extension.path = '/test';
extension.getSettings = () => settings;
const expectStyle = expected => assert.deepEqual([...classes], expected ? [expected] : []);

extension.enable();
expectStyle('panel-gradient');
showOverview(true);
expectStyle('panel-overview-gradient');
assert.equal(extension.windowEvents.enabled, false, 'Overview must work without window tracking');
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
        extension.windowEvents.callback({ effectStrength: 1, workspaceTransition: 'progress', startEffectStrength: 0, endEffectStrength: 1, transitionProgress: 0.5 });
        extension.windowEvents.callback({ effectStrength: 1, workspaceTransition: 'complete' });
        expectStyle(expected);
        assert.equal(children.size, 0, 'Window transitions cannot cover overview');
        showOverview(false);
        if (windowBehavior === 'keep-theme')
            expectStyle(null);
        else
            expectStyle('panel-gradient');
        if (windowBehavior === 'apply-style')
            assert.equal([...children][0].opacity, 255, 'Exit restores current window style');
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
assert.equal([...children][0].opacity, 64, 'Exit recalculates partial proximity on the destination workspace');
showOverview(true);
extension.disable();
expectStyle(null);
assert.equal(children.size, 0);
assert.equal(handlers.size, 0, 'Disable disconnects overview signals');
extension.enable();
expectStyle('panel-overview-gradient');
assert.equal(handlers.size, 4, 'Re-enable while open installs one set of overview handlers');
settings.overviewColors.start = 'invalid';
extension.configure(settings);
assert.doesNotMatch(css, /invalid/, 'Malformed overview colours cannot enter CSS');
assert.match(css, /\.panel-overview-gradient\s*\{[^}]*background-gradient-direction: vertical;[^}]*background-gradient-start: #000000ff;/);
extension.disable();
console.log('Overview precedence, transitions, cleanup and reconfiguration passed');

// Exercise overview state through configure/update/disable as well as the functions below.
overview.visibleTarget = false;
settings.maximizedBehavior = 'keep-gradient';
settings.overviewTransition = true;
extension.enable();
let gestureProgress = 0.4;
Object.defineProperty(extension.overviewEvents, 'progress', { get: () => gestureProgress });
showOverview(true);
assert.equal(children.size, 2, 'Extension forwards gesture progress');
extension.configure(settings);
assert.equal(children.size, 2, 'Reconfiguration replaces layers without leaking actors');
gestureProgress = 0.2;
extension.updateOverview();
extension.disable();
assert.equal(children.size, 0, 'Disable cleans up an active overview gesture');
assert.equal(handlers.size, 0);
expectStyle(null);
extension.enable();
extension.disable();
assert.equal(children.size, 0, 'Re-enable starts with fresh overview state');

// Drive the overview functions with explicit state, without Shell.
const gradient = (await modules.get(new URL('gradient/gradient.js', src).href)).namespace;
const oldClasses = panel.get_style_class_name;
const oldPseudoClasses = panel.get_style_pseudo_class;
const oldStyle = panel.get_style;
panel.get_style_class_name = () => 'custom-panel panel-gradient panel-overview-blending';
panel.get_style_pseudo_class = () => 'overview custom-state';
panel.get_style = () => 'background-color: red';
const themeBackground = gradient.createPanelBackground(null, true);
assert.equal(themeBackground.name, 'panel');
assert.equal(themeBackground.style_class, 'custom-panel');
assert.equal(themeBackground.pseudo_class, 'custom-state overview');
assert.match(themeBackground.style, /background-color: red; transition-duration: 0ms;/);
const desktopBackground = gradient.createPanelBackground('panel-gradient', false);
assert.equal(desktopBackground.style_class, 'custom-panel panel-gradient');
assert.equal(desktopBackground.pseudo_class, 'custom-state');
themeBackground.destroy();
desktopBackground.destroy();
panel.get_style_class_name = oldClasses;
panel.get_style_pseudo_class = oldPseudoClasses;
panel.get_style = oldStyle;
const restores = [];
const { updateOverviewTransition, endOverviewTransition } = (await modules.get(new URL('gradient/overviewTransition.js', src).href)).namespace;
const state = {
    config: { overviewBehavior: 'apply-style', overviewTransition: true },
    target: null,
    layers: null
};
const restoreDesktop = settle => {
    restores.push(settle);
    gradient.toggleGradient(true);
};
gradient.toggleGradient(true);
updateOverviewTransition(state, { progress: 0.25, hidden: false, target: true }, restoreDesktop);
assert.equal(children.size, 2, 'A gesture owns exactly two background layers');
assert.equal(allocations.size, 1, 'A gesture owns one allocation handler');
const originalLayers = [...children];
updateOverviewTransition(state, { progress: 0.75, hidden: false, target: true }, restoreDesktop);
assert.deepEqual([...children], originalLayers, 'Progress reuses the same layers');
updateOverviewTransition(state, { progress: 0.25, hidden: false, target: false }, restoreDesktop);
assert.deepEqual([...children], originalLayers, 'Reversing retraces the existing blend');
assert.equal(originalLayers[0].opacity, 191);
assert.equal(originalLayers[1].opacity, 64);
updateOverviewTransition(state, { progress: 0, hidden: true, target: false }, restoreDesktop);
assert.equal(children.size, 0, 'Cancellation removes all layers');
assert.equal(state.layers, null);
assert.equal(allocations.size, 0, 'Cancellation disconnects the allocation handler');
expectStyle('panel-gradient');
updateOverviewTransition(state, { progress: 1, hidden: false, target: true }, restoreDesktop);
const completedLayers = [...children];
updateOverviewTransition(state, { progress: 0.5, hidden: false, target: false }, restoreDesktop);
assert.equal(restores.at(-1), true, 'Leaving completed overview resolves the desktop destination');
assert.equal(children.size, 2);
assert.ok([...children].every(actor => !completedLayers.includes(actor)), 'Exit starts fresh layers');
endOverviewTransition(state);
state.config = { overviewBehavior: 'keep-theme', overviewTransition: true };
state.target = null;
assert.equal(children.size, 0, 'Reconfiguration cleans up active layers');
updateOverviewTransition(state, { progress: 0.5, hidden: false, target: true }, restoreDesktop);
assert.equal(children.size, 2);
endOverviewTransition(state);
endOverviewTransition(state);
assert.equal(children.size, 0, 'Repeated cleanup is safe');
assert.ok(!classes.has('panel-overview-blending'));
gradient.toggleGradient(true);
gradient.setGradientTransition(0.4);
const alternate = [...children][0];
updateOverviewTransition(state, { progress: 0.5, hidden: false, target: true }, restoreDesktop);
assert.equal(alternate.hidden, true, 'The original partial window blend is hidden during overview');
const source = [...children][1];
assert.equal(source.children[0].opacity, 102, 'Overview preserves the partial desktop blend');
const oldWidth = panel.width;
panel.width = 1280;
allocations.get(source).callback();
assert.equal(source.children[0].box.x2, 1280, 'Nested layers follow panel allocation');
panel.width = oldWidth;
endOverviewTransition(state);
assert.equal(alternate.hidden, false, 'Cleanup restores the original window overlay');
assert.equal(children.size, 1);
gradient.removeGradientTransition();
gradient.toggleGradient(false);
assert.equal(allocations.size, 0, 'All background allocation handlers are removed');
console.log('Overview functions: progress, reversal, cancellation, allocation and cleanup passed');
