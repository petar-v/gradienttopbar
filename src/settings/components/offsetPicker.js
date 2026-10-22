import Gtk from 'gi://Gtk';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Temporary UI spike: values are local to this widget and are never saved.
export const createOffsetPicker = () => {
    const limit = 6;
    const padding = 16;
    const picker = new Gtk.Box({
        spacing: 24,
        halign: Gtk.Align.CENTER,
        margin_top: 16,
        margin_bottom: 16,
        margin_start: 16,
        margin_end: 16
    });
    picker.set_direction(Gtk.TextDirection.LTR);
    const pad = new Gtk.DrawingArea({
        content_width: 168,
        content_height: 168,
        tooltip_text: gettext('Click or drag to position the shadow. Right is +X; down is +Y.')
    });
    pad.set_cursor_from_name('crosshair');
    const controls = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        valign: Gtk.Align.CENTER
    });
    const fields = ['X', 'Y'].map((axis, index) => {
        const row = new Gtk.Box({ spacing: 12 });
        const label = new Gtk.Label({ label: `${axis} (px)` });
        const spin = Gtk.SpinButton.new_with_range(-limit, limit, 1);
        spin.set_value(index);
        spin.update_property([Gtk.AccessibleProperty.LABEL], [`${axis} ${gettext('offset in pixels')}`]);
        spin.connect('value-changed', () => pad.queue_draw());
        row.append(label);
        row.append(spin);
        controls.append(row);
        return spin;
    });
    const reset = new Gtk.Button({ label: gettext('Centre') });
    reset.connect('clicked', () => fields.forEach(field => field.set_value(0)));
    controls.append(reset);

    const geometry = () => {
        const size = Math.min(pad.get_width(), pad.get_height()) - padding * 2;
        return { size, left: (pad.get_width() - size) / 2, top: (pad.get_height() - size) / 2 };
    };
    const position = (x, y) => {
        const { size, left, top } = geometry();
        if (size <= 0)
            return;
        [x - left, y - top].forEach((coordinate, index) => {
            fields[index].set_value(Math.max(-limit, Math.min(limit,
                Math.round(coordinate / size * limit * 2 - limit))));
        });
    };
    pad.set_draw_func((_area, cr, width, height) => {
        const { size, left, top } = geometry();
        const color = pad.get_color();
        cr.setSourceRGBA(color.red, color.green, color.blue, 0.08);
        cr.rectangle(left, top, size, size);
        cr.fill();
        cr.setSourceRGBA(color.red, color.green, color.blue, 0.3);
        cr.setLineWidth(1);
        cr.rectangle(left, top, size, size);
        cr.moveTo(width / 2, top);
        cr.lineTo(width / 2, top + size);
        cr.moveTo(left, height / 2);
        cr.lineTo(left + size, height / 2);
        cr.stroke();
        cr.arc(width / 2, height / 2, size / 2, 0, Math.PI * 2);
        cr.stroke();
        const [x, y] = fields.map(field => field.get_value());
        cr.setSourceRGBA(color.red, color.green, color.blue, 1);
        cr.arc(left + (x + limit) / (limit * 2) * size,
            top + (y + limit) / (limit * 2) * size, 6, 0, Math.PI * 2);
        cr.fill();
    });
    const drag = new Gtk.GestureDrag();
    let origin;
    drag.connect('drag-begin', (_gesture, x, y) => {
        origin = [x, y];
        position(x, y);
    });
    drag.connect('drag-update', (_gesture, x, y) => position(origin[0] + x, origin[1] + y));
    pad.add_controller(drag);
    picker.append(pad);
    picker.append(controls);
    return picker;
};
