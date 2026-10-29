import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExtensionFixture } from './fixtures/extension.js';
import { createModuleLoader } from './fixtures/modules.js';

test('configuration reconciles observers before rendering the same final snapshot', async t => {
    const { extension } = await createExtensionFixture(t);
    const snapshot = { window: { effectStrength: 0.6 }, overview: { progress: 0.4, isHidden: false, isTargetVisible: true } };
    const reconciled = [];
    extension.events = {
        configure: config => {
            reconciled.push(config);
            return snapshot;
        }
    };
    extension.gradient = { configure: (config, state) => { reconciled.push(config, state); } };
    extension.configure({ shadowBlur: 6, proximityDistance: 80, overviewBehavior: 'keep-theme' });
    assert.equal(reconciled.length, 3, 'One observer reconciliation and one renderer configuration per batch');
    assert.equal(reconciled[0], reconciled[1], 'Both owners receive the same final normalized config');
    assert.equal(reconciled[2], snapshot, 'The renderer receives the reconciled observer state');
    assert.equal(reconciled[0].shadowBlur, 6);
    assert.equal(reconciled[0].proximityDistance, 80);
});

test('menu preferences toggle immediately and menu ownership survives re-enable', async t => {
    const { extension, settings, state } = await createExtensionFixture(t);
    const applied = [];
    extension.configure = s => applied.push(s.value);
    extension.enable();
    assert.equal(state.menusCreated, 0, 'No menu while setting is off');
    settings.showMenu = true;
    state.onMenuChange();
    state.onMenuChange();
    assert.equal(state.menusCreated, 1, 'Enabling creates exactly one menu');
    let preferencesOpened = 0;
    extension.openPreferences = () => preferencesOpened++;
    state.openMenuPreferences();
    assert.equal(preferencesOpened, 1, 'Menu opens extension preferences');
    settings.showMenu = false;
    state.onMenuChange();
    assert.equal(state.menusDestroyed, 1, 'Turning setting off removes menu immediately');
    settings.showMenu = true;
    state.onMenuChange();
    extension.disable();
    assert.equal(state.menusDestroyed, 2, 'Disabling extension removes menu');
    assert.equal(state.onMenuChange, null, 'Disabling disconnects menu setting listener');
    extension.enable();
    assert.equal(state.menusCreated, 3, 'Re-enable restores opted-in menu');
    extension.disable();
    assert.equal(state.menusDestroyed, 3, 'Re-enabled menu is cleaned up');
});

test('bursts configure only the latest value and disable cancels pending updates', async t => {
    const { extension, settings, pending, state, GLib } = await createExtensionFixture(t);
    const applied = [];
    extension.configure = s => applied.push(s.value);
    extension.enable();
    assert.deepEqual(applied, [0], 'Enable configures immediately');
    for (let i = 1; i <= 1000; i++) {
        settings.value = i;
        state.onChange(settings);
    }
    assert.equal(pending.size, 1, 'A burst leaves one pending update');
    assert.deepEqual(applied, [0], 'No configuration during burst');
    const callback = [...pending.values()][0];
    pending.clear();
    assert.equal(callback(), GLib.SOURCE_REMOVE);
    assert.deepEqual(applied, [0, 1000], 'Apply latest values once');
    state.onChange(settings);
    extension.disable();
    assert.equal(pending.size, 0, 'Disable cancels pending writes');
    extension.enable();
    assert.deepEqual(applied, [0, 1000, 1000], 'Re-enable configures immediately');
    extension.disable();
});

test('scoped settings subscriptions detach independently and runtime subscriptions stay complete', async t => {
    const load = createModuleLoader({
        'gi://Gio': { default: { _promisify() {}, Subprocess: class {}, File: class {} } }
    });
    const configModule = await load('config.js');
    let nextId = 0;
    const state = { onChange: () => {} };
    const subscriptions = new Map();
    const scopedSettings = {
        connect(signal, callback) {
            const id = ++nextId;
            subscriptions.set(id, { signal, callback });
            return id;
        },
        disconnect(id) { assert(subscriptions.delete(id)); }
    };
    const config = configModule.namespace;
    t.after(() => config.detachSettingsListeners(scopedSettings, [...subscriptions.keys()]));
    const ids = config.attachSettingsListeners(scopedSettings, state.onChange, [config.COLORS, config.WINDOW_BEHAVIOR_KEY]);
    assert.deepEqual([...subscriptions.values()].map(({ signal }) => signal), ['changed::colors', 'changed::maximized-behavior']);
    config.detachSettingsListeners(scopedSettings, ids);
    assert.equal(subscriptions.size, 0, 'Scoped subscriptions release their owned handlers');
    const allIds = config.attachSettingsListeners(scopedSettings, state.onChange);
    assert.equal(allIds.length, 18, 'Runtime subscriptions still cover all rendering and behavior settings');
    assert([...subscriptions.values()].some(({ signal }) => signal === 'changed::workspace-gesture-blending'), 'Workspace blending changes reconfigure runtime');
    config.detachSettingsListeners(scopedSettings, allIds);
});
