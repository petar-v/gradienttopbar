import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { applyGradientStyle, toggleGradient } from './gradient.js';
import {
    getConfig,
    getMaximizedBehavior,
    attachSettingsListeners,
    detachSettingsListeners
} from './config.js';
import { MAXIMIZED_BEHAVIOR } from './constants.js';

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

            const maximizedBehavior = getMaximizedBehavior(settings);

            // If set to keep-gradient, disable window events to save resources
            if (maximizedBehavior === MAXIMIZED_BEHAVIOR.KEEP_GRADIENT) {
                if (this.windowEvents)
                    this.windowEvents.disable();
                // Always show the gradient when in keep-gradient mode
                this.toggleGradient(true, false);
                return;
            }

            // For other behaviors, we need to track window states
            if (!this.windowEvents) {
                // If window events were not initialized, initialize them now
                this.initializeWindowEvents();
            }
            this.windowEvents.enable();
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

    initializeWindowEvents() {
        if (!this.windowEvents) {
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
                    const maximizedBehavior = getMaximizedBehavior(this._settings);

                    if (hasMaximizedWindows) {
                        // Handle different behaviors for maximized windows
                        switch (maximizedBehavior) {
                            case MAXIMIZED_BEHAVIOR.KEEP_GRADIENT:
                                // Keep the normal gradient
                                this.toggleGradient(true, false);
                                break;
                            case MAXIMIZED_BEHAVIOR.KEEP_THEME:
                                // Remove the gradient to show the default theme
                                this.toggleGradient(false, false);
                                break;
                            case MAXIMIZED_BEHAVIOR.APPLY_STYLE:
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
        }
    }

    enable() {
        this._settings = this.getSettings();
        attachSettingsListeners(this._settings, this.onSettingsChanged);

        const config = getConfig(this._settings);

        // Only initialize and enable window events if not using keep-gradient
        if (getMaximizedBehavior(this._settings) !== MAXIMIZED_BEHAVIOR.KEEP_GRADIENT) {
            this.initializeWindowEvents();
            this.windowEvents.enable();
        }

        // initially set up the gradient
        applyGradientStyle(config, this.path);
        this.toggleGradient(true, false);
    }

    disable() {
        if (this.windowEvents) {
            this.windowEvents.disable();
            this.windowEvents = null;
        }

        this.toggleGradient(false);
        detachSettingsListeners(this._settings, this.onSettingsChanged);

        this.isEffectApplied = false;
        this._settings = null;
    }
}
