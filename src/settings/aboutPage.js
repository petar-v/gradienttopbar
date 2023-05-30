const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { Adw, Gdk, Gio, GLib, GObject, Gtk } = imports.gi;
const Gettext = imports.gettext.domain(Me.metadata["gettext-domain"]);
const { gettext } = Gettext;

const LICENSE =
  '<span size="small">' +
  "This program comes with absolutely no warranty.\n" +
  'See the <a href="https://www.wtfpl.net">' +
  "DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE</a> for details." +
  "</span>";

const createLinkRow = (title, uri) => {
  const image = new Gtk.Image({
    icon_name: "adw-external-link-symbolic",
    valign: Gtk.Align.CENTER,
  });
  const linkRow = new Adw.ActionRow({
    title: gettext(title),
    activatable: true,
  });
  linkRow.connect("activated", () => {
    Gtk.show_uri(this.get_root(), uri, Gdk.CURRENT_TIME);
  });
  linkRow.add_suffix(image);

  return linkRow;
};

var AboutPage = GObject.registerClass(
  class AboutPage extends Adw.PreferencesPage {
    _init() {
      super._init({
        title: gettext("About"),
        icon_name: "help-about-symbolic",
        name: "AboutPage",
      });

      const projectHeaderGroup = new Adw.PreferencesGroup();
      const projectHeaderBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        hexpand: false,
        vexpand: false,
      });

      const projectImage = new Gtk.Image({
        icon_name: "logo",
        pixel_size: 320,
      });

      const projectTitleLabel = new Gtk.Label({
        label: gettext("Gradient Top Bar"),
        css_classes: ["title-1"],
        vexpand: true,
        valign: Gtk.Align.FILL,
      });

      const projectDescriptionLabel = new Gtk.Label({
        label: gettext(`Makes GNOME's topbar's background gradient.`),
        hexpand: false,
        vexpand: false,
      });
      projectHeaderBox.append(projectImage);
      projectHeaderBox.append(projectTitleLabel);
      projectHeaderBox.append(projectDescriptionLabel);
      projectHeaderGroup.add(projectHeaderBox);

      this.add(projectHeaderGroup);

      const infoGroup = new Adw.PreferencesGroup();

      const projectVersionRow = new Adw.ActionRow({
        title: gettext("Extension Version"),
      });
      projectVersionRow.add_suffix(
        new Gtk.Label({
          label: Me.metadata.version.toString(),
          css_classes: ["dim-label"],
        })
      );
      infoGroup.add(projectVersionRow);

      if (Me.metadata.commit) {
        const commitRow = new Adw.ActionRow({
          title: gettext("Git Commit"),
        });
        commitRow.add_suffix(
          new Gtk.Label({
            label: Me.metadata.commit.toString(),
            css_classes: ["dim-label"],
          })
        );
        infoGroup.add(commitRow);
      }

      const issuesRow = createLinkRow(
        gettext("Report an Issue"),
        Me.metadata.url
      );
      infoGroup.add(issuesRow);
      this.add(infoGroup);

      const licenseGroup = new Adw.PreferencesGroup();
      const licenseLabel = new Gtk.Label({
        label: gettext(LICENSE),
        use_markup: true,
        justify: Gtk.Justification.CENTER,
      });
      const licenseLabelBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        valign: Gtk.Align.END,
        vexpand: true,
      });
      licenseLabelBox.append(licenseLabel);
      licenseGroup.add(licenseLabelBox);
      this.add(licenseGroup);
    }
  }
);
