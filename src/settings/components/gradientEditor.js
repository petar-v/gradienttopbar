import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Cairo from 'cairo';

import { GRADIENT_DIRECTION } from '../../gradient/appearance.js';
import { createColorPickerButton } from './colorDialog.js';
import { drawCheckerboard } from './checkerboard.js';

export const createGradientPreview = getGradient => {
    const preview = new Gtk.DrawingArea({
        content_width: 240,
        content_height: 112,
        hexpand: true
    });
    preview.set_draw_func((_area, cr, width, height) => {
        const radius = 12;
        cr.newSubPath();
        cr.arc(width - radius, radius, radius, -Math.PI / 2, 0);
        cr.arc(width - radius, height - radius, radius, 0, Math.PI / 2);
        cr.arc(radius, height - radius, radius, Math.PI / 2, Math.PI);
        cr.arc(radius, radius, radius, Math.PI, Math.PI * 1.5);
        cr.closePath();
        cr.clip();

        drawCheckerboard(cr, 0, 0, width, height, 10);

        const selected = getGradient();
        if (!selected)
            return;
        const { colors, direction } = selected;
        const isVertical = direction === GRADIENT_DIRECTION.VERTICAL;
        const gradient = new Cairo.LinearGradient(0, 0, isVertical ? 0 : width, isVertical ? height : 0);
        [colors.start, colors.end].forEach((color, index) => {
            const rgba = new Gdk.RGBA();
            rgba.parse(color);
            gradient.addColorStopRGBA(index, rgba.red, rgba.green, rgba.blue, rgba.alpha);
        });
        cr.setSource(gradient);
        cr.paint();
    });

    return preview;
};

export const createGradientEditor = (startTitle, endTitle, getGradient, saveColor) => {
    const preview = createGradientPreview(getGradient);
    const editor = new Gtk.Overlay({
        child: preview,
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12
    });
    // Endpoint positions describe the physical gradient, including in RTL locales.
    editor.set_direction(Gtk.TextDirection.LTR);

    const buttons = [startTitle, endTitle].map((title, index) => {
        const endpoint = index === 0 ? 'start' : 'end';
        const button = createColorPickerButton(
            title,
            () => getGradient().colors[endpoint],
            color => saveColor(endpoint, color)
        );
        button.set_margin_top(12);
        button.set_margin_bottom(12);
        button.set_margin_start(12);
        button.set_margin_end(12);
        editor.add_overlay(button);
        return button;
    });

    const refresh = () => {
        const isVertical = getGradient().direction === GRADIENT_DIRECTION.VERTICAL;
        buttons.forEach((button, index) => {
            const edge = index === 0 ? Gtk.Align.START : Gtk.Align.END;
            button.set_halign(isVertical ? Gtk.Align.CENTER : edge);
            button.set_valign(isVertical ? edge : Gtk.Align.CENTER);
        });
        // Alignment changes alone leave the overlay allocation cached.
        editor.queue_allocate();
        preview.queue_draw();
    };
    refresh();

    return { widget: editor, refresh };
};
