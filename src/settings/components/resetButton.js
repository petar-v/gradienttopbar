import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const createResetButton = (window, heading, body, onReset) => {
    const button = new Gtk.Button({
        label: gettext('Reset'),
        tooltip_text: heading,
        valign: Gtk.Align.CENTER,
        css_classes: ['flat', 'destructive-action']
    });
    button.connect('clicked', () => {
        const confirmation = new Adw.AlertDialog({ heading, body });
        confirmation.add_response('cancel', gettext('Cancel'));
        confirmation.add_response('reset', gettext('Reset'));
        confirmation.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
        confirmation.set_default_response('cancel');
        confirmation.set_close_response('cancel');
        confirmation.connect('response', (_dialog, response) => {
            if (response === 'reset')
                onReset();
        });
        confirmation.present(window);
    });
    return button;
};
