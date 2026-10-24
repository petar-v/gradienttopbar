import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    getConfig,
    STYLE_TRIGGER as STYLE_TRIGGER_KEY,
    PROXIMITY_DISTANCE,
    PROXIMITY_TRANSITION,
    TOP_BAR_STYLE_SETTINGS,
    attachSettingsListeners,
    detachSettingsListeners,
    getMaximizedBehavior,
    getStyleTrigger,
    setStyleTrigger,
    getProximityDistance,
    setProximityDistance,
    getProximityTransition,
    setProximityTransition
} from '../config.js';

import { createResetButton } from './components/resetButton.js';

import { MAXIMIZED_BEHAVIOR, STYLE_TRIGGER } from '../constants.js';

const PROXIMITY_DISTANCE_SAVE_DELAY_MS = 300;

const TriggerOption = GObject.registerClass(
    {
        Properties: {
            name: GObject.ParamSpec.string(
                'name',
                'name',
                'name',
                GObject.ParamFlags.READWRITE,
                null
            ),
            value: GObject.ParamSpec.string(
                'value',
                'value',
                'value',
                GObject.ParamFlags.READWRITE,
                null
            )
        }
    },
    class TriggerOptionObject extends GObject.Object {
        _init(name, value) {
            super._init({ name, value });
        }
    }
);

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
        settings.bind(TOP_BAR_STYLE_SETTINGS, styleSettingsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
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
            title: gettext('Trigger settings'),
            header_suffix: createResetButton(
                window,
                gettext('Reset trigger settings?'),
                gettext('Restore the default style trigger, proximity distance and transition behaviour.'),
                settings,
                [STYLE_TRIGGER_KEY, PROXIMITY_DISTANCE, PROXIMITY_TRANSITION],
                () => {
                    if (proximityDistanceTimeoutId) {
                        GLib.Source.remove(proximityDistanceTimeoutId);
                        proximityDistanceTimeoutId = null;
                    }
                    onSettingsChanged(settings);
                }
            )
        });

        const triggerModel = new Gio.ListStore({ item_type: TriggerOption });
        [
            new TriggerOption(gettext('Maximized windows'), STYLE_TRIGGER.MAXIMIZED),
            new TriggerOption(gettext('Proximity'), STYLE_TRIGGER.PROXIMITY)
        ].forEach(trigger => triggerModel.append(trigger));

        const triggerRow = new Adw.ComboRow({
            title: gettext('Style trigger'),
            subtitle: gettext('Choose when to change the top bar appearance'),
            model: triggerModel,
            expression: new Gtk.PropertyExpression(TriggerOption, null, 'name')
        });

        const proximityDistanceRow = new Adw.SpinRow({
            title: gettext('Proximity distance'),
            subtitle: gettext('Distance from the panel in pixels'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                page_increment: 5,
                value: getProximityDistance(this._settings)
            }),
            digits: 0
        });

        const proximityTransitionRow = new Adw.SwitchRow({
            title: gettext('Transition proximity style'),
            subtitle: gettext('Blend the alternate style as windows approach the panel'),
            active: getProximityTransition(this._settings)
        });

        // Set the selected item based on the current setting
        const setTriggerOnRow = (row, behaviorValue) => {
            const { model } = row;
            for (let i = 0; i < model.get_n_items(); i++) {
                if (model.get_item(i).value === behaviorValue) {
                    row.set_selected(i);
                    break;
                }
            }
        };

        // Set initial value
        setTriggerOnRow(triggerRow, getStyleTrigger(this._settings));
        const updateProximityControls = () => {
            const enabled = getMaximizedBehavior(this._settings) !== MAXIMIZED_BEHAVIOR.KEEP_GRADIENT;
            behaviorGroup.set_sensitive(enabled);
            disabledGroup.set_visible(!enabled);
            const usesProximity = getStyleTrigger(this._settings) === STYLE_TRIGGER.PROXIMITY;
            proximityDistanceRow.set_sensitive(usesProximity);
            proximityTransitionRow.set_sensitive(
                usesProximity &&
                getMaximizedBehavior(this._settings) === MAXIMIZED_BEHAVIOR.APPLY_STYLE
            );
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
        behaviorGroup.add(proximityTransitionRow);
        const disabledGroup = new Adw.PreferencesGroup({
            description: gettext('The main gradient is always shown. Choose “Use original theme” or “Use alternate gradient” in Appearance to enable these settings.')
        });
        this.add(disabledGroup);
        this.add(behaviorGroup);

        const onSettingsChanged = (s, key) => {
            const config = getConfig(s);
            updatingSettings = true;
            setTriggerOnRow(triggerRow, config.styleTrigger);
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
