import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const OFFSET_LIMIT = 6;

export const createOffsetPicker = (getOffsets, getColor, setOffsets) => {
    const limit = OFFSET_LIMIT;
    const padding = 1;
    const pad = new Gtk.DrawingArea({
        content_width: 180,
        content_height: 180,
        valign: Gtk.Align.CENTER,
        margin_end: 12,
        tooltip_text: gettext('Click or drag to position the shadow. Right is +X; down is +Y.')
    });
    pad.set_cursor_from_name('crosshair');
    const geometry = () => {
        const size = Math.min(pad.get_width(), pad.get_height()) - padding * 2;
        return { size, left: (pad.get_width() - size) / 2, top: (pad.get_height() - size) / 2 };
    };
    const position = (x, y) => {
        const { size, left, top } = geometry();
        if (size <= 0)
            return;
        setOffsets(...[x - left, y - top].map(coordinate =>
            Math.max(-limit, Math.min(limit, Math.round(coordinate / size * limit * 2 - limit)))));
    };
    pad.set_draw_func((_area, cr, width, height) => {
        const { size, left, top } = geometry();
        cr.save();
        cr.rectangle(left, top, size, size);
        cr.clip();
        for (let y = 0; y < size; y += 10) {
            for (let x = 0; x < size; x += 10) {
                const shade = (x / 10 + y / 10) % 2 ? 0.72 : 0.9;
                cr.setSourceRGB(shade, shade, shade);
                cr.rectangle(left + x, top + y, 10, 10);
                cr.fill();
            }
        }
        const rgba = new Gdk.RGBA();
        rgba.parse(getColor());
        cr.setSourceRGBA(rgba.red, rgba.green, rgba.blue, rgba.alpha);
        cr.paint();
        cr.restore();
        cr.setSourceRGBA(0.5, 0.5, 0.5, 1);
        cr.setLineWidth(1);
        cr.rectangle(left, top, size, size);
        cr.moveTo(width / 2, top);
        cr.lineTo(width / 2, top + size);
        cr.moveTo(left, height / 2);
        cr.lineTo(left + size, height / 2);
        cr.stroke();
        cr.arc(width / 2, height / 2, size / 2, 0, Math.PI * 2);
        cr.stroke();
        const [x, y] = getOffsets();
        cr.setSourceRGB(1, 1, 1);
        cr.arc(left + (x + limit) / (limit * 2) * size,
            top + (y + limit) / (limit * 2) * size, 6, 0, Math.PI * 2);
        cr.fillPreserve();
        cr.setSourceRGB(0, 0, 0);
        cr.stroke();
    });
    const drag = new Gtk.GestureDrag();
    let origin;
    drag.connect('drag-begin', (_gesture, x, y) => {
        origin = [x, y];
        position(x, y);
    });
    drag.connect('drag-update', (_gesture, x, y) => position(origin[0] + x, origin[1] + y));
    pad.add_controller(drag);
    return { widget: pad, refresh: () => pad.queue_draw() };
};
