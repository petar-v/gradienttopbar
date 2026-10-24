import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import GLib from 'gi://GLib';
import { overview } from 'resource:///org/gnome/shell/ui/main.js';
import Gradient from './gradient/gradient.js';
import {
    getConfig,
    getTopBarStyleSettings,
    attachSettingListener,
    TOP_BAR_STYLE_SETTINGS,
    attachSettingsListeners,
    detachSettingsListeners
} from './config.js';
import { MAXIMIZED_BEHAVIOR, STYLE_TRIGGER } from './constants.js';

import WindowEvents from './events/windowEvents.js';
import OverviewEvents from './events/overviewEvents.js';
import MaximizedWindows from './events/behaviours/maximizedWindows.js';
import ProximityWindows from './events/behaviours/proximityWindows.js';
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

        const behaviourDetector = config.styleTrigger === STYLE_TRIGGER.PROXIMITY
            ? new ProximityWindows(settings)
            : new MaximizedWindows();
        this.windowEvents.setBehaviourDetector(behaviourDetector);

        if (config.maximizedBehavior === MAXIMIZED_BEHAVIOR.KEEP_GRADIENT)
            this.windowEvents.disable();
        else
            this.windowEvents.enable();

        this.updateOverview();
    }

    updateOverview() {
        this.windowEvents.detachWorkspaceTransitionEvents();
        const { progress, hidden } = this.overviewEvents;
        const strength = this.windowEvents.enabled ? this.windowEvents.getEffectStrength() : 0;
        this.gradient.updateOverview({ progress, hidden, target: overview.visibleTarget }, strength);
    }

    enable() {
        this._settings = this.getSettings();
        this._topBarMenuHandlerId = attachSettingListener(
            this._settings, TOP_BAR_STYLE_SETTINGS, () => this.updateTopBarMenu()
        );
        this.updateTopBarMenu();
        this.gradient = new Gradient(this.path);
        this.windowEvents = new WindowEvents(
            global.display,
            global.window_manager,
            global.get_workspace_manager()
        );
        this.windowEvents.setStateChangeCallback(state => this.gradient.updateWindow(state));
        this.overviewEvents = new OverviewEvents(() => this.updateOverview());

        this._settingsHandlerIds = attachSettingsListeners(
            this._settings,
            this.scheduleConfigure.bind(this)
        );
        this.configure(this._settings);
    }

    disable() {
        this.gradient.destroy();
        this.gradient = null;
        this.overviewEvents.destroy();
        this.overviewEvents = null;

        detachSettingsListeners(this._settings, [this._topBarMenuHandlerId]);

        this._topBarMenuHandlerId = null;
        this._topBarMenu?.destroy();
        this._topBarMenu = null;

        if (this._configureTimeoutId) {
            GLib.Source.remove(this._configureTimeoutId);
            this._configureTimeoutId = null;
        }

        if (this.windowEvents) {
            this.windowEvents.disable();
            this.windowEvents = null;
        }

        detachSettingsListeners(this._settings, this._settingsHandlerIds);

        this._settingsHandlerIds = null;
        this._settings = null;
    }
}
