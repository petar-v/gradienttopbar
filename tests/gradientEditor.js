import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import { createGradientEditor } from '../src/settings/components/gradientEditor.js';
import { assert, test, run } from './fixtures/gjs.js';
import { patch, captureDraw, createPixelReader, trackWindow } from './fixtures/preferences.js';

Gtk.init();

const createEditorFixture = t => {
    const previousDirection = Gtk.Widget.get_default_direction();
    t.after(() => Gtk.Widget.set_default_direction(previousDirection));
    Gtk.Widget.set_default_direction(Gtk.TextDirection.RTL);
    const gradient = {
        colors: { start: 'rgb(255,0,0)', end: 'rgb(0,0,255)' },
        direction: 'vertical'
    };
    const { value: { widget, refresh }, draw } = captureDraw(() => createGradientEditor(
        'Start colour', 'End colour', () => gradient,
        (endpoint, color) => { gradient.colors[endpoint] = color; }
    ));
    trackWindow(t, new Gtk.Window({ child: widget }));
    const start = widget.get_first_child().get_next_sibling();
    const end = start.get_next_sibling();
    const pixel = createPixelReader(t, draw, 240, 160);
    return { gradient, widget, refresh, start, end, pixel };
};

test('vertical editor preserves physical endpoints in RTL and draws rounded corners', t => {
    const { widget, start, end, pixel } = createEditorFixture(t);
    assert(start.get_valign() === Gtk.Align.START && end.get_valign() === Gtk.Align.END,
        'Vertical endpoints must be top/bottom');
    assert(start.get_halign() === Gtk.Align.CENTER, 'Vertical endpoints must be centred');
    assert(widget.get_direction() === Gtk.TextDirection.LTR, 'Gradient positions must stay physical in RTL');
    assert(start.get_focusable() && end.get_focusable(), 'Both colour buttons must support keyboard focus');

    const top = pixel(120, 15);
    const bottom = pixel(120, 145);
    assert(top[0] > top[2] && bottom[2] > bottom[0], 'Vertical drawing must run start to end');
    assert(pixel(0, 0)[3] === 0, 'Preview corners must be rounded');
});

test('horizontal editor aligns endpoints and draws start to end', t => {
    const { gradient, refresh, start, end, pixel } = createEditorFixture(t);
    gradient.direction = 'horizontal';
    refresh();
    assert(start.get_halign() === Gtk.Align.START && end.get_halign() === Gtk.Align.END,
        'Horizontal endpoints must be left/right');
    assert(start.get_valign() === Gtk.Align.CENTER, 'Horizontal endpoints must be centred');
    const left = pixel(15, 80);
    const right = pixel(225, 80);
    assert(left[0] > left[2] && right[2] > right[0], 'Horizontal drawing must run start to end');
});

test('transparent gradient reveals the checkerboard', t => {
    const { gradient, refresh, pixel } = createEditorFixture(t);
    gradient.colors = { start: 'rgba(0,0,0,0)', end: 'rgba(0,0,0,0)' };
    refresh();
    assert(pixel(20, 80)[0] !== pixel(30, 80)[0], 'Transparent colours must reveal a checkerboard');
});

test('colour confirmation preserves the other endpoint and cancellation preserves the selection', t => {
    const { gradient, widget, start, end } = createEditorFixture(t);
    gradient.colors.end = 'rgba(0,0,0,0)';
    const chosen = new Gdk.RGBA();
    chosen.parse('rgb(0,255,0)');
    patch(t, Gtk.ColorDialog.prototype, 'choose_rgba', function (_parent, initial, _cancel, callback) {
        assert(initial.to_string() === gradient.colors.start, 'Picker must read the latest colour');
        callback(this, null);
    });
    gradient.colors.start = 'rgb(255,255,0)';
    patch(t, Gtk.ColorDialog.prototype, 'choose_rgba_finish', () => chosen);
    start.emit('clicked');
    assert(gradient.colors.start === chosen.to_string(), 'Confirm must save the chosen endpoint');
    assert(gradient.colors.end === 'rgba(0,0,0,0)', 'Confirm must preserve the other endpoint');

    Gtk.ColorDialog.prototype.choose_rgba_finish = () => {
        throw new GLib.Error(Gtk.DialogError.quark(), Gtk.DialogError.DISMISSED, 'Cancelled');
    };
    start.emit('clicked');
    assert(gradient.colors.start === chosen.to_string(), 'Cancel must leave the colour unchanged');
    widget.set_sensitive(false);
    assert(!start.is_sensitive() && !end.is_sensitive(), 'Disabled editors must disable both buttons');
});

run();
