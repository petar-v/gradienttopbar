import Gtk from 'gi://Gtk';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const loadFileDialog = ({ onFileSelected, onFileError, transientFor }) => {
    const dialog = new Gtk.FileDialog({
        modal: true,
        title: gettext('Load Settings')
    });
    dialog.set_accept_label(gettext('Import'));

    dialog.open(transientFor, null, (self, res) => {
        try {
            const file = self.open_finish(res);
            onFileSelected(file);
        } catch (error) {
            if (error instanceof Gtk.DialogError && error.code === Gtk.DialogError.DISMISSED)
                return;
            onFileError && onFileError(error);
        }
    });
};

export const saveFileDialog = ({ onSelected, onError, transientFor }) => {
    const dialog = new Gtk.FileDialog({
        modal: true,
        title: gettext('Export Settings')
    });
    dialog.set_accept_label('Save');

    dialog.save(transientFor, null, (self, res) => {
        try {
            const file = self.save_finish(res);
            onSelected(file);
        } catch (error) {
            if (error instanceof Gtk.DialogError && error.code === Gtk.DialogError.DISMISSED)
                return;
            onError && onError(error);
        }
    });
};
