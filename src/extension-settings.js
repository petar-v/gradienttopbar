const { Gio, GLib } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const SCHEMA_NAME = "org.gnome.shell.extensions.org.pshow.gradienttopbar";

const ExtensionSettings = class GradientTopBar_ExtensionSettings {
  constructor() {
    this.settings = new Gio.Settings({
      schema_id: SCHEMA_NAME,
    });
  }

  get_boolean(key) {
    return this.settings.get_boolean(key);
  }

  set_boolean(key, value) {
    this.settings.set_boolean(key, value);
  }
};
