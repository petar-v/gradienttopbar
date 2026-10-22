import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    getConfig,
    saveColors,
    saveMaximizedColors,
    setGradientDirection,
    setMaximizedGradientDirection,
    getMaximizedBehavior,
    attachSettingsListeners,
    detachSettingsListeners
} from '../config.js';
import { createGradientEditor } from './components/gradientEditor.js';
import { MAXIMIZED_BEHAVIOR, GRADIENT_DIRECTION } from '../constants.js';

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
    class GradientDirectionOption extends GObject.Object {
        _init(name, value) {
            super._init({ name, value });
        }
    }
);

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

        const { gradientDirection, maximizedGradientDirection } = getConfig(settings);
        let updatingSettings = false;

        const gradientGroup = new Adw.PreferencesGroup({
            title: gettext('Gradient Appearance')
        });

        const gradientDirectionModel = new Gio.ListStore({
            item_type: GradientDirection
        });

        [
            new GradientDirection(gettext('Vertical'), GRADIENT_DIRECTION.VERTICAL),
            new GradientDirection(gettext('Horizontal'), GRADIENT_DIRECTION.HORIZONTAL)
        ].forEach(d => gradientDirectionModel.append(d));

        const directionRow = new Adw.ComboRow({
            title: gettext('Gradient Direction'),
            subtitle: gettext('The orientation of the gradient.'),
            model: gradientDirectionModel,
            expression: new Gtk.PropertyExpression(GradientDirection, null, 'name')
        });

        directionRow.connect('notify::selected', () => {
            const { selectedItem } = directionRow;
            if (!updatingSettings && selectedItem)
                setGradientDirection(settings, selectedItem.value);
        });

        setGradientDirectionOnRow(directionRow, gradientDirection);

        gradientGroup.add(directionRow);

        const gradientEditor = createGradientEditor(
            gettext('Gradient Start Colour'),
            gettext('Gradient End Colour'),
            () => {
                const config = getConfig(settings);
                return { colors: config.colors, direction: config.gradientDirection };
            },
            (endpoint, color) => {
                const { colors } = getConfig(settings);
                colors[endpoint] = color;
                saveColors(settings, colors.start, colors.end);
            }
        );
        gradientGroup.add(gradientEditor.widget);

        this.add(gradientGroup);

        // Add a group for the alternate gradient settings
        const maximizedGradientGroup = new Adw.PreferencesGroup({
            title: gettext('Alternate Gradient Appearance')
        });

        // Create direction dropdown for maximized windows
        const maximizedDirectionRow = new Adw.ComboRow({
            title: gettext('Alternate Gradient Direction'),
            subtitle: gettext('The orientation when the style trigger is active.'),
            model: gradientDirectionModel,
            expression: new Gtk.PropertyExpression(GradientDirection, null, 'name')
        });

        maximizedDirectionRow.connect('notify::selected', () => {
            const { selectedItem } = maximizedDirectionRow;
            if (!updatingSettings && selectedItem)
                setMaximizedGradientDirection(settings, selectedItem.value);
        });

        setGradientDirectionOnRow(maximizedDirectionRow, maximizedGradientDirection);
        maximizedGradientGroup.add(maximizedDirectionRow);

        const maximizedGradientEditor = createGradientEditor(
            gettext('Alternate Gradient Start Colour'),
            gettext('Alternate Gradient End Colour'),
            () => {
                const config = getConfig(settings);
                return { colors: config.maximizedColors, direction: config.maximizedGradientDirection };
            },
            (endpoint, color) => {
                const { maximizedColors } = getConfig(settings);
                maximizedColors[endpoint] = color;
                saveMaximizedColors(settings, maximizedColors.start, maximizedColors.end);
            }
        );
        maximizedGradientGroup.add(maximizedGradientEditor.widget);

        // Add the group to the page
        this.add(maximizedGradientGroup);

        // Function to update the sensitivity of maximized gradient settings
        const updateMaximizedGradientVisibility = () => {
            const maximizedBehavior = getMaximizedBehavior(settings);
            const isApplyStyle = maximizedBehavior === MAXIMIZED_BEHAVIOR.APPLY_STYLE;

            // Keep the group visible but set sensitivity based on the setting
            maximizedGradientGroup.set_sensitive(isApplyStyle);
        };

        // Set initial visibility
        updateMaximizedGradientVisibility();

        // Listen for changes to maximized-behavior setting
        const visibilityHandlerId = settings.connect(
            'changed::maximized-behavior',
            updateMaximizedGradientVisibility
        );

        const onSettingsChanged = s => {
            const config = getConfig(s);

            updatingSettings = true;
            setGradientDirectionOnRow(directionRow, config.gradientDirection);
            setGradientDirectionOnRow(maximizedDirectionRow, config.maximizedGradientDirection);
            updatingSettings = false;
            gradientEditor.refresh();
            maximizedGradientEditor.refresh();
        };
        const settingsHandlerIds = attachSettingsListeners(settings, onSettingsChanged);
        window.connect('close-request', () => {
            settings.disconnect(visibilityHandlerId);
            detachSettingsListeners(settings, settingsHandlerIds);
        });
    }
}

const AppearancePage = GObject.registerClass(Appearance);
export default AppearancePage;
