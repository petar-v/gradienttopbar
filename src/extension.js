import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import GLib from 'gi://GLib';
import Gradient from './gradient/gradient.js';
import {
    getConfig,
    isTopBarSettingsMenuEnabled,
    attachSettingListener,
    TOP_BAR_STYLE_SETTINGS,
    attachSettingsListeners,
    detachSettingsListeners
} from './config.js';
import EventManager from './events/eventManager.js';
import TopBarMenu from './topBarMenu.js';
import { diagnostics, measureWork } from './diagnostics.js';

const SETTINGS_DEBOUNCE_MS = 500;

export default class GradientTopBar extends Extension {
    #settings;
    #configureTimeoutId;
    #topBarMenu;
    #topBarMenuHandlerId;
    #settingsHandlerIds;
    #events;
    #gradient;
    #config;

    #updateTopBarMenu() {
        if (isTopBarSettingsMenuEnabled(this.#settings)) {
            this.#topBarMenu ??= new TopBarMenu(() => this.openPreferences());
        } else {
            this.#topBarMenu?.destroy();
            this.#topBarMenu = null;
        }
    }

    #scheduleConfigure() {
        if (this.#configureTimeoutId)
            GLib.Source.remove(this.#configureTimeoutId);

        this.#configureTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SETTINGS_DEBOUNCE_MS, measureWork('Work', 'Apply settings', () => {
            this.#configureTimeoutId = null;
            this.#configure(this.#settings);
            return GLib.SOURCE_REMOVE;
        }));
    }

    #configure(settings) {
        const config = getConfig(settings);
        const state = this.#events.configure(config);
        try {
            this.#gradient.configure(config, state);
            this.#config = config;
        } catch (error) {
            if (this.#config)
                this.#events.configure(this.#config);
            throw error;
        }
    }

    enable() {
        diagnostics?.start();
        this.#settings = this.getSettings();
        this.#topBarMenuHandlerId = attachSettingListener(
            this.#settings, TOP_BAR_STYLE_SETTINGS, () => this.#updateTopBarMenu()
        );
        this.#updateTopBarMenu();
        this.#gradient = new Gradient(isOverviewCleanupNeeded => this.#events?.setOverviewCleanupNeeded(isOverviewCleanupNeeded));
        this.#events = new EventManager({
            onWindowChanged: measureWork('Renderer', 'Window changed', (state, isWorkspaceChanged) => this.#gradient.updateWindow(state, isWorkspaceChanged)),
            onWindowProgress: measureWork('Renderer', 'Window progress', state => this.#gradient.followWindow(state)),
            onWorkspaceProgress: measureWork('Renderer', 'Workspace progress', transition => this.#gradient.updateWorkspaceProgress(transition)),
            onWorkspaceCompleted: measureWork('Renderer', 'Workspace completed', state => this.#gradient.completeWorkspace(state)),
            onOverviewChanged: measureWork('Renderer', 'Overview changed', state => this.#gradient.updateOverview(state))
        });

        this.#settingsHandlerIds = attachSettingsListeners(
            this.#settings,
            this.#scheduleConfigure.bind(this)
        );
        this.#configure(this.#settings);
    }

    disable() {
        this.#events.destroy();
        this.#events = null;

        this.#gradient.destroy();
        this.#gradient = null;
        this.#config = null;

        detachSettingsListeners(this.#settings, [this.#topBarMenuHandlerId]);

        this.#topBarMenuHandlerId = null;
        this.#topBarMenu?.destroy();
        this.#topBarMenu = null;

        if (this.#configureTimeoutId) {
            GLib.Source.remove(this.#configureTimeoutId);
            this.#configureTimeoutId = null;
        }

        detachSettingsListeners(this.#settings, this.#settingsHandlerIds);

        this.#settingsHandlerIds = null;
        this.#settings = null;
        diagnostics?.stop();
    }
}
