import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { applyGradientStyle, toggleGradient } from './gradient.js';
import {
    getConfig,
    attachSettingsListeners,
    detachSettingsListeners
} from './config.js';

import WindowEvents from './events/windowEvents.js';

export default class GradientTopBar extends Extension {
    constructor(metadata) {
        super(metadata);

        // gradient state
        this.isEffectApplied = false;
        this.windowEvents = null;

        this.onSettingsChanged = settings => {
            const config = getConfig(settings);
            applyGradientStyle(config, this.path);

            const { isOpaqueOnMaximized } = config;

            if (isOpaqueOnMaximized) {
                this.windowEvents.enable();
            } else {
                this.windowEvents.disable();
                this.toggleGradient(true);
            }
        };
    }

    toggleGradient(enabled) {
    // this checks if the gradient is currently applied
    // or not so we don't add classes multiple times.
    // The effect is applied if there is no maximized window
    // if the respective setting is applied.
        if (this.isEffectApplied === enabled)
            return;

        toggleGradient(enabled);
        this.isEffectApplied = enabled;
    }

    enable() {
        this._settings = this.getSettings();
        this.windowEvents = new WindowEvents(
            global.display,
            global.window_manager,
            global.get_workspace_manager()
        );
        this.windowEvents.setStateChangeCallback(
            ({ maximizedWindows, currentWorkspace, inOverview }) => {
                if (inOverview) {
                    this.toggleGradient(true);
                    return;
                }

                const workspaceDisplayMaximizedWindows = currentWorkspace
          .list_windows()
          // filter windows only on the primary monitor
          .filter(
              window =>
                  window.get_monitor() === global.display.get_primary_monitor()
          ) // TODO: or is_on_primary_monitor()
          // filter maximized windows on the primary monitor
          .filter(window => maximizedWindows.has(window.get_id()));
                this.toggleGradient(workspaceDisplayMaximizedWindows.length === 0);
            }
        );

        attachSettingsListeners(this._settings, this.onSettingsChanged);

        const config = getConfig(this._settings);
        const { isOpaqueOnMaximized } = config;
        if (isOpaqueOnMaximized)
            this.windowEvents.enable();

        // initially set up the gradient
        applyGradientStyle(config, this.path);
        this.toggleGradient(true);
    }

    disable() {
        this.windowEvents.disable();
        this.toggleGradient(false);
        detachSettingsListeners(this._settings, this.onSettingsChanged);
        this.windowEvents = null;
        this.isEffectApplied = false;
        this._settings = null;
    }
}
