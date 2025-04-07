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
        this.hasMaximizedWindows = false;
        this.windowEvents = null;

        this.onSettingsChanged = settings => {
            const config = getConfig(settings);
            applyGradientStyle(config, this.path);

            // Always enable window events to track maximized windows
            this.windowEvents.enable();

            // Force update to apply the current behavior
            this.windowEvents.forceStateUpdate();
        };
    }

    toggleGradient(enabled, hasMaximizedWindows = false) {
    // this checks if the gradient state has changed
    // so we don't add classes multiple times.
        if (this.isEffectApplied === enabled && this.hasMaximizedWindows === hasMaximizedWindows)
            return;

        toggleGradient(enabled, hasMaximizedWindows);
        this.isEffectApplied = enabled;
        this.hasMaximizedWindows = hasMaximizedWindows;
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
                    this.toggleGradient(true, false);
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

                const hasMaximizedWindows = workspaceDisplayMaximizedWindows.length > 0;
                const maximizedBehavior = this._settings.get_string('maximized-behavior');

                if (hasMaximizedWindows) {
                    // Handle different behaviors for maximized windows
                    switch (maximizedBehavior) {
                        case 'keep-gradient':
                            // Keep the normal gradient
                            this.toggleGradient(true, false);
                            break;
                        case 'keep-theme':
                            // Remove the gradient to show the default theme
                            this.toggleGradient(false, false);
                            break;
                        case 'apply-style':
                            // Apply the maximized gradient style
                            this.toggleGradient(true, true);
                            break;
                    }
                } else {
                    // No maximized windows, apply normal gradient
                    this.toggleGradient(true, false);
                }
            }
        );

        attachSettingsListeners(this._settings, this.onSettingsChanged);

        const config = getConfig(this._settings);

        // Always enable window events to track maximized windows
        this.windowEvents.enable();

        // initially set up the gradient
        applyGradientStyle(config, this.path);
        this.toggleGradient(true, false);
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
