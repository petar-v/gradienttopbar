import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    getConfig,
    saveColors,
    attachSettingsListeners,
    detachSettingsListeners
} from '../config.js';
import { createColorDialog } from './components/colorDialog.js';

const GradientDirection = GObject.registerClass(
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
    class GradientDirection extends GObject.Object {
        _init(name, value) {
            super._init({ name, value });
        }
    }
);

const createColorChooserRow = (
        pickerTitle,
        rowTitle,
        colorString,
        callback
) => {
    const chooserBtn = createColorDialog(pickerTitle, colorString, callback);

    const row = new Adw.ActionRow({
        title: rowTitle,
        activatable_widget: chooserBtn
    });

    row.add_suffix(chooserBtn);
    row.set_activatable_widget(chooserBtn);
    return row;
};

const setGradientDirectionOnRow = (directionRow, gradientDirection) => {
    const { model } = directionRow;
    for (let i = 0; i < model.get_n_items(); i++) {
        if (model.get_item(i).value === gradientDirection) {
            directionRow.set_selected(i);
            break;
        }
    }
};

class Appearance extends Adw.PreferencesPage {
    _init(window, settings) {
        super._init({
            title: gettext('Appearance'),
            icon_name: 'applications-graphics-symbolic',
            name: 'Appearance'
        });

        const { gradientDirection, colors } = getConfig(settings);

        const gradientGroup = new Adw.PreferencesGroup({
            title: gettext('Gradient')
        });

        const gradientDirectionModel = new Gio.ListStore({
            item_type: GradientDirection
        });

        [
            new GradientDirection(gettext('Vertical'), 'vertical'),
            new GradientDirection(gettext('Horizontal'), 'horizontal')
        ].forEach(d => gradientDirectionModel.append(d));

        const directionRow = new Adw.ComboRow({
            title: gettext('Gradient Direction'),
            subtitle: gettext('The orientation of the gradient.'),
            model: gradientDirectionModel,
            expression: new Gtk.PropertyExpression(GradientDirection, null, 'name')
        });

        directionRow.connect('notify::selected', () => {
            const { selectedItem } = directionRow;
            settings.set_string('gradient-direction', selectedItem.value);
        });

        setGradientDirectionOnRow(directionRow, gradientDirection);

        gradientGroup.add(directionRow);
        this.add(gradientGroup);

        const colorsGroup = new Adw.PreferencesGroup({
            title: gettext('Colors')
        });

        const startColorChooserRow = createColorChooserRow(
            gettext('Gradient Start Colour'),
            gettext('The start color of the gradient'),
            colors.start,
            rgba => {
                colors.start = rgba;
                saveColors(settings, rgba, colors.end);
            }
        );
        colorsGroup.add(startColorChooserRow);

        const endColorChooserRow = createColorChooserRow(
            gettext('Gradient End Colour'),
            gettext('The end color of the gradient'),
            colors.end,
            rgba => {
                colors.end = rgba;
                saveColors(settings, colors.start, rgba);
            }
        );
        colorsGroup.add(endColorChooserRow);

        this.add(colorsGroup);
        const onSettingsChanged = s => {
            const config = getConfig(s);
            setGradientDirectionOnRow(directionRow, config.gradientDirection);

            const start = new Gdk.RGBA();
            start.parse(config.colors.start);
            startColorChooserRow.get_activatable_widget().set_rgba(start);

            const end = new Gdk.RGBA();
            end.parse(config.colors.end);
            endColorChooserRow.get_activatable_widget().set_rgba(end);
        };
        attachSettingsListeners(settings, onSettingsChanged);
        window.connect('close-request', () => {
            detachSettingsListeners(settings, onSettingsChanged);
        });
    }
}

const AppearancePage = GObject.registerClass(Appearance);
export default AppearancePage;
