// Based on the original extension at https://extensions.gnome.org/extension/1264/gradient-top-bar/

const Main = imports.ui.main;
const GRADIENT_CLASS = "panel-gradient";

function enable() {
	Main.panel.actor.add_style_class_name(GRADIENT_CLASS);
}

function disable() {
	Main.panel.actor.remove_style_class_name(GRADIENT_CLASS);
}
