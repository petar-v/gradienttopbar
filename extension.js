const Main = imports.ui.main;

function init() {}

function enable() {
  // Add transparency
  Main.panel.actor.add_style_class_name("panel-gradient");
}

function disable() {
  // Restore opacity
  Main.panel.actor.remove_style_class_name("panel-gradient");
}
