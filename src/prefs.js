const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { Adw, Gdk, Gio, GLib, GObject, Gtk } = imports.gi;
const Gettext = imports.gettext.domain(Me.metadata["gettext-domain"]);
const { gettext } = Gettext;

const { AboutPage } = Me.imports.settings.aboutPage;

function init() {
  ExtensionUtils.initTranslations();
}

function fillPreferencesWindow(window) {
  const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
  if (!iconTheme.get_search_path().includes(`${Me.path}/assets`))
    iconTheme.add_search_path(`${Me.path}/assets`);

  const settings = {}; // ExtensionUtils.getSettings();

  window.can_navigate_back = true;

  const homePage = new HomePage(settings);
  window.add(homePage);

  const aboutPage = new AboutPage();
  window.add(aboutPage);
}

var HomePage = GObject.registerClass(
  class Behaviour extends Adw.PreferencesPage {
    _init(settings) {
      super._init({
        title: gettext("Behaviour"),
        icon_name: "preferences-system-symbolic",
        name: "Behaviour",
      });

      this._settings = settings;
      this.widgetRows = [];
    }
  }
);
