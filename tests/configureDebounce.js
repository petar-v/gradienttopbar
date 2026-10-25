// Run with: node --experimental-vm-modules tests/configureDebounce.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

let nextId = 0;
let onChange;
let onMenuChange;
let menusCreated = 0;
let menusDestroyed = 0;
let openMenuPreferences;
class TopBarMenu {
    constructor(callback) { menusCreated++; openMenuPreferences = callback; }
    destroy() { menusDestroyed++; }
}
const pending = new Map();
const GLib = {
    PRIORITY_DEFAULT: 0,
    SOURCE_REMOVE: false,
    Source: { remove: id => pending.delete(id) },
    timeout_add(_priority, delay, callback) {
        assert.equal(delay, 500);
        pending.set(++nextId, callback);
        return nextId;
    }
};
const exports = {
    Extension: class {},
    applyGradientStyle() {},
    updateOverviewTransition() {},
    endOverviewTransition() {},
    overview: { connect() { return 1; }, disconnect() {} },
    unloadGradientStylesheet() {},
    getConfig: settings => ({ ...settings }),
    TOP_BAR_STYLE_SETTINGS: 'top-bar-style-settings',
    getTopBarStyleSettings: settings => settings.get_boolean('top-bar-style-settings'),
    attachSettingListener: (settings, key, callback) => settings.connect(`changed::${key}`, callback),
    attachSettingsListeners(_settings, callback) { onChange = callback; return []; },
    detachSettingsListeners(settings, ids) { ids.forEach(id => settings.disconnect(id)); },
    MAXIMIZED_BEHAVIOR: {},
    STYLE_TRIGGER: {}
};
const source = new SourceTextModule(await readFile(new URL('../src/extension.js', import.meta.url), 'utf8'));
await source.link(specifier => {
    const values = specifier === 'gi://GLib' ? { default: GLib }
        : specifier.endsWith('/topBarMenu.js') ? { default: TopBarMenu }
            : { ...exports, default: class { destroy() {} } };
    return new SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values))
            this.setExport(key, value);
    });
});
await source.evaluate();
globalThis.get_workspace_manager = () => ({});
const extension = new source.namespace.default();
const snapshot = { window: { effectStrength: 0.6 }, overview: { progress: 0.4, hidden: false, target: true } };
const reconciled = [];
extension.events = { configure: config => { reconciled.push(config); return snapshot; } };
extension.gradient = { configure: (config, state) => { reconciled.push(config, state); } };
extension.configure({ shadowBlur: 6, proximityDistance: 80, overviewBehavior: 'keep-theme' });
assert.equal(reconciled.length, 3, 'One observer reconciliation and one renderer configuration per batch');
assert.equal(reconciled[0], reconciled[1], 'Both owners receive the same final normalized config');
assert.equal(reconciled[2], snapshot, 'The renderer receives the reconciled observer state');
assert.equal(reconciled[0].shadowBlur, 6);
assert.equal(reconciled[0].proximityDistance, 80);
const settings = {
    value: 0,
    showMenu: false,
    get_boolean: () => settings.showMenu,
    connect(signal, callback) {
        assert.equal(signal, 'changed::top-bar-style-settings');
        onMenuChange = callback;
        return 42;
    },
    disconnect(id) { assert.equal(id, 42); onMenuChange = null; }
};
extension.getSettings = () => settings;
const applied = [];
extension.configure = s => applied.push(s.value);
extension.enable();
assert.equal(menusCreated, 0, 'No menu while setting is off');
settings.showMenu = true;
onMenuChange();
onMenuChange();
assert.equal(menusCreated, 1, 'Enabling creates exactly one menu');
let preferencesOpened = 0;
extension.openPreferences = () => preferencesOpened++;
openMenuPreferences();
assert.equal(preferencesOpened, 1, 'Menu opens extension preferences');
settings.showMenu = false;
onMenuChange();
assert.equal(menusDestroyed, 1, 'Turning setting off removes menu immediately');
settings.showMenu = true;
onMenuChange();
assert.deepEqual(applied, [0], 'Enable configures immediately');
for (let i = 1; i <= 1000; i++) {
    settings.value = i;
    onChange(settings);
}
assert.equal(pending.size, 1, 'A burst leaves one pending update');
assert.deepEqual(applied, [0], 'No configuration during burst');
const callback = [...pending.values()][0];
pending.clear();
assert.equal(callback(), GLib.SOURCE_REMOVE);
assert.deepEqual(applied, [0, 1000], 'Apply latest values once');
onChange(settings);
extension.disable();
assert.equal(menusDestroyed, 2, 'Disabling extension removes menu');
assert.equal(onMenuChange, null, 'Disabling disconnects menu setting listener');
assert.equal(pending.size, 0, 'Disable cancels pending writes');
extension.enable();
assert.equal(menusCreated, 3, 'Re-enable restores opted-in menu');
assert.deepEqual(applied, [0, 1000, 1000], 'Re-enable configures immediately');
extension.disable();
assert.equal(menusDestroyed, 3, 'Re-enabled menu is cleaned up');
console.log('Debounce burst, latest settings, disable and re-enable checks passed');

// Exercise the real subscription boundary without requiring a GTK display.
const configUrl = new URL('../src/config.js', import.meta.url);
const configModule = new SourceTextModule(await readFile(configUrl, 'utf8'));
await configModule.link(async specifier => {
    const values = specifier === 'gi://Gio'
        ? { default: { _promisify() {}, Subprocess: class {}, File: class {} } }
        : await import(new URL(specifier, configUrl));
    return new SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values))
            this.setExport(key, value);
    });
});
await configModule.evaluate();
const subscriptions = new Map();
const scopedSettings = {
    connect(signal, callback) { const id = ++nextId; subscriptions.set(id, { signal, callback }); return id; },
    disconnect(id) { assert(subscriptions.delete(id)); }
};
const config = configModule.namespace;
const ids = config.attachSettingsListeners(scopedSettings, onChange, [config.COLORS, config.MAXIMIZED_BEHAVIOR]);
assert.deepEqual([...subscriptions.values()].map(({ signal }) => signal), ['changed::colors', 'changed::maximized-behavior']);
config.detachSettingsListeners(scopedSettings, ids);
assert.equal(subscriptions.size, 0, 'Scoped subscriptions release their owned handlers');
const allIds = config.attachSettingsListeners(scopedSettings, onChange);
assert.equal(allIds.length, 17, 'Runtime subscriptions still cover all rendering and behavior settings');
config.detachSettingsListeners(scopedSettings, allIds);
