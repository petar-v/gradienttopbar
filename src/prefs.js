import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

import AppearancePage from './settings/appearancePage.js';
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
        window._settings = settings; // TODO: maybe redraw the whole prefs window on settings loaded from file?

        const appearancePage = new AppearancePage(window, settings);
        window.add(appearancePage);

        const behaviorPage = new BehaviorPage(window, settings);
        window.add(behaviorPage);

        const aboutPage = new AboutPage(this.metadata, `${this.path}/assets/`);
        window.add(aboutPage);
    }
}

export default GradientTopBarPreferences;
