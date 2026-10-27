import assert from 'node:assert/strict';
import { createModuleLoader } from './modules.js';

export const createExtensionFixture = async t => {
    const state = { menusCreated: 0, menusDestroyed: 0, onChange: null, onMenuChange: null, openMenuPreferences: null };
    const pending = new Map();
    let nextId = 0;
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
    const settings = {
        value: 0,
        showMenu: false,
        get_boolean: () => settings.showMenu,
        connect(signal, callback) {
            assert.equal(signal, 'changed::top-bar-style-settings');
            state.onMenuChange = callback;
            return 42;
        },
        disconnect(id) { assert.equal(id, 42); state.onMenuChange = null; }
    };
    const load = createModuleLoader({
        'gi://GLib': { default: GLib },
        'resource:///org/gnome/shell/extensions/extension.js': { Extension: class {} },
        'topBarMenu.js': {
            default: class {
                constructor(callback) { state.menusCreated++; state.openMenuPreferences = callback; }
                destroy() { state.menusDestroyed++; }
            }
        },
        'gradient/gradient.js': { default: class { destroy() {} } },
        'events/eventManager.js': { default: class { destroy() {} } },
        'config.js': {
            getConfig: target => ({ ...target }),
            TOP_BAR_STYLE_SETTINGS: 'top-bar-style-settings',
            getTopBarStyleSettings: target => target.get_boolean('top-bar-style-settings'),
            attachSettingListener: (target, key, callback) => target.connect(`changed::${key}`, callback),
            attachSettingsListeners(_settings, callback) { state.onChange = callback; return []; },
            detachSettingsListeners(target, ids) { ids.forEach(id => target.disconnect(id)); }
        }
    });
    const module = await load('extension.js');
    const extension = new module.namespace.default();
    extension.getSettings = () => settings;
    t.after(() => {
        if (extension._settings)
            extension.disable();
        assert.equal(pending.size, 0, 'Fixture leaked a configuration timer');
        assert.equal(state.onMenuChange, null, 'Fixture leaked a menu subscription');
        assert.equal(state.menusCreated, state.menusDestroyed, 'Fixture leaked a menu');
    });
    return { extension, settings, pending, state, GLib };
};
