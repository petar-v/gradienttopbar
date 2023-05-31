const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { Adw, Gdk, Gio, GLib, GObject, Gtk } = imports.gi;
const Gettext = imports.gettext.domain(Me.metadata["gettext-domain"]);
const { gettext } = Gettext;

const { getConfig, saveColors } = Me.imports.config;

const GradientDirection = GObject.registerClass(
  {
    Properties: {
      name: GObject.ParamSpec.string(
        "name",
        "name",
        "name",
        GObject.ParamFlags.READWRITE,
        null
      ),
      value: GObject.ParamSpec.string(
        "value",
        "value",
        "value",
        GObject.ParamFlags.READWRITE,
        null
      ),
    },
  },
  class GradientDirection extends GObject.Object {
    _init(name, value) {
      super._init({ name, value });
    }
  }
);

const createColorChooser = (pickerTitle, colroString, callback) => {
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

var AppearancePage = GObject.registerClass(
  class Appearance extends Adw.PreferencesPage {
    _init(settings) {
      super._init({
        title: gettext("Appearance"),
        icon_name: "applications-graphics-symbolic",
        name: "Appearance",
      });

      this._settings = settings;
      const { gradientDirection, colors } = getConfig(this._settings);

      const gradientGroup = new Adw.PreferencesGroup({
        title: gettext("Gradient"),
      });

      const gradientDirectionModel = new Gio.ListStore({
        item_type: GradientDirection,
      });

      [
        new GradientDirection(gettext("Vertical"), "vertical"),
        new GradientDirection(gettext("Horizontal"), "horizontal"),
      ].forEach((d) => gradientDirectionModel.append(d));

      const directionRow = new Adw.ComboRow({
        title: "Gradient Direction",
        subtitle:
          'The orientation of the gradient. Most likely, you want "vertical".',
        model: gradientDirectionModel,
        expression: new Gtk.PropertyExpression(GradientDirection, null, "name"),
      });
      directionRow.connect("notify::selected", () => {
        const { selectedItem } = directionRow;
        this._settings.set_string("gradient-direction", selectedItem.value);
      });

      const { model } = directionRow;
      for (let i = 0; i < model.get_n_items(); i++) {
        if (model.get_item(i).value === gradientDirection) {
          directionRow.set_selected(i);
          break;
        }
      }

      gradientGroup.add(directionRow);
      this.add(gradientGroup);

      const colorsGroup = new Adw.PreferencesGroup({
        title: gettext("Colors"),
      });

      const startColorChooser = createColorChooser(
        "Gradient Start Colour",
        colors.start,
        (rgba) => {saveColors(this._settings, rgba, colors.end)}
      );

      const startColorRow = new Adw.ActionRow({
        title: gettext("The start color of the gradient"),
        activatable_widget: startColorChooser,
      });

      startColorRow.add_suffix(startColorChooser);
      startColorRow.activatable_widget = startColorChooser;

      colorsGroup.add(startColorRow);

      const endColorChooser = createColorChooser(
        "Gradient End Colour",
        colors.end,
        (rgba) => {saveColors(this._settings, colors.start, rgba)}
      );

      const endColorRow = new Adw.ActionRow({
        title: gettext("The end color of the gradient"),
        activatable_widget: endColorChooser,
      });

      endColorRow.add_suffix(endColorChooser);
      endColorRow.activatable_widget = endColorChooser;

      colorsGroup.add(endColorRow);

      this.add(colorsGroup);
    }
  }
);
