import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {
    gettext
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { exportSettingsToFile, loadSettingsFromFile } from '../config.js';
import { loadFileDialog, saveFileDialog } from './components/fileChooser.js';

const LICENSE =
  '<span size="small">' +
  'This program comes with absolutely no warranty.\n' +
  'See the <a href="https://www.wtfpl.net">' +
  'DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE</a> for details.' +
  '</span>';

const PAYPAL_LINK = 'https://www.paypal.me/petarv73';
const GITHUB_SPONSORS_LINK = 'https://github.com/sponsors/petar-v';

const createLinkRow = (title, uri, parent) => {
    const image = new Gtk.Image({
        icon_name: 'adw-external-link-symbolic',
        valign: Gtk.Align.CENTER
    });
    const linkRow = new Adw.ActionRow({
        title: gettext(title),
        activatable: true
    });
    linkRow.connect('activated', () => {
        const launcher = new Gtk.UriLauncher();
        launcher.uri = uri;
        launcher.launch(parent, null, (l, res) =>
            l.launch_finish(res)
        );
    });
    linkRow.add_suffix(image);
    return linkRow;
};

class About extends Adw.PreferencesPage {
    _init(metadata, assetsPath) {
        super._init({
            title: gettext('About'),
            icon_name: 'help-about-symbolic',
            name: 'AboutPage'
        });
        const projectHeaderGroup = new Adw.PreferencesGroup();
        const projectHeaderBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            hexpand: false,
            vexpand: false
        });

        const projectImage = Gtk.Image.new_from_file(`${assetsPath}/logo.png`);
        projectImage.set_pixel_size(300);

        const projectTitleLabel = new Gtk.Label({
            label: gettext('Gradient Top Bar'),
            css_classes: ['title-1'],
            vexpand: true,
            valign: Gtk.Align.FILL
        });

        const projectDescriptionLabel = new Gtk.Label({
            label: gettext('Customize GNOME\'s panel.'),
            hexpand: false,
            vexpand: false
        });
        projectHeaderBox.append(projectImage);
        projectHeaderBox.append(projectTitleLabel);
        projectHeaderBox.append(projectDescriptionLabel);
        projectHeaderGroup.add(projectHeaderBox);

        this.add(projectHeaderGroup);

        const settingsGroup = new Adw.PreferencesGroup();
        const settingsRow = new Adw.ActionRow({
            title: gettext('Settings')
        });
        const restoreButton = new Gtk.Button({
            label: gettext('Restore'),
            valign: Gtk.Align.CENTER
        });
        restoreButton.connect('clicked', () =>
            loadFileDialog({
                onFileSelected: loadSettingsFromFile,
                transientFor: this.get_root()
            })
        );
        const exportButton = new Gtk.Button({
            label: gettext('Export'),
            valign: Gtk.Align.CENTER
        });
        exportButton.connect('clicked', () =>
            saveFileDialog({
                onSelected: exportSettingsToFile,
                transientFor: this.get_root()
            })
        );
        settingsRow.add_suffix(restoreButton);
        settingsRow.add_suffix(exportButton);
        settingsGroup.add(settingsRow);
        this.add(settingsGroup);

        const infoGroup = new Adw.PreferencesGroup();
        const projectVersionRow = new Adw.ActionRow({
            title: gettext('Extension Version')
        });
        projectVersionRow.add_suffix(
            new Gtk.Label({
                label: metadata.version.toString(),
                css_classes: ['dim-label']
            })
        );
        infoGroup.add(projectVersionRow);

        if (metadata.commit) {
            const commitRow = new Adw.ActionRow({
                title: gettext('Git Commit')
            });
            commitRow.add_suffix(
                new Gtk.Label({
                    label: metadata.commit.toString(),
                    css_classes: ['dim-label']
                })
            );
            infoGroup.add(commitRow);
        }

        const issuesRow = createLinkRow(
            gettext('Report an Issue'),
            metadata.url,
            this.get_root()
        );
        infoGroup.add(issuesRow);
        this.add(infoGroup);

        const donateGroup = new Adw.PreferencesGroup();
        const githubDonation = createLinkRow(
            gettext('Donate via GitHub'),
            `${GITHUB_SPONSORS_LINK}`,
            this.get_root()
        );
        donateGroup.add(githubDonation);
        const paypalDonation = createLinkRow(
            gettext('Donate via PayPal'),
            `${PAYPAL_LINK}`,
            this.get_root()
        );
        donateGroup.add(paypalDonation);
        this.add(donateGroup);

        const licenseGroup = new Adw.PreferencesGroup();
        const licenseLabel = new Gtk.Label({
            label: gettext(LICENSE),
            use_markup: true,
            justify: Gtk.Justification.CENTER
        });
        const licenseLabelBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.END,
            vexpand: true
        });
        licenseLabelBox.append(licenseLabel);
        licenseGroup.add(licenseLabelBox);
        this.add(licenseGroup);
    }
}

const AboutPage = GObject.registerClass(About);
export default AboutPage;
