import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import {
    gettext
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';


class Behavior extends Adw.PreferencesPage {
    _init(settings) {
        super._init({
            title: gettext('Behaviour'),
            icon_name: 'system-run-symbolic',
            name: 'Behavior'
        });

        this._settings = settings;

        const behaviorGroup = new Adw.PreferencesGroup({
            title: gettext('Behavior')
        });

        let opaqueOnMaximizedSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this._settings.get_boolean('opaque-on-maximized')
        });
        settings.bind(
            'opaque-on-maximized',
            opaqueOnMaximizedSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        opaqueOnMaximizedSwitch.connect('notify::active', widget => {
            settings.set_boolean('opaque-on-maximized', widget.get_active());
        });
        let opaqueOnMaximizedRow = new Adw.ActionRow({
            title: gettext('Remove style on maximized window (Experimental)'),
            subtitle: gettext(
                'Removes the gradient effect whenever there is a maximized window on the current workspace.'
            ),
            activatable_widget: opaqueOnMaximizedSwitch
        });

        opaqueOnMaximizedRow.add_suffix(opaqueOnMaximizedSwitch);
        opaqueOnMaximizedRow.activatable_widget = opaqueOnMaximizedSwitch;

        behaviorGroup.add(opaqueOnMaximizedRow);
        this.add(behaviorGroup);
    }
}

const BehaviorPage = GObject.registerClass(Behavior);
export default BehaviorPage;
