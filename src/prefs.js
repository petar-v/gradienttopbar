const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { Adw, Gdk, Gio, GLib, GObject, Gtk } = imports.gi;
const Gettext = imports.gettext.domain(Me.metadata["gettext-domain"]);
const { gettext } = Gettext;

const { AppearancePage } = Me.imports.settings.appearancePage;
const { BehaviourPage } = Me.imports.settings.behavioursPage;
const { AboutPage } = Me.imports.settings.aboutPage;

function init() {
  ExtensionUtils.initTranslations();
  const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
  if (!iconTheme.get_search_path().includes(`${Me.path}/assets`))
    iconTheme.add_search_path(`${Me.path}/assets`);
}

function fillPreferencesWindow(window) {
  const settings = ExtensionUtils.getSettings(
    "org.gnome.shell.extensions.org.pshow.gradienttopbar"
  );

  window.can_navigate_back = true;

  const appearancePage = new AppearancePage(settings);
  window.add(appearancePage);

  const behaviourPage = new BehaviourPage(settings);
  window.add(behaviourPage);

  const aboutPage = new AboutPage();
  window.add(aboutPage);
}
