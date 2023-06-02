const { Adw, Gdk, Gio, GLib, GObject, Gtk } = imports.gi;

const createColorDialogBtn = (pickerTitle, colroString, callback) => {
  if ([Gtk.ColorDialog, Gtk.ColorDialogButton].includes(undefined)) {
    return null;
  }
  const colorDialog = Gtk.ColorDialog.new();
  colorDialog.set_title(pickerTitle);
  colorDialog.set_modal(true);
  colorDialog.set_with_alpha(true);

  const rgba = new Gdk.RGBA();
  rgba.parse(colroString);

  const chooserBtn = Gtk.ColorDialogButton.new(colorDialog);
  chooserBtn.set_rgba(rgba);
  chooserBtn.connect("notify::rgba", () => {
    callback(chooserBtn.get_rgba().to_string());
  });

  return chooserBtn;
};

const createColorDialogBtnLegacy = (pickerTitle, colroString, callback) => {
  const rgba = new Gdk.RGBA();
  rgba.parse(colroString);
  const button = Gtk.ColorButton.new_with_rgba(rgba);
  button.set_modal(true);
  button.set_title(pickerTitle);
  button.connect("color-set", (btn) => {
    callback(btn.get_rgba().to_string());
  });
  return button;
};

function createColorDialog(pickerTitle, colroString, callback) {
  const dialog = createColorDialogBtn(pickerTitle, colroString, callback);
  if (dialog) return dialog;
  return createColorDialogBtnLegacy(pickerTitle, colroString, callback);
}
