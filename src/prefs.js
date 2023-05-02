const { Gio, Gtk, GLib } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
// const Settings = Me.imports.settings;

let settings;

function init() {
  // Initialize your extension here
  // Create your settings object
  // settings = new Settings.ExtensionSettings();
}

function buildPrefsWidget() {
  const prefsWidget = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    margin_top: 12,
    margin_bottom: 12,
    margin_start: 24,
    margin_end: 24,
    spacing: 6,
  });

  const toggleLabel = new Gtk.Label({
    label: "Toggle Switch",
    use_markup: true,
  });

  const toggleSwitch = new Gtk.Switch();

  // toggleSwitch.set_active(settings.get_boolean("toggle-switch"));
  toggleSwitch.set_active(true);

  toggleSwitch.connect("notify::active", (button) => {
    global.log("nigger toggle", button.active);
    // settings.set_boolean("toggle-switch", button.active);
  });

  prefsWidget.append(toggleLabel);
  prefsWidget.append(toggleSwitch);

  return prefsWidget;
}
