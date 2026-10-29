import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    getConfig,
    bindSetting,
    setStyleTrigger,
    setProximityTransition,
    STYLE_TRIGGER_KEY,
    WINDOW_BEHAVIOR_KEY,
    PROXIMITY_DISTANCE,
    PROXIMITY_TRANSITION,
    OVERVIEW_TRANSITION,
    WORKSPACE_GESTURE_BLENDING,
    COLORS,
    GRADIENT_DIRECTION_KEY,
    ALTERNATE_COLORS_KEY,
    ALTERNATE_GRADIENT_DIRECTION_KEY,
    OVERVIEW_BEHAVIOR_KEY,
    TOP_BAR_STYLE_SETTINGS,
    attachSettingsListeners,
    detachSettingsListeners,
    getWindowBehavior,
    getStyleTrigger,
    isProximityTransitionEnabled
} from '../config.js';

import { createResetButton } from './components/resetButton.js';
import { createProximityDistanceEditor } from './components/proximityDistanceEditor.js';
import { ChoiceOption, selectRowValue } from './components/choiceOption.js';

import { APPEARANCE_BEHAVIOR, STYLE_TRIGGER, getObservationNeeds } from '../gradient/appearance.js';

class Behavior extends Adw.PreferencesPage {
    _init(window, settings) {
        super._init({
            title: gettext('Behaviour'),
            icon_name: 'system-run-symbolic',
            name: 'Behavior'
        });

        const panelGroup = new Adw.PreferencesGroup({ title: gettext('Top bar') });
        const styleSettingsRow = new Adw.SwitchRow({
            title: gettext('Top Bar Style Settings'),
            subtitle: gettext('Show settings when right-clicking empty space on the top bar. Replaces right-click window dragging; left-click dragging remains available.')
        });
        bindSetting(settings, TOP_BAR_STYLE_SETTINGS, styleSettingsRow, 'active');
        panelGroup.add(styleSettingsRow);
        this.add(panelGroup);

        let isUpdatingSettings = false;
        const distanceEditor = createProximityDistanceEditor(settings);

        const behaviorGroup = new Adw.PreferencesGroup({
            title: gettext('Window interaction'),
            header_suffix: createResetButton(
                window,
                gettext('Reset window interaction?'),
                gettext('Restore the default window trigger and proximity distance.'),
                settings,
                [STYLE_TRIGGER_KEY, PROXIMITY_DISTANCE],
                () => onSettingsChanged(settings)
            )
        });

        const triggerModel = new Gio.ListStore({ item_type: ChoiceOption });
        [
            new ChoiceOption(gettext('Maximized windows'), STYLE_TRIGGER.MAXIMIZED),
            new ChoiceOption(gettext('Nearby windows'), STYLE_TRIGGER.PROXIMITY)
        ].forEach(trigger => triggerModel.append(trigger));

        const triggerRow = new Adw.ComboRow({
            title: gettext('Change appearance when'),
            model: triggerModel,
            expression: new Gtk.PropertyExpression(ChoiceOption, null, 'name')
        });

        const proximityTransitionRow = new Adw.SwitchRow({
            title: gettext('Blend as windows approach'),
            subtitle: gettext('Gradually blend into the selected appearance as windows approach the panel.'),
            active: isProximityTransitionEnabled(settings)
        });

        // Set initial value
        selectRowValue(triggerRow, getStyleTrigger(settings));
        const updateProximityControls = () => {
            const isWindowInteractionEnabled = getWindowBehavior(settings) !== APPEARANCE_BEHAVIOR.KEEP_GRADIENT;
            behaviorGroup.set_sensitive(isWindowInteractionEnabled);
            disabledGroup.set_visible(!isWindowInteractionEnabled);
            const isProximityTrigger = getStyleTrigger(settings) === STYLE_TRIGGER.PROXIMITY;
            distanceEditor.widget.set_sensitive(isProximityTrigger);
            proximityTransitionRow.set_sensitive(isWindowInteractionEnabled && isProximityTrigger);
        };

        // Connect to changes
        triggerRow.connect('notify::selected', () => {
            if (!isUpdatingSettings)
                setStyleTrigger(settings, triggerRow.selectedItem.value);
        });
        proximityTransitionRow.connect('notify::active', () => {
            if (!isUpdatingSettings)
                setProximityTransition(settings, proximityTransitionRow.active);
        });

        behaviorGroup.add(triggerRow);
        behaviorGroup.add(distanceEditor.widget);
        const disabledGroup = new Adw.PreferencesGroup({
            description: gettext('Outside overview, the main gradient is always shown. Choose “Use original theme” or “Use alternate gradient” under Window interaction in Gradients to enable these settings.')
        });
        this.add(disabledGroup);
        this.add(behaviorGroup);

        const transitionsGroup = new Adw.PreferencesGroup({
            title: gettext('Transitions'),
            header_suffix: createResetButton(
                window,
                gettext('Reset transitions?'),
                gettext('Restore the default window proximity, overview gesture and workspace gesture blending.'),
                settings,
                [PROXIMITY_TRANSITION, OVERVIEW_TRANSITION, WORKSPACE_GESTURE_BLENDING]
            )
        });
        transitionsGroup.add(proximityTransitionRow);
        const overviewTransitionRow = new Adw.SwitchRow({
            title: gettext('Blend with overview gestures'),
            subtitle: gettext('Gradually blend between backgrounds as you open or close overview.')
        });
        bindSetting(settings, OVERVIEW_TRANSITION, overviewTransitionRow, 'active');
        transitionsGroup.add(overviewTransitionRow);
        const workspaceTransitionRow = new Adw.SwitchRow({
            title: gettext('Blend with workspace gestures'),
            subtitle: gettext('Gradually blend between backgrounds as you swipe between workspaces.')
        });
        bindSetting(settings, WORKSPACE_GESTURE_BLENDING, workspaceTransitionRow, 'active');
        transitionsGroup.add(workspaceTransitionRow);
        this.add(transitionsGroup);

        const onSettingsChanged = (s, key) => {
            const config = getConfig(s);
            isUpdatingSettings = true;
            selectRowValue(triggerRow, config.styleTrigger);
            if (!key || key === PROXIMITY_DISTANCE)
                distanceEditor.refresh();
            proximityTransitionRow.set_active(config.proximityTransition);
            isUpdatingSettings = false;
            updateProximityControls();
            overviewTransitionRow.set_sensitive(config.overviewBehavior !== APPEARANCE_BEHAVIOR.DO_NOTHING);
            workspaceTransitionRow.set_sensitive(getObservationNeeds(config).windows);
        };
        onSettingsChanged(settings);
        const settingsHandlerIds = attachSettingsListeners(settings, onSettingsChanged, [
            WINDOW_BEHAVIOR_KEY, STYLE_TRIGGER_KEY, PROXIMITY_DISTANCE, PROXIMITY_TRANSITION, OVERVIEW_BEHAVIOR_KEY,
            COLORS, GRADIENT_DIRECTION_KEY, ALTERNATE_COLORS_KEY, ALTERNATE_GRADIENT_DIRECTION_KEY
        ]);
        window.connect('close-request', () => {
            distanceEditor.commit();
            detachSettingsListeners(settings, settingsHandlerIds);
        });
    }
}

const BehaviorPage = GObject.registerClass(Behavior);
export default BehaviorPage;
