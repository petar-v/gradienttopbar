var SETTINGS_GSCHEMA = "org.gnome.shell.extensions.org.pshow.gradienttopbar";

function getConfig(settings) {
  const isOpaqueOnMaximized = settings.get_boolean("opaque-on-maximized");
  const colors = settings.get_value("colors").deep_unpack();
  const gradientDirection = settings.get_string("gradient-direction");
  const shadow = settings.get_value("box-shadow").deep_unpack();

  return {
    isOpaqueOnMaximized,
    gradientDirection,
    colors: {
      start: colors[0],
      end: colors[1],
    },
    shadow: {
      horizontal: 0,
      vertical: 0,
      blur: 0,
      spread: 0,
      color: "#000000",
      insert: false,
    },
  };
}

function saveColors(settings, startRgba, endRgba) {
  settings.set_strv("colors", [startRgba, endRgba]);
}

function saveShadow(horizontal, vertical, blur, color, insert){
  // TODO
}

function attachSettingsListeners(settings, listener) {
  settings.connect("changed::gradient-direction", listener);
  settings.connect("changed::opaque-on-maximized", listener);
  settings.connect("changed::colors", listener);
  settings.connect("changed::box-shadow", listener);
}

function detachSettingsListeners(settings, listener) {
  settings.disconnect("changed::gradient-direction", listener);
  settings.disconnect("changed::opaque-on-maximized", listener);
  settings.disconnect("changed::colors", listener);
  settings.disconnect("changed::box-shadow", listener);
}
