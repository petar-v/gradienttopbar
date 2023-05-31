var SETTINGS_GSCHEMA = "org.gnome.shell.extensions.org.pshow.gradienttopbar";

const parseColor = (color) => ({
  color: color[0],
  opacity: color[1],
  position: color[2],
});

function getConfig(settings) {
  const isOpaqueOnMaximized = settings.get_boolean("opaque-on-maximized");
  const colors = settings.get_value("colors").deep_unpack();
  const gradientDirection = settings.get_string("gradient-direction");

  return {
    isOpaqueOnMaximized,
    gradientDirection,
    colors: {
      start: parseColor(colors[0]),
      end: parseColor(colors[1]),
    },
  };
}

function attachSettingsListeners(settings, listener) {
  settings.connect("changed::opaque-on-maximized", listener);
}
function detachSettingsListeners(settings, listener) {
  settings.disconnect("changed::opaque-on-maximized", listener);
}
