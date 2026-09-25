import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    getConfig,
    attachSettingsListeners,
    detachSettingsListeners,
    getMaximizedBehavior,
    setMaximizedBehavior,
    getStyleTrigger,
    setStyleTrigger,
    getProximityDistance,
    setProximityDistance,
    getProximityTransition,
    setProximityTransition
} from '../config.js';

import { MAXIMIZED_BEHAVIOR, STYLE_TRIGGER } from '../constants.js';

const MaximizedBehavior = GObject.registerClass(
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
    class MaximizedBehavior extends GObject.Object {
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

        const behaviorGroup = new Adw.PreferencesGroup({
            title: gettext('Behavior')
        });

        const triggerModel = new Gio.ListStore({ item_type: MaximizedBehavior });
        [
            new MaximizedBehavior(gettext('Maximized windows'), STYLE_TRIGGER.MAXIMIZED),
            new MaximizedBehavior(gettext('Proximity'), STYLE_TRIGGER.PROXIMITY)
        ].forEach(trigger => triggerModel.append(trigger));

        const triggerRow = new Adw.ComboRow({
            title: gettext('Style trigger'),
            subtitle: gettext('Choose when to apply the alternate top bar behavior'),
            model: triggerModel,
            expression: new Gtk.PropertyExpression(MaximizedBehavior, null, 'name')
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

        // Create model for maximized behavior dropdown
        const maximizedBehaviorModel = new Gio.ListStore({
            item_type: MaximizedBehavior
        });

        [
            new MaximizedBehavior(gettext('Keep gradient'), MAXIMIZED_BEHAVIOR.KEEP_GRADIENT),
            new MaximizedBehavior(gettext('Keep original theme'), MAXIMIZED_BEHAVIOR.KEEP_THEME),
            new MaximizedBehavior(gettext('Apply style'), MAXIMIZED_BEHAVIOR.APPLY_STYLE)
        ].forEach(behavior => maximizedBehaviorModel.append(behavior));

        // Create dropdown for maximized behavior
        const maximizedBehaviorRow = new Adw.ComboRow({
            title: gettext('When triggered'),
            subtitle: gettext(
                'Choose what style to apply to the top bar'
            ),
            model: maximizedBehaviorModel,
            expression: new Gtk.PropertyExpression(MaximizedBehavior, null, 'name')
        });

        // Set the selected item based on the current setting
        const setMaximizedBehaviorOnRow = (row, behaviorValue) => {
            const { model } = row;
            for (let i = 0; i < model.get_n_items(); i++) {
                if (model.get_item(i).value === behaviorValue) {
                    row.set_selected(i);
                    break;
                }
            }
        };

        // Set initial value
        setMaximizedBehaviorOnRow(maximizedBehaviorRow, getMaximizedBehavior(this._settings));
        setMaximizedBehaviorOnRow(triggerRow, getStyleTrigger(this._settings));
        proximityDistanceRow.set_sensitive(
            getStyleTrigger(this._settings) === STYLE_TRIGGER.PROXIMITY
        );
        const updateProximityControls = () => {
            const usesProximity = getStyleTrigger(this._settings) === STYLE_TRIGGER.PROXIMITY;
            proximityDistanceRow.set_sensitive(usesProximity);
            proximityTransitionRow.set_sensitive(
                usesProximity &&
                getMaximizedBehavior(this._settings) === MAXIMIZED_BEHAVIOR.APPLY_STYLE
            );
        };
        updateProximityControls();

        // Connect to changes
        maximizedBehaviorRow.connect('notify::selected', () => {
            const { selectedItem } = maximizedBehaviorRow;
            setMaximizedBehavior(this._settings, selectedItem.value);
        });
        triggerRow.connect('notify::selected', () => {
            setStyleTrigger(this._settings, triggerRow.selectedItem.value);
        });
        proximityDistanceRow.connect('notify::value', () => {
            setProximityDistance(this._settings, Math.round(proximityDistanceRow.value));
        });
        proximityTransitionRow.connect('notify::active', () => {
            setProximityTransition(this._settings, proximityTransitionRow.active);
        });

        behaviorGroup.add(triggerRow);
        behaviorGroup.add(proximityDistanceRow);
        behaviorGroup.add(proximityTransitionRow);
        behaviorGroup.add(maximizedBehaviorRow);
        this.add(behaviorGroup);

        const onSettingsChanged = s => {
            const config = getConfig(s);
            setMaximizedBehaviorOnRow(maximizedBehaviorRow, config.maximizedBehavior);
            setMaximizedBehaviorOnRow(triggerRow, config.styleTrigger);
            proximityDistanceRow.set_value(config.proximityDistance);
            proximityTransitionRow.set_active(config.proximityTransition);
            updateProximityControls();
        };
        const settingsHandlerIds = attachSettingsListeners(settings, onSettingsChanged);
        window.connect('close-request', () => {
            detachSettingsListeners(settings, settingsHandlerIds);
        });
    }
}

const BehaviorPage = GObject.registerClass(Behavior);
export default BehaviorPage;
