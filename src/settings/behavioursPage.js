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
    setMaximizedBehavior
} from '../config.js';

import { MAXIMIZED_BEHAVIOR } from '../constants.js';

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

const MaximizationType = GObject.registerClass(
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
    class MaximizationType extends GObject.Object {
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
            title: gettext('When windows are maximized'),
            subtitle: gettext(
                'Choose what style to apply to the top bar when there is a maximized window'
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

        // Create a group for maximization detection settings
        const maximizationDetectionGroup = new Adw.PreferencesGroup({
            title: gettext('Maximization Detection')
        });

        // Create model for maximization type dropdown
        const maximizationTypeModel = new Gio.ListStore({
            item_type: MaximizationType
        });

        [
            new MaximizationType(gettext('Both horizontally and vertically'), 'both'),
            new MaximizationType(gettext('Vertically only'), 'vertical'),
            new MaximizationType(gettext('Horizontally only'), 'horizontal'),
            new MaximizationType(gettext('Any of these'), 'any')
        ].forEach(type => maximizationTypeModel.append(type));

        // Create dropdown for maximization type
        const maximizationTypeRow = new Adw.ComboRow({
            title: gettext('Definition of a maximized window'),
            subtitle: gettext(
                'Choose what constitutes a maximized window for the extension'
            ),
            model: maximizationTypeModel,
            expression: new Gtk.PropertyExpression(MaximizationType, null, 'name')
        });

        // Set the selected item based on the current setting
        const setMaximizationTypeOnRow = (row, typeValue) => {
            const { model } = row;
            for (let i = 0; i < model.get_n_items(); i++) {
                if (model.get_item(i).value === typeValue) {
                    row.set_selected(i);
                    break;
                }
            }
        };

        // Set initial value
        setMaximizationTypeOnRow(maximizationTypeRow, this._settings.get_string('maximization-type'));

        // Function to update the sensitivity of maximization detection settings
        const updateMaximizationDetectionSensitivity = () => {
            const maximizedBehavior = settings.get_string('maximized-behavior');
            // Only enable the maximization detection settings if we're not using 'keep-gradient'
            const needsMaximizationDetection = maximizedBehavior !== 'keep-gradient';

            // Keep the group visible but set sensitivity based on the setting
            maximizationDetectionGroup.set_sensitive(needsMaximizationDetection);
        };

        // Set initial sensitivity
        updateMaximizationDetectionSensitivity();

        // Connect to changes in maximized behavior
        maximizedBehaviorRow.connect('notify::selected', () => {
            const { selectedItem } = maximizedBehaviorRow;
            setMaximizedBehavior(this._settings, selectedItem.value);
        });

        // Listen for changes to maximized-behavior setting
        settings.connect('changed::maximized-behavior', updateMaximizationDetectionSensitivity);

        // Connect to changes in maximization type
        maximizationTypeRow.connect('notify::selected', () => {
            const { selectedItem } = maximizationTypeRow;
            settings.set_string('maximization-type', selectedItem.value);
        });

        // Add rows to groups
        behaviorGroup.add(maximizedBehaviorRow);
        maximizationDetectionGroup.add(maximizationTypeRow);

        // Add groups to page
        this.add(behaviorGroup);
        this.add(maximizationDetectionGroup);

        const onSettingsChanged = s => {
            const config = getConfig(s);
            setMaximizedBehaviorOnRow(maximizedBehaviorRow, config.maximizedBehavior);
            setMaximizationTypeOnRow(maximizationTypeRow, config.maximizationType);
            updateMaximizationDetectionSensitivity();
        };
        attachSettingsListeners(settings, onSettingsChanged);
        window.connect('close-request', () => {
            detachSettingsListeners(settings, onSettingsChanged);
        });
    }
}

const BehaviorPage = GObject.registerClass(Behavior);
export default BehaviorPage;
