import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    getConfig,
    getSettingRange,
    bindSetting,
    setProximityDistance,
    setStyleTrigger,
    setProximityTransition,
    STYLE_TRIGGER as STYLE_TRIGGER_KEY,
    PROXIMITY_DISTANCE,
    PROXIMITY_TRANSITION,
    OVERVIEW_TRANSITION,
    TOP_BAR_STYLE_SETTINGS,
    attachSettingsListeners,
    detachSettingsListeners,
    getMaximizedBehavior,
    getStyleTrigger,
    getProximityDistance,
    getProximityTransition
} from '../config.js';

import { createResetButton } from './components/resetButton.js';
import { ChoiceOption, selectRowValue } from './components/choiceOption.js';

import { MAXIMIZED_BEHAVIOR, STYLE_TRIGGER } from '../constants.js';

const PROXIMITY_DISTANCE_SAVE_DELAY_MS = 300;

class Behavior extends Adw.PreferencesPage {
    _init(window, settings) {
        super._init({
            title: gettext('Behaviour'),
            icon_name: 'system-run-symbolic',
            name: 'Behavior'
        });

        this._settings = settings;
        const panelGroup = new Adw.PreferencesGroup({ title: gettext('Top bar') });
        const styleSettingsRow = new Adw.SwitchRow({
            title: gettext('Top Bar Style Settings'),
            subtitle: gettext('Show settings when right-clicking empty space on the top bar. Replaces right-click window dragging; left-click dragging remains available.')
        });
        bindSetting(settings, TOP_BAR_STYLE_SETTINGS, styleSettingsRow, 'active');
        panelGroup.add(styleSettingsRow);
        this.add(panelGroup);

        let proximityDistanceTimeoutId = null;
        let updatingSettings = false;

        const commitProximityDistance = () => {
            if (proximityDistanceTimeoutId) {
                GLib.Source.remove(proximityDistanceTimeoutId);
                proximityDistanceTimeoutId = null;
            }

            const value = Math.round(proximityDistanceRow.value);
            if (value !== getProximityDistance(this._settings))
                setProximityDistance(this._settings, value);
        };

        const scheduleProximityDistanceSave = () => {
            if (proximityDistanceTimeoutId) {
                GLib.Source.remove(proximityDistanceTimeoutId);
                proximityDistanceTimeoutId = null;
            }

            const value = Math.round(proximityDistanceRow.value);
            if (value === getProximityDistance(this._settings))
                return;

            proximityDistanceTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                PROXIMITY_DISTANCE_SAVE_DELAY_MS,
                () => {
                    proximityDistanceTimeoutId = null;
                    setProximityDistance(this._settings, value);
                    return GLib.SOURCE_REMOVE;
                }
            );
        };

        const behaviorGroup = new Adw.PreferencesGroup({
            title: gettext('Window interaction'),
            header_suffix: createResetButton(
                window,
                gettext('Reset window interaction?'),
                gettext('Restore the default window trigger and proximity distance.'),
                settings,
                [STYLE_TRIGGER_KEY, PROXIMITY_DISTANCE],
                () => {
                    if (proximityDistanceTimeoutId) {
                        GLib.Source.remove(proximityDistanceTimeoutId);
                        proximityDistanceTimeoutId = null;
                    }
                    onSettingsChanged(settings);
                }
            )
        });

        const triggerModel = new Gio.ListStore({ item_type: ChoiceOption });
        [
            new ChoiceOption(gettext('Maximized windows'), STYLE_TRIGGER.MAXIMIZED),
            new ChoiceOption(gettext('Nearby windows'), STYLE_TRIGGER.PROXIMITY)
        ].forEach(trigger => triggerModel.append(trigger));

        const triggerRow = new Adw.ComboRow({
            title: gettext('Change appearance when'),
            model: triggerModel,
            expression: new Gtk.PropertyExpression(ChoiceOption, null, 'name')
        });

        const [minDistance, maxDistance] = getSettingRange(settings, PROXIMITY_DISTANCE);
        const proximityDistanceRow = new Adw.SpinRow({
            title: gettext('Proximity distance'),
            subtitle: gettext('Distance from the panel in pixels'),
            adjustment: new Gtk.Adjustment({
                lower: minDistance,
                upper: maxDistance,
                step_increment: 1,
                page_increment: 5,
                value: getProximityDistance(this._settings)
            }),
            digits: 0
        });

        const proximityTransitionRow = new Adw.SwitchRow({
            title: gettext('Blend as windows approach'),
            subtitle: gettext('Gradually blend into the selected appearance as windows approach the panel.'),
            active: getProximityTransition(this._settings)
        });

        // Set initial value
        selectRowValue(triggerRow, getStyleTrigger(this._settings));
        const updateProximityControls = () => {
            const enabled = getMaximizedBehavior(this._settings) !== MAXIMIZED_BEHAVIOR.KEEP_GRADIENT;
            behaviorGroup.set_sensitive(enabled);
            disabledGroup.set_visible(!enabled);
            const usesProximity = getStyleTrigger(this._settings) === STYLE_TRIGGER.PROXIMITY;
            proximityDistanceRow.set_sensitive(usesProximity);
            proximityTransitionRow.set_sensitive(enabled && usesProximity);
        };

        // Connect to changes
        triggerRow.connect('notify::selected', () => {
            if (!updatingSettings)
                setStyleTrigger(this._settings, triggerRow.selectedItem.value);
        });
        proximityDistanceRow.connect('notify::value', () => {
            if (!updatingSettings)
                scheduleProximityDistanceSave();
        });
        proximityTransitionRow.connect('notify::active', () => {
            if (!updatingSettings)
                setProximityTransition(this._settings, proximityTransitionRow.active);
        });

        behaviorGroup.add(triggerRow);
        behaviorGroup.add(proximityDistanceRow);
        const disabledGroup = new Adw.PreferencesGroup({
            description: gettext('Outside overview, the main gradient is always shown. Choose “Use original theme” or “Use alternate gradient” under Window interaction in Gradients to enable these settings.')
        });
        this.add(disabledGroup);
        this.add(behaviorGroup);

        const transitionsGroup = new Adw.PreferencesGroup({
            title: gettext('Transitions'),
            header_suffix: createResetButton(
                window,
                gettext('Reset transitions?'),
                gettext('Restore the default window proximity and overview gesture blending.'),
                settings,
                [PROXIMITY_TRANSITION, OVERVIEW_TRANSITION]
            )
        });
        transitionsGroup.add(proximityTransitionRow);
        const overviewTransitionRow = new Adw.SwitchRow({
            title: gettext('Blend with overview gestures'),
            subtitle: gettext('Gradually blend between backgrounds as you open or close overview.')
        });
        bindSetting(settings, OVERVIEW_TRANSITION, overviewTransitionRow, 'active');
        transitionsGroup.add(overviewTransitionRow);
        this.add(transitionsGroup);

        const onSettingsChanged = (s, key) => {
            const config = getConfig(s);
            updatingSettings = true;
            selectRowValue(triggerRow, config.styleTrigger);
            if (!key || key === 'proximity-distance') {
                if (proximityDistanceTimeoutId) {
                    GLib.Source.remove(proximityDistanceTimeoutId);
                    proximityDistanceTimeoutId = null;
                }
                proximityDistanceRow.set_value(config.proximityDistance);
            }
            proximityTransitionRow.set_active(config.proximityTransition);
            updatingSettings = false;
            updateProximityControls();
        };
        onSettingsChanged(settings);
        const settingsHandlerIds = attachSettingsListeners(settings, onSettingsChanged);
        window.connect('close-request', () => {
            commitProximityDistance();
            detachSettingsListeners(settings, settingsHandlerIds);
        });
    }
}

const BehaviorPage = GObject.registerClass(Behavior);
export default BehaviorPage;
