import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

export const createColorDialogBtn = (pickerTitle, colorString, callback) => {
    if ([Gtk.ColorDialog, Gtk.ColorDialogButton].includes(undefined))
        return null;

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

export const createColorDialogBtnLegacy = (
        pickerTitle,
        colorString,
        callback
) => {
    const rgba = new Gdk.RGBA();
    rgba.parse(colorString);
    const button = Gtk.ColorButton.new_with_rgba(rgba);
    button.set_modal(true);
    button.set_title(pickerTitle);
    button.connect('color-set', btn => {
        callback(btn.get_rgba().to_string());
    });
    return button;
};

export const createColorDialog = (pickerTitle, colorString, callback) => {
    const dialog = createColorDialogBtn(pickerTitle, colorString, callback);
    if (dialog)
        return dialog;
    return createColorDialogBtnLegacy(pickerTitle, colorString, callback);
};
