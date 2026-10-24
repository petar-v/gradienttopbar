import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { gettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export default class TopBarMenu {
    constructor(openPreferences) {
        this._panel = Main.panel;
        this._menu = new PopupMenu.PopupMenu(Main.layoutManager.dummyCursor, 0, St.Side.TOP);
        this._menu.addAction(gettext('Top Bar Style Settings'), openPreferences);

        Main.uiGroup.add_child(this._menu.actor);

        this._menu.actor.hide();
        this._manager = new PopupMenu.PopupMenuManager(this._panel);
        this._manager.addMenu(this._menu);

        this._gesture = new Clutter.ClickGesture({
            required_button: Clutter.BUTTON_SECONDARY,
            recognize_on_press: true
        });
        this._gesture.connect('may-recognize', () => {
            const event = this._gesture.get_point_event(0);
            return this._isEmptyPanel(global.stage.get_event_actor(event));
        });
        this._gesture.connect('recognize', () => {
            const { x, y } = this._gesture.get_coords_abs();
            this._open(x, y);
        });
        this._panel.add_action(this._gesture);
    }

    _isEmptyPanel(actor) {
        return Main.modalCount === 0 && [
            this._panel,
            this._panel._leftBox,
            this._panel._centerBox,
            this._panel._rightBox
        ].includes(actor);
    }

    _open(x, y) {
        Main.layoutManager.setDummyCursorGeometry(x, y, 0, 0);
        this._menu.open();
    }

    destroy() {
        this._panel.remove_action(this._gesture);
        this._menu.destroy();
        this._manager = null;
    }
}
