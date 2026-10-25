import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    getConfig,
    setGradientDirection,
    saveGradientColors,
    setWindowBehavior,
    setOverviewBehavior,
    COLORS,
    GRADIENT_DIRECTION_KEY,
    WINDOW_BEHAVIOR_KEY,
    ALTERNATE_COLORS_KEY,
    ALTERNATE_GRADIENT_DIRECTION_KEY,
    OVERVIEW_BEHAVIOR_KEY,
    OVERVIEW_COLORS,
    OVERVIEW_GRADIENT_DIRECTION,
    attachSettingsListeners,
    detachSettingsListeners
} from '../config.js';
import { createGradientEditor } from './components/gradientEditor.js';
import { createResetButton } from './components/resetButton.js';
import { ChoiceOption, selectRowValue } from './components/choiceOption.js';
import { APPEARANCE_BEHAVIOR, GRADIENT_DIRECTION } from '../gradient/appearance.js';

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
            colorsKey, directionKey, gradientName
        }) => {
            const getGradient = () => getConfig(settings).gradients[gradientName];
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
                getGradient,
                (endpoint, color) => saveGradientColors(settings, colorsKey, {
                    ...getGradient().colors,
                    [endpoint]: color
                })
            );
            // PreferencesGroup renders non-row widgets after its row list, regardless of add order.
            group.add(new Adw.PreferencesRow({
                child: editor.widget,
                activatable: false,
                selectable: false
            }));
            group.add(directionRow);

            return config => {
                selectRowValue(directionRow, config.gradients[gradientName].direction);
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
            gradientName: 'main'
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
                [WINDOW_BEHAVIOR_KEY, ALTERNATE_COLORS_KEY, ALTERNATE_GRADIENT_DIRECTION_KEY]
            )
        });
        const behaviorModel = new Gio.ListStore({ item_type: ChoiceOption });
        [
            new ChoiceOption(gettext('Keep main gradient'), APPEARANCE_BEHAVIOR.KEEP_GRADIENT),
            new ChoiceOption(gettext('Use original theme'), APPEARANCE_BEHAVIOR.KEEP_THEME),
            new ChoiceOption(gettext('Use alternate gradient'), APPEARANCE_BEHAVIOR.APPLY_STYLE)
        ].forEach(option => behaviorModel.append(option));
        const behaviorRow = new Adw.ComboRow({
            title: gettext('When triggered'),
            model: behaviorModel,
            expression: new Gtk.PropertyExpression(ChoiceOption, null, 'name')
        });
        behaviorRow.connect('notify::selected', () => {
            if (!updatingSettings && behaviorRow.selectedItem)
                setWindowBehavior(settings, behaviorRow.selectedItem.value);
        });
        interactionGroup.add(behaviorRow);
        this.add(interactionGroup);

        const alternateGradientGroup = new Adw.PreferencesGroup();
        const refreshAlternateGradient = createGradientSection(alternateGradientGroup, {
            directionTitle: gettext('Alternate Gradient Direction'),
            directionSubtitle: gettext('The orientation when the style trigger is active.'),
            startTitle: gettext('Alternate Gradient Start Colour'),
            endTitle: gettext('Alternate Gradient End Colour'),
            colorsKey: ALTERNATE_COLORS_KEY,
            directionKey: ALTERNATE_GRADIENT_DIRECTION_KEY,
            gradientName: 'alternate'
        });
        this.add(alternateGradientGroup);

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
        const overviewBehaviorModel = new Gio.ListStore({ item_type: ChoiceOption });
        [
            new ChoiceOption(gettext('Keep main gradient'), APPEARANCE_BEHAVIOR.KEEP_GRADIENT),
            new ChoiceOption(gettext('Use original theme'), APPEARANCE_BEHAVIOR.KEEP_THEME),
            new ChoiceOption(gettext('Use custom gradient'), APPEARANCE_BEHAVIOR.APPLY_STYLE)
        ].forEach(option => overviewBehaviorModel.append(option));
        const overviewBehaviorRow = new Adw.ComboRow({
            title: gettext('When overview is open'),
            model: overviewBehaviorModel,
            expression: new Gtk.PropertyExpression(ChoiceOption, null, 'name')
        });
        overviewBehaviorRow.connect('notify::selected', () => {
            if (!updatingSettings && overviewBehaviorRow.selectedItem)
                setOverviewBehavior(settings, overviewBehaviorRow.selectedItem.value);
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
            gradientName: 'overview'
        });
        this.add(overviewGradientGroup);

        const onSettingsChanged = s => {
            const config = getConfig(s);

            updatingSettings = true;
            selectRowValue(behaviorRow, config.windowBehavior);
            selectRowValue(overviewBehaviorRow, config.overviewBehavior);
            refreshMainGradient(config);
            refreshAlternateGradient(config);
            refreshOverviewGradient(config);
            updatingSettings = false;
            alternateGradientGroup.set_visible(config.windowBehavior === APPEARANCE_BEHAVIOR.APPLY_STYLE);
            overviewGradientGroup.set_visible(config.overviewBehavior === APPEARANCE_BEHAVIOR.APPLY_STYLE);
        };
        onSettingsChanged(settings);
        const settingsHandlerIds = attachSettingsListeners(settings, onSettingsChanged, [
            COLORS, GRADIENT_DIRECTION_KEY,
            WINDOW_BEHAVIOR_KEY, ALTERNATE_COLORS_KEY, ALTERNATE_GRADIENT_DIRECTION_KEY,
            OVERVIEW_BEHAVIOR_KEY, OVERVIEW_COLORS, OVERVIEW_GRADIENT_DIRECTION
        ]);
        window.connect('close-request', () => {
            detachSettingsListeners(settings, settingsHandlerIds);
        });
    }
}

const GradientsPage = GObject.registerClass(Gradients);
export default GradientsPage;
