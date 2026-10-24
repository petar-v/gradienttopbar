// Run with: node --experimental-vm-modules tests/topBarMenu.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

class Actor {
    actions = new Set();
    signals = new Map();
    connect(name, callback) { this.signals.set(name, callback); return name; }
    add_action(action) { this.actions.add(action); }
    remove_action(action) { this.actions.delete(action); }
}

const panel = new Actor();
panel._leftBox = {};
panel._centerBox = {};
panel._rightBox = {};
let target = panel;
let opened = 0;
let preferences = 0;
let menu;
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
        menu = this;
        this.actor = { hide() {} };
    }
    addAction(label, callback) {
        assert.equal(label, 'Top Bar Style Settings');
        this.activate = callback;
    }
    open() { opened++; }
    destroy() { this.destroyed = true; }
}
const source = new SourceTextModule(await readFile(new URL('../src/topBarMenu.js', import.meta.url), 'utf8'));
let mainModule;
const modules = {
    'gi://Clutter': { default: { BUTTON_SECONDARY: 3, ClickGesture } },
    'gi://St': { default: { Side: { TOP: 0 } } },
    'resource:///org/gnome/shell/ui/main.js': main,
    'resource:///org/gnome/shell/ui/popupMenu.js': {
        PopupMenu,
        PopupMenuManager: class { addMenu() {} }
    },
    'resource:///org/gnome/shell/extensions/extension.js': { gettext: text => text }
};
await source.link(specifier => {
    const values = modules[specifier];
    const module = new SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values))
            this.setExport(key, value);
    });
    if (specifier.endsWith('/main.js'))
        mainModule = module;
    return module;
});
await source.evaluate();
globalThis.stage = { get_event_actor: () => target };
const interaction = new source.namespace.default(() => preferences++);
const click = () => {
    const gesture = [...panel.actions][0];
    if (gesture.signals.get('may-recognize')())
        gesture.signals.get('recognize')();
};
click();
assert.equal(opened, 1, 'Empty panel opens menu');
target = {};
click();
assert.equal(opened, 1, 'Panel controls do not open menu');
target = panel._leftBox;
click();
assert.equal(opened, 2, 'Empty panel box opens menu');
mainModule.setExport('modalCount', 1);
click();
assert.equal(opened, 2, 'Modal interaction is preserved');
mainModule.setExport('modalCount', 0);
menu.activate();
assert.equal(preferences, 1, 'Menu item opens preferences');
interaction.destroy();
assert.equal(panel.actions.size, 0, 'Gesture removed');
assert.equal(menu.destroyed, true, 'Popup destroyed');
console.log('Top bar menu target filtering, activation and cleanup passed');
