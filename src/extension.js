import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { applyGradientStyle, toggleGradient, unloadGradientStylesheet } from './gradient.js';
import {
    getConfig,
    getMaximizedBehavior,
    getStyleTrigger,
    attachSettingsListeners,
    detachSettingsListeners
} from './config.js';
import { MAXIMIZED_BEHAVIOR, STYLE_TRIGGER } from './constants.js';

import WindowEvents from './events/windowEvents.js';
import MaximizedWindows from './events/behaviours/maximizedWindows.js';
import ProximityWindows from './events/behaviours/proximityWindows.js';

export default class GradientTopBar extends Extension {
    onSettingsChanged(settings) {
        const config = getConfig(settings);
        applyGradientStyle(config, this.path);

        const maximizedBehavior = getMaximizedBehavior(settings);
        this.windowEvents.setBehaviour(
            getStyleTrigger(settings) === STYLE_TRIGGER.PROXIMITY
                ? new ProximityWindows()
                : new MaximizedWindows()
        );


        // If set to keep-gradient, disable window events to save resources
        if (maximizedBehavior === MAXIMIZED_BEHAVIOR.KEEP_GRADIENT) {
            if (this.windowEvents)
                this.windowEvents.disable();
            // Always show the gradient when in keep-gradient mode
            this.toggleGradient(true, false);
            return;
        }

        this.windowEvents.enable();
        this.windowEvents.updateState(true);
    }

    toggleGradient(enabled, useAlternateStyle = false) {
        // this checks if the gradient state has changed
        // so we don't add classes multiple times.
        if (this.isEffectApplied === enabled && this.isAlternateStyleApplied === useAlternateStyle)
            return;

        toggleGradient(enabled, useAlternateStyle);
        this.isEffectApplied = enabled;
        this.isAlternateStyleApplied = useAlternateStyle;
    }

    setWindowStateCallback() {
        this.windowEvents.setStateChangeCallback(
            ({ triggerWindows, inOverview }) => {
                if (inOverview) {
                    this.toggleGradient(true, false);
                    return;
                }

                const hasTriggeredWindows = triggerWindows.size > 0;
                const maximizedBehavior = getMaximizedBehavior(this._settings);

                if (!hasTriggeredWindows) {
                    // No triggering windows, apply normal gradient
                    this.toggleGradient(true, false);
                    return;
                }
                // Handle the configured behavior for triggering windows
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
                        // Apply the alternate gradient style
                        this.toggleGradient(true, true);
                        break;
                }
            }
        );
    }

    enable() {
        this.isEffectApplied = false;
        this.isAlternateStyleApplied = false;
        this._settings = this.getSettings();
        this._settingsHandlerIds = attachSettingsListeners(
            this._settings,
            this.onSettingsChanged.bind(this)
        );

        this.windowEvents = new WindowEvents(
            global.display,
            global.window_manager,
            global.get_workspace_manager(),
            getStyleTrigger(this._settings) === STYLE_TRIGGER.PROXIMITY
                ? new ProximityWindows()
                : new MaximizedWindows()
        );
        this.setWindowStateCallback();

        const config = getConfig(this._settings);

        // Only initialize and enable window events if not using keep-gradient
        if (getMaximizedBehavior(this._settings) !== MAXIMIZED_BEHAVIOR.KEEP_GRADIENT)
            this.windowEvents.enable();

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
        unloadGradientStylesheet(this.path);
        detachSettingsListeners(this._settings, this._settingsHandlerIds);

        this.isEffectApplied = false;
        this._settingsHandlerIds = null;
        this._settings = null;
    }
}
