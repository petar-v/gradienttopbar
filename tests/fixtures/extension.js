import assert from 'node:assert/strict';
import { createModuleLoader } from './modules.js';

export const createExtensionFixture = async (t, extraStubs = {}) => {
    const state = { menusCreated: 0, menusDestroyed: 0, onChange: null, onMenuChange: null, openMenuPreferences: null, onZoomChange: null, zoomConfigured: [], zoomDestroyed: 0, eventsDestroyed: 0 };
    state.configurations = [];
    state.reconciled = [];
    state.windowState = null;
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
        smoothZoom: false,
        get_boolean(key) {
            assert(['top-bar-style-settings', 'overview-smooth-zoom'].includes(key));
            return key === 'overview-smooth-zoom' ? settings.smoothZoom : settings.showMenu;
        },
        connect(signal, callback) {
            assert(['changed::top-bar-style-settings', 'changed::overview-smooth-zoom'].includes(signal));
            if (signal === 'changed::overview-smooth-zoom') {
                state.onZoomChange = callback;
                return 43;
            }
            state.onMenuChange = callback;
            return 42;
        },
        disconnect(id) {
            assert([42, 43].includes(id));
            if (id === 43)
                state.onZoomChange = null;
            else
                state.onMenuChange = null;
        }
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
        'topBar/gradient.js': {
            default: class {
                configure(config, windowState) {
                    state.configurations.push(config);
                    state.reconciled.push(config, windowState);
                }
                destroy() {}
            }
        },
        'overview/workspaceBackground.js': {
            default: class {
                configure(enabled) { state.zoomConfigured.push(enabled); }
                destroy() { state.zoomDestroyed++; }
            }
        },
        'events/eventManager.js': {
            default: class {
                constructor(callbacks) { state.eventCallbacks = callbacks; this.onOverviewZoomChanged = callbacks.onOverviewZoomChanged; }
                configureOverviewZoom(enabled) { this.onOverviewZoomChanged(enabled); }
                configure(config) { state.reconciled.push(config); return state.windowState; }
                destroy() { state.eventsDestroyed++; }
            }
        },
        'config.js': {
            getConfig: target => ({ ...target }),
            TOP_BAR_STYLE_SETTINGS: 'top-bar-style-settings',
            OVERVIEW_SMOOTH_ZOOM: 'overview-smooth-zoom',
            isTopBarSettingsMenuEnabled: target => target.get_boolean('top-bar-style-settings'),
            attachSettingListener: (target, key, callback) => target.connect(`changed::${key}`, callback),
            attachSettingsListeners(_settings, callback) { state.onChange = callback; return []; },
            detachSettingsListeners(target, ids) { ids.forEach(id => target.disconnect(id)); }
        },
        ...extraStubs
    });
    const module = await load('extension.js');
    const extension = new module.namespace.default();
    extension.getSettings = () => settings;
    t.after(() => {
        if (state.onMenuChange)
            extension.disable();
        assert.equal(pending.size, 0, 'Fixture leaked a configuration timer');
        assert.equal(state.onMenuChange, null, 'Fixture leaked a menu subscription');
        assert.equal(state.onZoomChange, null, 'Fixture leaked a zoom subscription');
        assert.equal(state.menusCreated, state.menusDestroyed, 'Fixture leaked a menu');
    });
    return { extension, settings, pending, state, GLib };
};
