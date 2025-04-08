import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    getConfig,
    saveColors,
    saveMaximizedColors,
    saveCornerRadius,
    saveMaximizedCornerRadius,
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

        const { gradientDirection, colors, maximizedGradientDirection, maximizedColors, cornerRadius, maximizedCornerRadius } = getConfig(settings);

        const gradientGroup = new Adw.PreferencesGroup({
            title: gettext('Gradient Appearance')
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

        const startColorChooserRow = createColorChooserRow(
            gettext('Gradient Start Colour'),
            gettext('The start color of the gradient'),
            colors.start,
            rgba => {
                colors.start = rgba;
                saveColors(settings, rgba, colors.end);
            }
        );
        gradientGroup.add(startColorChooserRow);

        const endColorChooserRow = createColorChooserRow(
            gettext('Gradient End Colour'),
            gettext('The end color of the gradient'),
            colors.end,
            rgba => {
                colors.end = rgba;
                saveColors(settings, colors.start, rgba);
            }
        );
        gradientGroup.add(endColorChooserRow);

        // Add corner radius spin button
        const cornerRadiusAdjustment = new Gtk.Adjustment({
            lower: 0,
            upper: 20,
            step_increment: 1
        });

        const cornerRadiusSpinButton = new Gtk.SpinButton({
            adjustment: cornerRadiusAdjustment,
            numeric: true,
            snap_to_ticks: true,
            value: cornerRadius
        });

        cornerRadiusSpinButton.connect('value-changed', () => {
            const radius = cornerRadiusSpinButton.get_value_as_int();
            saveCornerRadius(settings, radius);
        });

        const cornerRadiusRow = new Adw.ActionRow({
            title: gettext('Corner Radius'),
            subtitle: gettext('The radius of the panel corners in normal state.')
        });

        cornerRadiusRow.add_suffix(cornerRadiusSpinButton);
        cornerRadiusRow.set_activatable_widget(cornerRadiusSpinButton);
        gradientGroup.add(cornerRadiusRow);

        this.add(gradientGroup);

        // Add a new group for maximized window gradient settings
        const maximizedGradientGroup = new Adw.PreferencesGroup({
            title: gettext('Maximized Window Gradient Appearance')
        });

        // Create direction dropdown for maximized windows
        const maximizedDirectionRow = new Adw.ComboRow({
            title: gettext('Maximized Gradient Direction'),
            subtitle: gettext('The orientation of the gradient when a window is maximized.'),
            model: gradientDirectionModel,
            expression: new Gtk.PropertyExpression(GradientDirection, null, 'name')
        });

        maximizedDirectionRow.connect('notify::selected', () => {
            const { selectedItem } = maximizedDirectionRow;
            settings.set_string('maximized-gradient-direction', selectedItem.value);
        });

        setGradientDirectionOnRow(maximizedDirectionRow, maximizedGradientDirection);
        maximizedGradientGroup.add(maximizedDirectionRow);

        // Create color pickers for maximized windows
        const maximizedStartColorChooserRow = createColorChooserRow(
            gettext('Maximized Gradient Start Colour'),
            gettext('The start color of the gradient when a window is maximized'),
            maximizedColors.start,
            rgba => {
                maximizedColors.start = rgba;
                saveMaximizedColors(settings, rgba, maximizedColors.end);
            }
        );
        maximizedGradientGroup.add(maximizedStartColorChooserRow);

        const maximizedEndColorChooserRow = createColorChooserRow(
            gettext('Maximized Gradient End Colour'),
            gettext('The end color of the gradient when a window is maximized'),
            maximizedColors.end,
            rgba => {
                maximizedColors.end = rgba;
                saveMaximizedColors(settings, maximizedColors.start, rgba);
            }
        );
        maximizedGradientGroup.add(maximizedEndColorChooserRow);

        // Add maximized corner radius spin button
        const maximizedCornerRadiusAdjustment = new Gtk.Adjustment({
            lower: 0,
            upper: 20,
            step_increment: 1
        });

        const maximizedCornerRadiusSpinButton = new Gtk.SpinButton({
            adjustment: maximizedCornerRadiusAdjustment,
            numeric: true,
            snap_to_ticks: true,
            value: maximizedCornerRadius
        });

        maximizedCornerRadiusSpinButton.connect('value-changed', () => {
            const radius = maximizedCornerRadiusSpinButton.get_value_as_int();
            saveMaximizedCornerRadius(settings, radius);
        });

        const maximizedCornerRadiusRow = new Adw.ActionRow({
            title: gettext('Maximized Corner Radius'),
            subtitle: gettext('The radius of the panel corners when a window is maximized.')
        });

        maximizedCornerRadiusRow.add_suffix(maximizedCornerRadiusSpinButton);
        maximizedCornerRadiusRow.set_activatable_widget(maximizedCornerRadiusSpinButton);
        maximizedGradientGroup.add(maximizedCornerRadiusRow);

        // Add the group to the page
        this.add(maximizedGradientGroup);

        // Function to update the sensitivity of maximized gradient settings
        const updateMaximizedGradientVisibility = () => {
            const maximizedBehavior = settings.get_string('maximized-behavior');
            const isApplyStyle = maximizedBehavior === 'apply-style';

            // Keep the group visible but set sensitivity based on the setting
            maximizedGradientGroup.set_sensitive(isApplyStyle);
        };

        // Set initial visibility
        updateMaximizedGradientVisibility();

        // Listen for changes to maximized-behavior setting
        settings.connect('changed::maximized-behavior', updateMaximizedGradientVisibility);

        const onSettingsChanged = s => {
            const config = getConfig(s);

            // Update gradient direction dropdowns
            setGradientDirectionOnRow(directionRow, config.gradientDirection);
            setGradientDirectionOnRow(maximizedDirectionRow, config.maximizedGradientDirection);

            // Update normal gradient colors
            const start = new Gdk.RGBA();
            start.parse(config.colors.start);
            startColorChooserRow.get_activatable_widget().set_rgba(start);

            const end = new Gdk.RGBA();
            end.parse(config.colors.end);
            endColorChooserRow.get_activatable_widget().set_rgba(end);

            // Update maximized gradient colors
            const maximizedStart = new Gdk.RGBA();
            maximizedStart.parse(config.maximizedColors.start);
            maximizedStartColorChooserRow.get_activatable_widget().set_rgba(maximizedStart);

            const maximizedEnd = new Gdk.RGBA();
            maximizedEnd.parse(config.maximizedColors.end);
            maximizedEndColorChooserRow.get_activatable_widget().set_rgba(maximizedEnd);

            // Update corner radius values
            cornerRadiusSpinButton.set_value(config.cornerRadius);
            maximizedCornerRadiusSpinButton.set_value(config.maximizedCornerRadius);
        };
        attachSettingsListeners(settings, onSettingsChanged);
        window.connect('close-request', () => {
            detachSettingsListeners(settings, onSettingsChanged);
        });
    }
}

const AppearancePage = GObject.registerClass(Appearance);
export default AppearancePage;
