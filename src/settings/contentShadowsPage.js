import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    CONTENT_SHADOWS,
    bindSetting,
    SHADOW_BLUR,
    SHADOW_COLOR,
    SHADOW_OFFSET_X,
    SHADOW_OFFSET_Y,
    attachSettingsListeners,
    detachSettingsListeners
} from '../config.js';
import { createShadowEditor } from './components/shadowEditor.js';
import { createShadowPreview } from './components/shadowPreview.js';
import { createResetButton } from './components/resetButton.js';

class ContentShadows extends Adw.PreferencesPage {
    _init(window, settings) {
        super._init({
            title: gettext('Content Shadows'),
            icon_name: 'weather-clear-night-symbolic',
            name: 'ContentShadows'
        });

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
        bindSetting(settings, CONTENT_SHADOWS, contentShadowsRow, 'active');
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

        const settingsHandlerIds = attachSettingsListeners(settings, () => {
            shadowEditor.refresh();
            shadowPreview.refresh();
        });
        window.connect('close-request', () => {
            detachSettingsListeners(settings, settingsHandlerIds);
        });
    }
}

const ContentShadowsPage = GObject.registerClass(ContentShadows);
export default ContentShadowsPage;
