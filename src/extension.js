import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import GLib from 'gi://GLib';
import Gradient from './gradient/gradient.js';
import {
    getConfig,
    getTopBarStyleSettings,
    attachSettingListener,
    TOP_BAR_STYLE_SETTINGS,
    attachSettingsListeners,
    detachSettingsListeners
} from './config.js';
import EventManager from './events/eventManager.js';
import TopBarMenu from './topBarMenu.js';

const SETTINGS_DEBOUNCE_MS = 500;

export default class GradientTopBar extends Extension {
    updateTopBarMenu() {
        if (getTopBarStyleSettings(this._settings)) {
            this._topBarMenu ??= new TopBarMenu(() => this.openPreferences());
        } else {
            this._topBarMenu?.destroy();
            this._topBarMenu = null;
        }
    }

    scheduleConfigure() {
        if (this._configureTimeoutId)
            GLib.Source.remove(this._configureTimeoutId);

        this._configureTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SETTINGS_DEBOUNCE_MS, () => {
            this._configureTimeoutId = null;
            this.configure(this._settings);
            return GLib.SOURCE_REMOVE;
        });
    }

    configure(settings) {
        const config = getConfig(settings);
        this.gradient.configure(config);

        this.events.configure(config, settings);
    }

    enable() {
        this._settings = this.getSettings();
        this._topBarMenuHandlerId = attachSettingListener(
            this._settings, TOP_BAR_STYLE_SETTINGS, () => this.updateTopBarMenu()
        );
        this.updateTopBarMenu();
        this.gradient = new Gradient(this.path);
        this.events = new EventManager(
            state => this.gradient.updateWindow(state),
            (state, strength) => this.gradient.updateOverview(state, strength)
        );

        this._settingsHandlerIds = attachSettingsListeners(
            this._settings,
            this.scheduleConfigure.bind(this)
        );
        this.configure(this._settings);
    }

    disable() {
        this.events.destroy();
        this.events = null;

        this.gradient.destroy();
        this.gradient = null;

        detachSettingsListeners(this._settings, [this._topBarMenuHandlerId]);

        this._topBarMenuHandlerId = null;
        this._topBarMenu?.destroy();
        this._topBarMenu = null;

        if (this._configureTimeoutId) {
            GLib.Source.remove(this._configureTimeoutId);
            this._configureTimeoutId = null;
        }

        detachSettingsListeners(this._settings, this._settingsHandlerIds);

        this._settingsHandlerIds = null;
        this._settings = null;
    }
}
