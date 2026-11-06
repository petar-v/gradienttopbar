import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

import GradientsPage from './settings/gradientsPage.js';
import ContentShadowsPage from './settings/contentShadowsPage.js';
import BehaviorPage from './settings/behavioursPage.js';
import AboutPage from './settings/aboutPage.js';

import {
    ExtensionPreferences,
    gettext as _
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

class GradientTopBarPreferences extends ExtensionPreferences {
    constructor(metadata) {
        super(metadata);
        const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        if (!iconTheme.get_resource_path().includes(`${this.path}/assets`)) {
            iconTheme.add_resource_path(`${this.path}/assets`);
            iconTheme.add_search_path(`${this.path}/assets`);
        }
    }

    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.add(new GradientsPage(window, settings));
        window.add(new ContentShadowsPage(window, settings));

        const behaviorPage = new BehaviorPage(window, settings);
        window.add(behaviorPage);

        const aboutPage = new AboutPage(this.metadata, `${this.path}/assets/`);
        window.add(aboutPage);
    }
}

export default GradientTopBarPreferences;
