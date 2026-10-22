import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';

import { getConfig, SHADOW_OFFSET_X, SHADOW_OFFSET_Y, SHADOW_COLOR } from '../../config.js';
import { createColorDialog } from './colorDialog.js';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const createOffsetPicker = settings => {
    const limit = 6;
    const padding = 1;
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
        content_width: 136,
        content_height: 136,
        valign: Gtk.Align.START,
        tooltip_text: gettext('Click or drag to position the shadow. Right is +X; down is +Y.')
    });
    pad.set_cursor_from_name('crosshair');
    const controls = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        valign: Gtk.Align.FILL
    });
    const fields = ['X', 'Y'].map((axis, index) => {
        const row = new Gtk.Box({ spacing: 12 });
        const label = new Gtk.Label({ label: `${axis} (px)` });
        const spin = Gtk.SpinButton.new_with_range(-limit, limit, 1);
        settings.bind([SHADOW_OFFSET_X, SHADOW_OFFSET_Y][index], spin, 'value', Gio.SettingsBindFlags.DEFAULT);
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

    const colorButton = createColorDialog(
        gettext('Shadow colour and opacity'),
        () => settings.get_string(SHADOW_COLOR),
        color => settings.set_string(SHADOW_COLOR, color)
    );
    colorButton.set_valign(Gtk.Align.END);
    colorButton.set_vexpand(true);
    controls.append(colorButton);
    const sample = new Gtk.Box({
        spacing: 12,
        halign: Gtk.Align.FILL,
        tooltip_text: gettext('Shadow preview')
    });
    const sampleIcon = new Gtk.Image({ icon_name: 'weather-clear-symbolic', pixel_size: 24 });
    const sampleText = new Gtk.Label({ label: 'Aa' });
    const sampleContent = new Gtk.Box({ spacing: 12, halign: Gtk.Align.CENTER, hexpand: true });
    sampleContent.append(sampleIcon);
    sampleContent.append(sampleText);
    sample.append(sampleContent);
    const previewHeight = new Gtk.SizeGroup({ mode: Gtk.SizeGroupMode.VERTICAL });
    previewHeight.add_widget(sample);
    previewHeight.add_widget(colorButton);
    const sampleStyle = new Gtk.CssProvider();
    for (const widget of [sample, sampleIcon, sampleText])
        widget.get_style_context().add_provider(sampleStyle, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    const refresh = () => {
        const { shadowOffsetX, shadowOffsetY, shadowBlur, shadowColor } = getConfig(settings);
        const shadow = `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowColor}`;
        sampleStyle.load_from_string(`box {
            background-color: #b0b0b0;
            border-radius: 8px;
            padding: 12px;
        }
        label { font-size: 24px; font-weight: bold; color: white; text-shadow: ${shadow}; }
        image { color: white; -gtk-icon-shadow: ${shadow}; }`);
        pad.queue_draw();
    };

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
        rgba.parse(settings.get_string(SHADOW_COLOR));
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
        const [x, y] = fields.map(field => field.get_value());
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
    const targetColumn = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12 });
    targetColumn.append(pad);
    targetColumn.append(sample);
    picker.append(targetColumn);
    picker.append(new Gtk.Separator({
        orientation: Gtk.Orientation.VERTICAL,
        opacity: 0.3
    }));
    picker.append(controls);
    refresh();
    return { widget: picker, refresh };
};
