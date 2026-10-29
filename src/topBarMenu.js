import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { gettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export default class TopBarMenu {
    #panel;
    #menu;
    #manager;
    #gesture;

    constructor(openPreferences) {
        this.#panel = Main.panel;
        this.#menu = new PopupMenu.PopupMenu(Main.layoutManager.dummyCursor, 0, St.Side.TOP);
        this.#menu.addAction(gettext('Top Bar Style Settings'), openPreferences);

        Main.uiGroup.add_child(this.#menu.actor);

        this.#menu.actor.hide();
        this.#manager = new PopupMenu.PopupMenuManager(this.#panel);
        this.#manager.addMenu(this.#menu);

        this.#gesture = new Clutter.ClickGesture({
            required_button: Clutter.BUTTON_SECONDARY,
            recognize_on_press: true
        });
        this.#gesture.connect('may-recognize', () => {
            const event = this.#gesture.get_point_event(0);
            return this.#isContextMenuAllowed(global.stage.get_event_actor(event));
        });
        this.#gesture.connect('recognize', () => {
            const { x, y } = this.#gesture.get_coords_abs();
            this.#openAtPosition(x, y);
        });
        // Claim right-click before the panel's native window-drag gesture.
        this.#panel.add_action_full('top-bar-style-settings', Clutter.EventPhase.CAPTURE, this.#gesture);
    }

    #isContextMenuAllowed(actor) {
        return Main.modalCount === 0 && [
            this.#panel,
            this.#panel._leftBox,
            this.#panel._centerBox,
            this.#panel._rightBox
        ].includes(actor);
    }

    #openAtPosition(x, y) {
        Main.layoutManager.setDummyCursorGeometry(x, y, 0, 0);
        this.#menu.open();
    }

    destroy() {
        this.#panel.remove_action(this.#gesture);
        this.#menu.destroy();
        this.#manager = null;
    }
}
