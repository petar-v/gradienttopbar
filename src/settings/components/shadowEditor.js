import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';

import {
    SHADOW_OFFSET_X, SHADOW_OFFSET_Y, SHADOW_BLUR, CONTENT_SHADOWS,
    bindSetting, getSettingRange, getShadowOffsets, getShadowColor, setShadowOffsets, setShadowColor
} from '../../config.js';
import { createOffsetPicker } from './offsetPicker.js';
import { createColorPickerButton } from './colorDialog.js';
import { drawCheckerboard } from './checkerboard.js';
import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const createShadowEditor = settings => {
    const widget = new Gtk.Grid({
        column_spacing: 12,
        row_spacing: 12,
        halign: Gtk.Align.CENTER,
        margin_top: 16,
        margin_bottom: 16,
        margin_start: 16,
        margin_end: 16
    });
    widget.set_direction(Gtk.TextDirection.LTR);
    const target = createOffsetPicker(
        () => getShadowOffsets(settings),
        () => getShadowColor(settings),
        (x, y) => setShadowOffsets(settings, x, y),
        [SHADOW_OFFSET_X, SHADOW_OFFSET_Y].map(key => getSettingRange(settings, key))
    );
    widget.attach(target.widget, 0, 0, 1, 3);
    const rows = [
        [gettext('X (px)'), SHADOW_OFFSET_X],
        [gettext('Y (px)'), SHADOW_OFFSET_Y],
        [gettext('Blur (px)'), SHADOW_BLUR]
    ];
    rows.forEach(([title, key], row) => {
        const [min, max] = getSettingRange(settings, key);
        const label = new Gtk.Label({ label: title, xalign: 1 });
        const spin = Gtk.SpinButton.new_with_range(min, max, 1);
        spin.set_valign(Gtk.Align.CENTER);
        label.set_mnemonic_widget(spin);
        spin.update_property([Gtk.AccessibleProperty.LABEL], [title]);
        bindSetting(settings, key, spin, 'value');
        widget.attach(label, 1, row, 1, 1);
        widget.attach(spin, 2, row, 1, 1);
    });
    const centre = new Gtk.Button({ label: gettext('Centre'), margin_end: 12 });
    centre.connect('clicked', () => setShadowOffsets(settings, 0, 0));
    widget.attach(centre, 0, 3, 1, 1);
    const colorButton = createColorPickerButton(
        gettext('Shadow colour and opacity'),
        () => getShadowColor(settings),
        color => setShadowColor(settings, color)
    );
    colorButton.set_css_classes([]);
    colorButton.set_halign(Gtk.Align.FILL);
    const swatch = new Gtk.DrawingArea({ content_width: 20, content_height: 20, valign: Gtk.Align.CENTER });
    swatch.set_draw_func((_area, cr, width, height) => {
        drawCheckerboard(cr, 0, 0, width, height, 5);
        const color = new Gdk.RGBA();
        color.parse(getShadowColor(settings));
        cr.setSourceRGBA(color.red, color.green, color.blue, color.alpha);
        cr.rectangle(0, 0, width, height);
        cr.fill();
    });
    const colorContent = new Gtk.Box({ spacing: 8, halign: Gtk.Align.CENTER });
    colorContent.append(swatch);
    colorContent.append(new Gtk.Label({ label: gettext('Colour…') }));
    colorButton.set_child(colorContent);
    widget.attach(colorButton, 1, 3, 2, 1);
    bindSetting(settings, CONTENT_SHADOWS, widget, 'sensitive', Gio.SettingsBindFlags.GET);
    const refresh = () => {
        target.refresh();
        swatch.queue_draw();
    };
    return { widget, refresh };
};
