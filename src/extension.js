import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { applyGradientStyle, unloadGradientStylesheet } from './gradient.js';
import {
    getConfig,
    attachSettingsListeners,
    detachSettingsListeners
} from './config.js';
import { MAXIMIZED_BEHAVIOR, STYLE_TRIGGER } from './constants.js';

import WindowEvents from './events/windowEvents.js';
import MaximizedWindows from './events/behaviours/maximizedWindows.js';
import ProximityWindows from './events/behaviours/proximityWindows.js';
import DiscreteEffect from './effects/discreteEffect.js';
import ProgressiveEffect from './effects/progressiveEffect.js';

export default class GradientTopBar extends Extension {
    configure(settings) {
        const config = getConfig(settings);
        applyGradientStyle(config, this.path);

        const behaviourDetector = config.styleTrigger === STYLE_TRIGGER.PROXIMITY
            ? new ProximityWindows(settings)
            : new MaximizedWindows();
        const effect =
            config.styleTrigger === STYLE_TRIGGER.PROXIMITY &&
            config.proximityTransition &&
            config.maximizedBehavior === MAXIMIZED_BEHAVIOR.APPLY_STYLE
                ? new ProgressiveEffect()
                : new DiscreteEffect(config.maximizedBehavior);

        this.effect?.destroy();
        this.effect = effect;
        this.windowEvents.setBehaviourDetector(behaviourDetector);

        if (config.maximizedBehavior === MAXIMIZED_BEHAVIOR.KEEP_GRADIENT) {
            this.windowEvents.disable();
            this.effect.apply(0);
            return;
        }

        this.windowEvents.enable();
        this.windowEvents.updateState(true);
    }

    setWindowStateCallback() {
        this.windowEvents.setStateChangeCallback(
            ({ effectStrength }) => this.effect.apply(effectStrength)
        );
    }

    enable() {
        this._settings = this.getSettings();
        this.effect = null;
        this.windowEvents = new WindowEvents(
            global.display,
            global.window_manager,
            global.get_workspace_manager()
        );
        this.setWindowStateCallback();

        this._settingsHandlerIds = attachSettingsListeners(
            this._settings,
            this.configure.bind(this)
        );
        this.configure(this._settings);
    }

    disable() {
        if (this.windowEvents) {
            this.windowEvents.disable();
            this.windowEvents = null;
        }

        this.effect?.destroy();
        this.effect = null;
        unloadGradientStylesheet(this.path);
        detachSettingsListeners(this._settings, this._settingsHandlerIds);

        this._settingsHandlerIds = null;
        this._settings = null;
    }
}
