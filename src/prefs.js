const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { Adw, Gdk, Gio, GLib, GObject, Gtk } = imports.gi;
const Gettext = imports.gettext.domain(Me.metadata["gettext-domain"]);
const { gettext } = Gettext;

const { AboutPage } = Me.imports.settings.aboutPage;
const { BehaviourPage } = Me.imports.settings.behavioursPage;

function init() {
  ExtensionUtils.initTranslations();
  const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
  if (!iconTheme.get_search_path().includes(`${Me.path}/assets`))
    iconTheme.add_search_path(`${Me.path}/assets`);
}

function fillPreferencesWindow(window) {
  const settings = ExtensionUtils.getSettings();

  window.can_navigate_back = true;

  const homePage = new BehaviourPage(settings);
  window.add(homePage);

  const aboutPage = new AboutPage();
  window.add(aboutPage);
}
