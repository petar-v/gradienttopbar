import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    getConfig,
    setGradientDirection,
    saveGradientColors,
    setMaximizedBehavior,
    setOverviewBehavior,
    COLORS,
    GRADIENT_DIRECTION as GRADIENT_DIRECTION_KEY,
    MAXIMIZED_BEHAVIOR as MAXIMIZED_BEHAVIOR_KEY,
    MAXIMIZED_COLORS,
    MAXIMIZED_GRADIENT_DIRECTION,
    OVERVIEW_BEHAVIOR as OVERVIEW_BEHAVIOR_KEY,
    OVERVIEW_COLORS,
    OVERVIEW_GRADIENT_DIRECTION,
    attachSettingsListeners,
    detachSettingsListeners
} from '../config.js';
import { createGradientEditor } from './components/gradientEditor.js';
import { createResetButton } from './components/resetButton.js';
import { ChoiceOption, selectRowValue } from './components/choiceOption.js';
import { MAXIMIZED_BEHAVIOR, OVERVIEW_BEHAVIOR, GRADIENT_DIRECTION } from '../constants.js';

class Gradients extends Adw.PreferencesPage {
    _init(window, settings) {
        super._init({
            title: gettext('Gradients'),
            icon_name: 'applications-graphics-symbolic',
            name: 'Gradients'
        });

        let updatingSettings = false;

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
            item_type: ChoiceOption
        });

        [
            new ChoiceOption(gettext('Vertical'), GRADIENT_DIRECTION.VERTICAL),
            new ChoiceOption(gettext('Horizontal'), GRADIENT_DIRECTION.HORIZONTAL)
        ].forEach(d => gradientDirectionModel.append(d));

        const createGradientSection = (group, {
            directionTitle, directionSubtitle, startTitle, endTitle,
            colorsKey, directionKey, getGradient
        }) => {
            const directionRow = new Adw.ComboRow({
                title: directionTitle,
                subtitle: directionSubtitle ?? '',
                model: gradientDirectionModel,
                expression: new Gtk.PropertyExpression(ChoiceOption, null, 'name')
            });
            directionRow.connect('notify::selected', () => {
                if (!updatingSettings && directionRow.selectedItem)
                    setGradientDirection(settings, directionKey, directionRow.selectedItem.value);
            });
            const editor = createGradientEditor(
                startTitle,
                endTitle,
                () => getGradient(getConfig(settings)),
                (endpoint, color) => {
                    const { colors } = getGradient(getConfig(settings));
                    colors[endpoint] = color;
                    saveGradientColors(settings, colorsKey, colors);
                }
            );
            // PreferencesGroup renders non-row widgets after its row list, regardless of add order.
            group.add(new Adw.PreferencesRow({
                child: editor.widget,
                activatable: false,
                selectable: false
            }));
            group.add(directionRow);

            return config => {
                selectRowValue(directionRow, getGradient(config).direction);
                editor.refresh();
            };
        };

        const refreshMainGradient = createGradientSection(gradientGroup, {
            directionTitle: gettext('Gradient Direction'),
            directionSubtitle: gettext('The orientation of the gradient.'),
            startTitle: gettext('Gradient Start Colour'),
            endTitle: gettext('Gradient End Colour'),
            colorsKey: COLORS,
            directionKey: GRADIENT_DIRECTION_KEY,
            getGradient: config => ({ colors: config.colors, direction: config.gradientDirection })
        });
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

        const maximizedGradientGroup = new Adw.PreferencesGroup();
        const refreshMaximizedGradient = createGradientSection(maximizedGradientGroup, {
            directionTitle: gettext('Alternate Gradient Direction'),
            directionSubtitle: gettext('The orientation when the style trigger is active.'),
            startTitle: gettext('Alternate Gradient Start Colour'),
            endTitle: gettext('Alternate Gradient End Colour'),
            colorsKey: MAXIMIZED_COLORS,
            directionKey: MAXIMIZED_GRADIENT_DIRECTION,
            getGradient: config => ({ colors: config.maximizedColors, direction: config.maximizedGradientDirection })
        });
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
                setOverviewBehavior(settings, overviewBehaviorValues[overviewBehaviorRow.selected]);
        });
        overviewGroup.add(overviewBehaviorRow);
        this.add(overviewGroup);

        const overviewGradientGroup = new Adw.PreferencesGroup();
        const refreshOverviewGradient = createGradientSection(overviewGradientGroup, {
            directionTitle: gettext('Overview Gradient Direction'),
            startTitle: gettext('Overview Gradient Start Colour'),
            endTitle: gettext('Overview Gradient End Colour'),
            colorsKey: OVERVIEW_COLORS,
            directionKey: OVERVIEW_GRADIENT_DIRECTION,
            getGradient: config => ({ colors: config.overviewColors, direction: config.overviewGradientDirection })
        });
        this.add(overviewGradientGroup);

        const onSettingsChanged = s => {
            const config = getConfig(s);

            updatingSettings = true;
            behaviorRow.set_selected(behaviorValues.indexOf(config.maximizedBehavior));
            overviewBehaviorRow.set_selected(overviewBehaviorValues.indexOf(config.overviewBehavior));
            refreshMainGradient(config);
            refreshMaximizedGradient(config);
            refreshOverviewGradient(config);
            updatingSettings = false;
            maximizedGradientGroup.set_visible(config.maximizedBehavior === MAXIMIZED_BEHAVIOR.APPLY_STYLE);
            overviewGradientGroup.set_visible(config.overviewBehavior === OVERVIEW_BEHAVIOR.APPLY_STYLE);
        };
        onSettingsChanged(settings);
        const settingsHandlerIds = attachSettingsListeners(settings, onSettingsChanged);
        window.connect('close-request', () => {
            detachSettingsListeners(settings, settingsHandlerIds);
        });
    }
}

const GradientsPage = GObject.registerClass(Gradients);
export default GradientsPage;
