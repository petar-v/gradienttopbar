import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    getConfig,
    CONTENT_SHADOWS,
    SHADOW_BLUR,
    SHADOW_COLOR,
    SHADOW_OFFSET_X,
    SHADOW_OFFSET_Y,
    saveColors,
    saveMaximizedColors,
    setGradientDirection,
    setMaximizedGradientDirection,
    setMaximizedBehavior,
    attachSettingsListeners,
    detachSettingsListeners
} from '../config.js';
import { createGradientEditor } from './components/gradientEditor.js';
import { createOffsetPicker } from './components/offsetPicker.js';
import { MAXIMIZED_BEHAVIOR, GRADIENT_DIRECTION, STYLE_TRIGGER } from '../constants.js';

const AppearanceOption = GObject.registerClass(
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
    class AppearanceOptionObject extends GObject.Object {
        _init(name, value) {
            super._init({ name, value });
        }
    }
);

const setOptionOnRow = (row, value) => {
    const { model } = row;
    for (let i = 0; i < model.get_n_items(); i++) {
        if (model.get_item(i).value === value) {
            row.set_selected(i);
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

        const resetShadows = new Gtk.Button({
            label: gettext('Reset'),
            tooltip_text: gettext('Reset shadow appearance'),
            valign: Gtk.Align.CENTER,
            css_classes: ['flat', 'destructive-action']
        });
        resetShadows.connect('clicked', () => {
            const confirmation = new Adw.AlertDialog({
                heading: gettext('Reset panel content shadows?'),
                body: gettext('This will centre the offsets and restore the default colour, opacity and blur. The on/off toggle will stay unchanged.')
            });
            confirmation.add_response('cancel', gettext('Cancel'));
            confirmation.add_response('reset', gettext('Reset'));
            confirmation.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
            confirmation.set_default_response('cancel');
            confirmation.set_close_response('cancel');
            confirmation.connect('response', (_dialog, response) => {
                if (response === 'reset') {
                    for (const key of [SHADOW_COLOR, SHADOW_BLUR, SHADOW_OFFSET_X, SHADOW_OFFSET_Y])
                        settings.reset(key);
                }
            });
            confirmation.present(window);
        });
        const contentGroup = new Adw.PreferencesGroup({
            title: gettext('Panel content shadows'),
            header_suffix: resetShadows
        });
        const contentShadowsRow = new Adw.SwitchRow({
            title: gettext('Text and icon shadows'),
            subtitle: gettext('Improve contrast against light backgrounds while a gradient is shown.')
        });
        settings.bind(CONTENT_SHADOWS, contentShadowsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        contentGroup.add(contentShadowsRow);
        const offsetPreview = new Adw.ExpanderRow({
            title: gettext('Shadow appearance'),
            subtitle: gettext('Position, colour and opacity'),
            expanded: true
        });
        const offsetPicker = createOffsetPicker(settings);
        offsetPreview.add_row(new Adw.PreferencesRow({
            child: offsetPicker.widget,
            activatable: false,
            selectable: false
        }));
        settings.bind(CONTENT_SHADOWS, offsetPreview, 'sensitive', Gio.SettingsBindFlags.GET);
        contentGroup.add(offsetPreview);
        const blurRow = new Adw.SpinRow({
            title: gettext('Blur'),
            subtitle: gettext('Shadow softness in pixels'),
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 12, step_increment: 1, page_increment: 1 })
        });
        settings.bind(SHADOW_BLUR, blurRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        settings.bind(CONTENT_SHADOWS, blurRow, 'sensitive', Gio.SettingsBindFlags.GET);
        contentGroup.add(blurRow);
        this.add(contentGroup);

        const gradientGroup = new Adw.PreferencesGroup({
            title: gettext('Main gradient')
        });

        const gradientDirectionModel = new Gio.ListStore({
            item_type: AppearanceOption
        });

        [
            new AppearanceOption(gettext('Vertical'), GRADIENT_DIRECTION.VERTICAL),
            new AppearanceOption(gettext('Horizontal'), GRADIENT_DIRECTION.HORIZONTAL)
        ].forEach(d => gradientDirectionModel.append(d));

        const directionRow = new Adw.ComboRow({
            title: gettext('Gradient Direction'),
            subtitle: gettext('The orientation of the gradient.'),
            model: gradientDirectionModel,
            expression: new Gtk.PropertyExpression(AppearanceOption, null, 'name')
        });

        directionRow.connect('notify::selected', () => {
            const { selectedItem } = directionRow;
            if (!updatingSettings && selectedItem)
                setGradientDirection(settings, selectedItem.value);
        });

        setOptionOnRow(directionRow, gradientDirection);

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
        // PreferencesGroup renders non-row widgets after its row list, regardless of add order.
        gradientGroup.add(new Adw.PreferencesRow({
            child: gradientEditor.widget,
            activatable: false,
            selectable: false
        }));
        gradientGroup.add(directionRow);

        this.add(gradientGroup);

        const interactionGroup = new Adw.PreferencesGroup({
            title: gettext('Window interaction')
        });
        const behaviorValues = [
            MAXIMIZED_BEHAVIOR.KEEP_GRADIENT,
            MAXIMIZED_BEHAVIOR.KEEP_THEME,
            MAXIMIZED_BEHAVIOR.APPLY_STYLE
        ];
        const behaviorRow = new Adw.ComboRow({
            title: gettext('When triggered'),
            model: Gtk.StringList.new([
                gettext('Keep main gradient'),
                gettext('Use original theme'),
                gettext('Use alternate gradient')
            ])
        });
        behaviorRow.connect('notify::selected', () => {
            if (!updatingSettings)
                setMaximizedBehavior(settings, behaviorValues[behaviorRow.selected]);
        });
        interactionGroup.add(behaviorRow);
        this.add(interactionGroup);

        // Add a group for the alternate gradient settings
        const maximizedGradientGroup = new Adw.PreferencesGroup();

        // Create direction dropdown for maximized windows
        const maximizedDirectionRow = new Adw.ComboRow({
            title: gettext('Alternate Gradient Direction'),
            subtitle: gettext('The orientation when the style trigger is active.'),
            model: gradientDirectionModel,
            expression: new Gtk.PropertyExpression(AppearanceOption, null, 'name')
        });

        maximizedDirectionRow.connect('notify::selected', () => {
            const { selectedItem } = maximizedDirectionRow;
            if (!updatingSettings && selectedItem)
                setMaximizedGradientDirection(settings, selectedItem.value);
        });

        setOptionOnRow(maximizedDirectionRow, maximizedGradientDirection);

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
        maximizedGradientGroup.add(new Adw.PreferencesRow({
            child: maximizedGradientEditor.widget,
            activatable: false,
            selectable: false
        }));
        maximizedGradientGroup.add(maximizedDirectionRow);

        // Add the group to the page
        this.add(maximizedGradientGroup);

        const onSettingsChanged = s => {
            offsetPicker.refresh();
            const config = getConfig(s);

            updatingSettings = true;
            behaviorRow.set_selected(behaviorValues.indexOf(config.maximizedBehavior));
            setOptionOnRow(directionRow, config.gradientDirection);
            setOptionOnRow(maximizedDirectionRow, config.maximizedGradientDirection);
            updatingSettings = false;
            gradientEditor.refresh();
            maximizedGradientEditor.refresh();
            maximizedGradientGroup.set_visible(config.maximizedBehavior === MAXIMIZED_BEHAVIOR.APPLY_STYLE);

            const triggerDescription = config.styleTrigger === STYLE_TRIGGER.PROXIMITY
                ? gettext('Triggered when a window comes within %d pixels of the top bar.')
                    .replace('%d', config.proximityDistance)
                : gettext('Triggered when a window is maximized.');
            const behaviorDescription = config.maximizedBehavior === MAXIMIZED_BEHAVIOR.KEEP_GRADIENT
                ? gettext('The main gradient is always shown. Choose a different option to enable the Behaviour settings.')
                : gettext('The main gradient is shown otherwise. Configure the trigger in Behaviour.');
            interactionGroup.set_description(`${triggerDescription} ${behaviorDescription}`);
        };
        onSettingsChanged(settings);
        const settingsHandlerIds = attachSettingsListeners(settings, onSettingsChanged);
        window.connect('close-request', () => {
            detachSettingsListeners(settings, settingsHandlerIds);
        });
    }
}

const AppearancePage = GObject.registerClass(Appearance);
export default AppearancePage;
