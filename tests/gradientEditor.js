// Run with: gjs -m tests/gradientEditor.js
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import Cairo from 'cairo';

import { createGradientEditor } from '../src/settings/components/gradientEditor.js';

const assert = (condition, message) => {
    if (!condition)
        throw new Error(message);
};

Gtk.init();
Gtk.Widget.set_default_direction(Gtk.TextDirection.RTL);
let gradient = {
    colors: { start: 'rgb(255,0,0)', end: 'rgb(0,0,255)' },
    direction: 'vertical'
};
let draw;
const setDraw = Gtk.DrawingArea.prototype.set_draw_func;
Gtk.DrawingArea.prototype.set_draw_func = function (callback) {
    draw = callback;
    setDraw.call(this, callback);
};
const { widget, refresh } = createGradientEditor(
    'Start colour', 'End colour', () => gradient,
    (endpoint, color) => { gradient.colors[endpoint] = color; }
);
Gtk.DrawingArea.prototype.set_draw_func = setDraw;
const start = widget.get_first_child().get_next_sibling();
const end = start.get_next_sibling();
assert(start.get_valign() === Gtk.Align.START && end.get_valign() === Gtk.Align.END,
    'Vertical endpoints must be top/bottom');
assert(start.get_halign() === Gtk.Align.CENTER, 'Vertical endpoints must be centred');
assert(widget.get_direction() === Gtk.TextDirection.LTR, 'Gradient positions must stay physical in RTL');
assert(start.get_focusable() && end.get_focusable(), 'Both colour buttons must support keyboard focus');

const directory = GLib.dir_make_tmp('gradient-editor-test-XXXXXX');
const filename = `${directory}/preview.png`;
const pixel = (x, y) => {
    const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 240, 160);
    draw(null, new Cairo.Context(surface), 240, 160);
    surface.writeToPNG(filename);
    const image = GdkPixbuf.Pixbuf.new_from_file(filename);
    const offset = y * image.rowstride + x * image.n_channels;
    return image.get_pixels().slice(offset, offset + image.n_channels);
};
try {
    const top = pixel(120, 15);
    const bottom = pixel(120, 145);
    assert(top[0] > top[2] && bottom[2] > bottom[0], 'Vertical drawing must run start to end');
    assert(pixel(0, 0)[3] === 0, 'Preview corners must be rounded');

    gradient = { ...gradient, direction: 'horizontal' };
    refresh();
    assert(start.get_halign() === Gtk.Align.START && end.get_halign() === Gtk.Align.END,
        'Horizontal endpoints must be left/right');
    assert(start.get_valign() === Gtk.Align.CENTER, 'Horizontal endpoints must be centred');
    const left = pixel(15, 80);
    const right = pixel(225, 80);
    assert(left[0] > left[2] && right[2] > right[0], 'Horizontal drawing must run start to end');

    gradient.colors = { start: 'rgba(0,0,0,0)', end: 'rgba(0,0,0,0)' };
    refresh();
    assert(pixel(20, 80)[0] !== pixel(30, 80)[0], 'Transparent colours must reveal a checkerboard');
} finally {
    GLib.unlink(filename);
    GLib.rmdir(directory);
}

// Simulate the native dialog response without opening a dialog or writing real settings.
const choose = Gtk.ColorDialog.prototype.choose_rgba;
const finish = Gtk.ColorDialog.prototype.choose_rgba_finish;
const chosen = new Gdk.RGBA();
chosen.parse('rgb(0,255,0)');
Gtk.ColorDialog.prototype.choose_rgba = function (_parent, initial, _cancel, callback) {
    assert(initial.to_string() === gradient.colors.start, 'Picker must read the latest colour');
    callback(this, null);
};
try {
    gradient.colors.start = 'rgb(255,255,0)';
    Gtk.ColorDialog.prototype.choose_rgba_finish = () => chosen;
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
} finally {
    Gtk.ColorDialog.prototype.choose_rgba = choose;
    Gtk.ColorDialog.prototype.choose_rgba_finish = finish;
}
print('Gradient editor checks passed');
