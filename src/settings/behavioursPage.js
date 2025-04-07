import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    getConfig,
    attachSettingsListeners,
    detachSettingsListeners
} from '../config.js';

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

        // Create model for maximized behavior dropdown
        const maximizedBehaviorModel = new Gio.ListStore({
            item_type: MaximizedBehavior
        });

        [
            new MaximizedBehavior(gettext('Keep gradient'), 'keep-gradient'),
            new MaximizedBehavior(gettext('Keep original theme'), 'keep-theme'),
            new MaximizedBehavior(gettext('Apply style'), 'apply-style')
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
        setMaximizedBehaviorOnRow(maximizedBehaviorRow, this._settings.get_string('maximized-behavior'));

        // Connect to changes
        maximizedBehaviorRow.connect('notify::selected', () => {
            const { selectedItem } = maximizedBehaviorRow;
            settings.set_string('maximized-behavior', selectedItem.value);
        });

        behaviorGroup.add(maximizedBehaviorRow);
        this.add(behaviorGroup);

        const onSettingsChanged = s => {
            const config = getConfig(s);
            setMaximizedBehaviorOnRow(maximizedBehaviorRow, config.maximizedBehavior);
        };
        attachSettingsListeners(settings, onSettingsChanged);
        window.connect('close-request', () => {
            detachSettingsListeners(settings, onSettingsChanged);
        });
    }
}

const BehaviorPage = GObject.registerClass(Behavior);
export default BehaviorPage;
