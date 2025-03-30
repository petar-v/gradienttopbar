import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

export const createColorDialog = (pickerTitle, colorString, callback) => {
    const colorDialog = Gtk.ColorDialog.new();
    colorDialog.set_title(pickerTitle);
    colorDialog.set_modal(true);
    colorDialog.set_with_alpha(true);

    const rgba = new Gdk.RGBA();
    rgba.parse(colorString);

    const chooserBtn = Gtk.ColorDialogButton.new(colorDialog);
    chooserBtn.set_rgba(rgba);
    chooserBtn.connect('notify::rgba', () => {
        callback(chooserBtn.get_rgba().to_string());
    });

    return chooserBtn;
};
