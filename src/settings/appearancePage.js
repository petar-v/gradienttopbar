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
    COLORS,
    GRADIENT_DIRECTION as GRADIENT_DIRECTION_KEY,
    MAXIMIZED_BEHAVIOR as MAXIMIZED_BEHAVIOR_KEY,
    MAXIMIZED_COLORS,
    MAXIMIZED_GRADIENT_DIRECTION,
    OVERVIEW_BEHAVIOR as OVERVIEW_BEHAVIOR_KEY,
    OVERVIEW_COLORS,
    OVERVIEW_GRADIENT_DIRECTION,
    saveColors,
    saveMaximizedColors,
    setGradientDirection,
    setMaximizedGradientDirection,
    setMaximizedBehavior,
    attachSettingsListeners,
    detachSettingsListeners
} from '../config.js';
import { createGradientEditor } from './components/gradientEditor.js';
import { createShadowEditor } from './components/shadowEditor.js';
import { createShadowPreview } from './components/shadowPreview.js';
import { createResetButton } from './components/resetButton.js';
import { MAXIMIZED_BEHAVIOR, OVERVIEW_BEHAVIOR, GRADIENT_DIRECTION } from '../constants.js';

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

        const resetShadows = createResetButton(
            window,
            gettext('Reset panel content shadows?'),
            gettext('This will turn shadows off, centre the offsets and restore the default colour, opacity and blur.'),
            settings,
            [CONTENT_SHADOWS, SHADOW_COLOR, SHADOW_BLUR, SHADOW_OFFSET_X, SHADOW_OFFSET_Y]
        );
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
        const shadowEditor = createShadowEditor(settings);
        const shadowPreview = createShadowPreview(settings);
        offsetPreview.add_row(new Adw.PreferencesRow({
            child: shadowEditor.widget,
            activatable: false,
            selectable: false
        }));
        contentGroup.add(offsetPreview);
        contentGroup.add(new Adw.PreferencesRow({
            child: shadowPreview.widget,
            activatable: false,
            selectable: false
        }));
        this.add(contentGroup);

        const gradientGroup = new Adw.PreferencesGroup({
            title: gettext('Main gradient'),
            header_suffix: createResetButton(
                window,
                gettext('Reset main gradient?'),
                gettext('Restore the default gradient colours and direction.'),
                settings,
                [COLORS, GRADIENT_DIRECTION_KEY]
            )
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
            title: gettext('Window interaction'),
            description: gettext('Outside overview, change the top bar’s appearance when a window is maximized or nearby. Choose the trigger in Behaviour.'),
            header_suffix: createResetButton(
                window,
                gettext('Reset window interaction?'),
                gettext('Restore the default triggered behaviour and alternate gradient colours and direction.'),
                settings,
                [MAXIMIZED_BEHAVIOR_KEY, MAXIMIZED_COLORS, MAXIMIZED_GRADIENT_DIRECTION]
            )
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

        const overviewGroup = new Adw.PreferencesGroup({
            title: gettext('Overview'),
            description: gettext('Takes priority over window interaction while overview or the application grid is open.'),
            header_suffix: createResetButton(
                window,
                gettext('Reset overview appearance?'),
                gettext('Restore the main gradient in overview and reset the custom gradient colours and direction.'),
                settings,
                [OVERVIEW_BEHAVIOR_KEY, OVERVIEW_COLORS, OVERVIEW_GRADIENT_DIRECTION]
            )
        });
        const overviewBehaviorValues = [
            OVERVIEW_BEHAVIOR.KEEP_GRADIENT,
            OVERVIEW_BEHAVIOR.KEEP_THEME,
            OVERVIEW_BEHAVIOR.APPLY_STYLE
        ];
        const overviewBehaviorRow = new Adw.ComboRow({
            title: gettext('When overview is open'),
            model: Gtk.StringList.new([
                gettext('Keep main gradient'),
                gettext('Use original theme'),
                gettext('Use custom gradient')
            ])
        });
        overviewBehaviorRow.connect('notify::selected', () => {
            if (!updatingSettings)
                settings.set_string(OVERVIEW_BEHAVIOR_KEY, overviewBehaviorValues[overviewBehaviorRow.selected]);
        });
        overviewGroup.add(overviewBehaviorRow);
        this.add(overviewGroup);

        const overviewGradientGroup = new Adw.PreferencesGroup();
        const overviewDirectionRow = new Adw.ComboRow({
            title: gettext('Overview Gradient Direction'),
            model: gradientDirectionModel,
            expression: new Gtk.PropertyExpression(AppearanceOption, null, 'name')
        });
        overviewDirectionRow.connect('notify::selected', () => {
            if (!updatingSettings && overviewDirectionRow.selectedItem)
                settings.set_string(OVERVIEW_GRADIENT_DIRECTION, overviewDirectionRow.selectedItem.value);
        });
        const overviewGradientEditor = createGradientEditor(
            gettext('Overview Gradient Start Colour'),
            gettext('Overview Gradient End Colour'),
            () => {
                const config = getConfig(settings);
                return { colors: config.overviewColors, direction: config.overviewGradientDirection };
            },
            (endpoint, color) => {
                const { overviewColors } = getConfig(settings);
                overviewColors[endpoint] = color;
                settings.set_strv(OVERVIEW_COLORS, [overviewColors.start, overviewColors.end]);
            }
        );
        overviewGradientGroup.add(new Adw.PreferencesRow({
            child: overviewGradientEditor.widget,
            activatable: false,
            selectable: false
        }));
        overviewGradientGroup.add(overviewDirectionRow);
        this.add(overviewGradientGroup);

        const onSettingsChanged = s => {
            shadowEditor.refresh();
            shadowPreview.refresh();
            const config = getConfig(s);

            updatingSettings = true;
            behaviorRow.set_selected(behaviorValues.indexOf(config.maximizedBehavior));
            setOptionOnRow(directionRow, config.gradientDirection);
            setOptionOnRow(maximizedDirectionRow, config.maximizedGradientDirection);
            overviewBehaviorRow.set_selected(overviewBehaviorValues.indexOf(config.overviewBehavior));
            setOptionOnRow(overviewDirectionRow, config.overviewGradientDirection);
            updatingSettings = false;
            gradientEditor.refresh();
            maximizedGradientEditor.refresh();
            maximizedGradientGroup.set_visible(config.maximizedBehavior === MAXIMIZED_BEHAVIOR.APPLY_STYLE);
            overviewGradientEditor.refresh();
            overviewGradientGroup.set_visible(config.overviewBehavior === OVERVIEW_BEHAVIOR.APPLY_STYLE);
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
