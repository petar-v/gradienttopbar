import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import GLib from 'gi://GLib';
import { overview } from 'resource:///org/gnome/shell/ui/main.js';
import {
    applyGradientStyle,
    applyOverviewStyle,
    removeGradientTransition,
    unloadGradientStylesheet
} from './gradient.js';
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

const SETTINGS_DEBOUNCE_MS = 500;

export default class GradientTopBar extends Extension {
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
        this._overviewBehavior = config.overviewBehavior;
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

        if (config.maximizedBehavior === MAXIMIZED_BEHAVIOR.KEEP_GRADIENT)
            this.windowEvents.disable();
        else
            this.windowEvents.enable();

        this.updateOverview();
    }

    updateOverview() {
        // A desktop swipe overlay must not outlive an overview or settings change.
        this.windowEvents.detachWorkspaceTransitionEvents();
        removeGradientTransition();
        if (overview.visibleTarget)
            applyOverviewStyle(this._overviewBehavior);
        else if (this.windowEvents.enabled)
            this.windowEvents.updateState(true);
        else
            this.effect.apply(0);
    }

    setWindowStateCallback() {
        this.windowEvents.setStateChangeCallback(state => {
            if (overview.visibleTarget)
                return;

            if (state.workspaceTransition === 'progress') {
                this.effect.scrub(
                    state.startEffectStrength,
                    state.endEffectStrength,
                    state.transitionProgress
                );
                return;
            }

            if (state.workspaceTransition === 'complete') {
                this.effect.settle(state.effectStrength);
                return;
            }

            this.effect.apply(state.effectStrength);
        });
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
        this._overviewHandlerIds = ['showing', 'hiding'].map(signal =>
            overview.connect(signal, () => this.updateOverview()));

        this._settingsHandlerIds = attachSettingsListeners(
            this._settings,
            this.scheduleConfigure.bind(this)
        );
        this.configure(this._settings);
    }

    disable() {
        this._overviewHandlerIds.forEach(id => overview.disconnect(id));
        this._overviewHandlerIds = null;
        if (this._configureTimeoutId) {
            GLib.Source.remove(this._configureTimeoutId);
            this._configureTimeoutId = null;
        }

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
