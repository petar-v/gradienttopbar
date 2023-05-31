const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { Adw, Gdk, Gio, GLib, GObject, Gtk } = imports.gi;
const Gettext = imports.gettext.domain(Me.metadata["gettext-domain"]);
const { gettext } = Gettext;

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

var AppearancePage = GObject.registerClass(
  class Appearance extends Adw.PreferencesPage {
    _init(settings) {
      super._init({
        title: gettext("Appearance"),
        icon_name: "applications-graphics-symbolic",
        name: "Appearance",
      });

      this._settings = settings;

      const gradientGroup = new Adw.PreferencesGroup({
        title: gettext("Gradient"),
      });

      const gradientDirectionModel = new Gio.ListStore({
        item_type: GradientDirection,
      });

      [
        new GradientDirection(gettext("Vertical"), "vertical"),
        new GradientDirection(gettext("Horizontal"), "horizontal"),
      ].forEach(d => gradientDirectionModel.append(d));

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

      const gradientDirection = this._settings.get_string("gradient-direction");
      const { model } = directionRow;
      for (let i = 0; i < model.get_n_items(); i++) {
        if (model.get_item(i).value === gradientDirection) {
          directionRow.set_selected(i);
          break;
        }
      }

      gradientGroup.add(directionRow);
      this.add(gradientGroup);
    }
  }
);
