// Run with: node --experimental-vm-modules tests/configureDebounce.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

let nextId = 0;
let onChange;
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
class WindowEvents {
    setStateChangeCallback() {}
    disable() {}
}
const exports = {
    Extension: class {},
    applyGradientStyle() {},
    applyOverviewStyle() {},
    removeGradientTransition() {},
    overview: { connect() { return 1; }, disconnect() {} },
    unloadGradientStylesheet() {},
    getConfig() {},
    attachSettingsListeners(_settings, callback) { onChange = callback; return []; },
    detachSettingsListeners() {},
    MAXIMIZED_BEHAVIOR: {},
    STYLE_TRIGGER: {}
};
const source = new SourceTextModule(await readFile(new URL('../src/extension.js', import.meta.url), 'utf8'));
await source.link(specifier => {
    const values = specifier === 'gi://GLib' ? { default: GLib }
        : specifier.endsWith('/windowEvents.js') ? { default: WindowEvents }
            : { ...exports, default: class {} };
    return new SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values))
            this.setExport(key, value);
    });
});
await source.evaluate();
globalThis.get_workspace_manager = () => ({});
const extension = new source.namespace.default();
const settings = { value: 0 };
extension.getSettings = () => settings;
const applied = [];
extension.configure = s => applied.push(s.value);
extension.enable();
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
assert.equal(pending.size, 0, 'Disable cancels pending writes');
extension.enable();
assert.deepEqual(applied, [0, 1000, 1000], 'Re-enable configures immediately');
extension.disable();
console.log('Debounce burst, latest settings, disable and re-enable checks passed');
