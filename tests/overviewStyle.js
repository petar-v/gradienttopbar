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
const panel = {
    width: 1920, height: 32,
    add_style_class_name: name => classes.add(name),
    remove_style_class_name: name => classes.delete(name),
    insert_child_at_index: actor => children.add(actor),
    connectObject() {}
};
class Widget {
    constructor(properties) { Object.assign(this, properties); }
    allocate() {}
    set_style_class_name(name) { this.style_class = name; }
    remove_transition() {}
    ease(properties) { this.opacity = properties.opacity; properties.onComplete?.(); }
    destroy() { children.delete(this); }
}
let strength = 0;
class WindowEvents {
    setStateChangeCallback(callback) { this.callback = callback; }
    setBehaviourDetector() {}
    enable() { this.enabled = true; }
    disable() { this.enabled = false; }
    detachWorkspaceTransitionEvents() {}
    updateState() { this.callback({ effectStrength: strength }); }
}
let css;
const theme = { load_stylesheet() {}, unload_stylesheet() {} };
const stubs = {
    'resource:///org/gnome/shell/ui/main.js': { overview, panel },
    'resource:///org/gnome/shell/extensions/extension.js': { Extension: class {} },
    'gi://GLib': { default: { Source: { remove() {} } } },
    'gi://St': { default: { Widget, ThemeContext: { get_for_stage: () => ({ get_theme: () => theme }) } } },
    'gi://Clutter': { default: { ActorBox: class {}, AnimationMode: { EASE_OUT_QUAD: 1 } } },
    'gi://Cogl': { default: { Color: { from_string: value => [value !== 'invalid', { to_string: () => value }] } } },
    'gi://Gio': { default: {
        File: { new_for_path: () => ({ replace() {} }) },
        FileCreateFlags: { NONE: 0 },
        DataOutputStream: class { static new() { return new this(); } put_string(value) { css = value; } close() {} }
    } },
    'config.js': {
        TOP_BAR_STYLE_SETTINGS: 'top-bar-style-settings',
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
const load = async url => {
    if (modules.has(url))
        return modules.get(url);
    const exports = stubs[url] ?? stubs[url.replace(src.href, '')];
    const module = exports
        ? new SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports))
                this.setExport(key, value);
        }, { identifier: url })
        : new SourceTextModule(await readFile(new URL(url), 'utf8'), { identifier: url });
    modules.set(url, module);
    await module.link((specifier, parent) => load(specifier.startsWith('.')
        ? new URL(specifier, parent.identifier).href : specifier));
    return module;
};
const module = await load(new URL('extension.js', src).href);
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
assert.match(css, /background-gradient-start: #00ff0066/);
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
assert.equal(handlers.size, 2, 'Re-enable while open installs one pair of handlers');
settings.overviewColors.start = 'invalid';
extension.configure(settings);
assert.doesNotMatch(css, /invalid/, 'Malformed overview colours cannot enter CSS');
assert.match(css, /\.panel-overview-gradient\s*\{[^}]*background-gradient-direction: vertical;[^}]*background-gradient-start: #000000ff;/);
extension.disable();
console.log('Overview precedence, transitions, cleanup and reconfiguration passed');
