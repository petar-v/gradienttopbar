import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import { drawCheckerboard } from './checkerboard.js';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const coordinateToOffset = (coordinate, size, [min, max]) => {
    const offset = Math.round(min + coordinate / size * (max - min));
    return Math.max(min, Math.min(max, offset));
};

const offsetToCoordinate = (offset, size, [min, max]) =>
    (offset - min) / (max - min) * size;

export const createOffsetPicker = (getOffsets, getColor, setOffsets, ranges) => {
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
        setOffsets(
            coordinateToOffset(x - left, size, ranges[0]),
            coordinateToOffset(y - top, size, ranges[1])
        );
    };
    pad.set_draw_func((_area, cr, width, height) => {
        const { size, left, top } = geometry();
        cr.save();
        cr.rectangle(left, top, size, size);
        cr.clip();
        drawCheckerboard(cr, left, top, size, size, 10);
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
        cr.arc(
            left + offsetToCoordinate(x, size, ranges[0]),
            top + offsetToCoordinate(y, size, ranges[1]),
            6, 0, Math.PI * 2
        );
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
