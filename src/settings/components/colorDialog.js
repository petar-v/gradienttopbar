import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

export const createColorPickerButton = (pickerTitle, getColor, onColorSelected) => {
    const colorDialog = Gtk.ColorDialog.new();
    colorDialog.set_title(pickerTitle);
    colorDialog.set_modal(true);
    colorDialog.set_with_alpha(true);

    const chooserBtn = new Gtk.Button({
        icon_name: 'document-edit-symbolic',
        tooltip_text: pickerTitle,
        css_classes: ['circular', 'osd'],
        width_request: 40,
        height_request: 40
    });
    chooserBtn.update_property([Gtk.AccessibleProperty.LABEL], [pickerTitle]);
    chooserBtn.connect('clicked', () => {
        const rgba = new Gdk.RGBA();
        rgba.parse(getColor());
        colorDialog.choose_rgba(chooserBtn.get_root(), rgba, null, (dialog, result) => {
            let selected;
            try {
                selected = dialog.choose_rgba_finish(result);
            } catch (error) {
                if (!error.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED) &&
                    !error.matches(Gtk.DialogError, Gtk.DialogError.CANCELLED))
                    logError(error);
                return;
            }
            onColorSelected(selected.to_string());
        });
    });

    return chooserBtn;
};
