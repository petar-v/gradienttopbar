import assert from 'node:assert/strict';
import { createModuleLoader } from './modules.js';

export const createTopBarMenuFixture = async t => {
    class Actor {
        actions = new Set();
        signals = new Map();
        connect(name, callback) { this.signals.set(name, callback); return name; }
        add_action(action) { this.actions.add(action); }
        add_action_full(name, phase, action) {
            this.actionName = name;
            this.actionPhase = phase;
            this.actions.add(action);
        }
        remove_action(action) { this.actions.delete(action); }
    }

    const panel = new Actor();
    panel._leftBox = {};
    panel._centerBox = {};
    panel._rightBox = {};
    const state = { target: panel, opened: 0, preferences: 0, menu: null };
    const event = {};
    const main = {
        panel,
        modalCount: 0,
        layoutManager: {
            dummyCursor: {},
            setDummyCursorGeometry: (...args) => assert.deepEqual(args, [120, 12, 0, 0])
        },
        uiGroup: { add_child() {} }
    };
    class ClickGesture extends Actor {
        constructor(options) {
            super();
            assert.equal(options.required_button, 3);
            assert.equal(options.recognize_on_press, true);
        }
        get_point_event() { return event; }
        get_coords_abs() { return { x: 120, y: 12 }; }
    }
    class PopupMenu {
        constructor() {
            state.menu = this;
            this.actor = { hide() {} };
        }
        addAction(label, callback) {
            assert.equal(label, 'Top Bar Style Settings');
            this.activate = callback;
        }
        open() { state.opened++; }
        destroy() { this.destroyed = true; }
    }
    const stubs = {
        'gi://Clutter': { default: { BUTTON_SECONDARY: 3, ClickGesture, EventPhase: { CAPTURE: 1 } } },
        'gi://St': { default: { Side: { TOP: 0 } } },
        'resource:///org/gnome/shell/ui/main.js': main,
        'resource:///org/gnome/shell/ui/popupMenu.js': {
            PopupMenu,
            PopupMenuManager: class { addMenu() {} }
        },
        'resource:///org/gnome/shell/extensions/extension.js': { gettext: text => text }
    };

    const load = createModuleLoader(stubs, { stage: { get_event_actor: () => state.target } });
    const source = await load('topBarMenu.js');
    const mainModule = await load('resource:///org/gnome/shell/ui/main.js');
    const interaction = new source.namespace.default(() => state.preferences++);
    t.after(() => {
        if (panel.actions.size)
            interaction.destroy();
        assert.equal(panel.actions.size, 0, 'Fixture leaked a panel gesture');
        assert.equal(state.menu.destroyed, true, 'Fixture leaked a popup');
    });
    const click = () => {
        const gesture = [...panel.actions][0];
        if (gesture.signals.get('may-recognize')())
            gesture.signals.get('recognize')();
    };
    return { state, panel, interaction, click, setModalCount: count => mainModule.setExport('modalCount', count) };
};
