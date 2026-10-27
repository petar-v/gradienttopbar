import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import { getConfig } from '../../config.js';
import { APPEARANCE_STATE, STYLE_TRIGGER, getAppearance } from '../../gradient/appearance.js';
import { createGradientPreview } from './gradientEditor.js';
import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const createShadowPreview = settings => {
    const states = [APPEARANCE_STATE.NORMAL, APPEARANCE_STATE.TRIGGERED, APPEARANCE_STATE.OVERVIEW];
    const styles = {
        [APPEARANCE_STATE.NORMAL]: gettext('Normal'),
        [APPEARANCE_STATE.TRIGGERED]: gettext('Triggered'),
        [APPEARANCE_STATE.OVERVIEW]: gettext('Overview')
    };
    let styleIndex = 0;
    const styleLabel = new Gtk.Label({ xalign: 0, css_classes: ['dim-label'] });
    const styleSwitch = new Gtk.Button({
        icon_name: 'view-refresh-symbolic',
        tooltip_text: gettext('Preview triggered appearance'),
        css_classes: ['circular', 'osd'],
        width_request: 40,
        height_request: 40,
        valign: Gtk.Align.CENTER
    });
    const getGradient = () => getAppearance(getConfig(settings), states[styleIndex]);
    const background = createGradientPreview(getGradient);
    background.set_content_height(72);
    const sample = new Gtk.Overlay({ child: background, hexpand: true });
    const previewIcons = [
        'weather-clear-symbolic', 'audio-volume-high-symbolic',
        'network-wireless-symbolic', 'mail-unread-symbolic',
        'starred-symbolic', 'preferences-system-symbolic'
    ];
    let iconIndex = 0;
    const sampleIcon = new Gtk.Image({ icon_name: previewIcons[iconIndex], pixel_size: 24 });
    const iconButton = new Gtk.Button({
        child: sampleIcon,
        tooltip_text: gettext('Show another preview icon'),
        css_classes: ['flat']
    });
    iconButton.connect('clicked', () => {
        iconIndex = (iconIndex + 1 + Math.floor(Math.random() * (previewIcons.length - 1))) % previewIcons.length;
        sampleIcon.set_from_icon_name(previewIcons[iconIndex]);
    });
    const sampleClock = new Gtk.Label({ label: GLib.DateTime.new_now_local().format('%H:%M') });
    const sampleTexts = [null, 'AaBbCc', 'Gradient', 'Lorem Ipsum'];
    let textIndex = 0;
    const sampleText = new Gtk.Label();
    const textClick = new Gtk.GestureClick();
    textClick.connect('released', () => {
        textIndex = (textIndex + 1) % sampleTexts.length;
        refresh();
    });
    sampleText.add_controller(textClick);
    const sampleContent = new Gtk.Box({
        spacing: 16,
        margin_start: 16,
        margin_end: 16,
        valign: Gtk.Align.CENTER,
        hexpand: true
    });
    const iconClockRow = new Gtk.Box({ spacing: 4, halign: Gtk.Align.CENTER });
    iconClockRow.append(iconButton);
    iconClockRow.append(sampleClock);
    sampleContent.append(iconClockRow);
    sampleText.set_hexpand(true);
    sampleContent.append(sampleText);
    sampleContent.append(styleSwitch);
    sample.add_overlay(sampleContent);
    const sampleStyle = new Gtk.CssProvider();
    for (const widget of [sampleIcon, sampleClock, sampleText])
        widget.get_style_context().add_provider(sampleStyle, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    const refresh = () => {
        const config = getConfig(settings);
        const { shadowOffsetX, shadowOffsetY, shadowBlur, shadowColor } = config;
        styles[APPEARANCE_STATE.TRIGGERED] = config.styleTrigger === STYLE_TRIGGER.PROXIMITY
            ? gettext('Window Nearby') : gettext('Window Maximized');

        const style = styles[states[styleIndex]];
        sampleText.set_label(sampleTexts[textIndex] ?? style);

        const originalTheme = getGradient() === null;
        const shadow = config.contentShadows && !originalTheme
            ? `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowColor}` : 'none';
        sampleStyle.load_from_string(`
        label { font-size: 24px; font-weight: bold; color: white; text-shadow: ${shadow}; }
        image { color: white; -gtk-icon-shadow: ${shadow}; }`);
        styleLabel.set_label(`${gettext('Preview')} · ${style}`);

        const nextStyle = styles[states[(styleIndex + 1) % states.length]];
        const nextLabel = gettext('Next preview style: %s').replace('%s', nextStyle);
        styleSwitch.set_tooltip_text(nextLabel);
        styleSwitch.update_property([Gtk.AccessibleProperty.LABEL], [nextLabel]);
        sample.set_tooltip_text(originalTheme
            ? gettext('Original Shell theme cannot be reproduced here; checkerboard shows unavailable background.')
            : gettext('Shadow preview using the configured gradient colours'));
        background.queue_draw();
    };

    styleSwitch.connect('clicked', () => {
        styleIndex = (styleIndex + 1) % states.length;
        refresh();
    });

    const widget = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 8,
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 16,
        margin_end: 16
    });
    const heading = new Gtk.Box({ spacing: 12 });
    styleLabel.set_hexpand(true);
    heading.append(styleLabel);
    heading.append(new Gtk.Label({
        label: gettext('Click to cycle styles'),
        css_classes: ['dim-label'],
        xalign: 1
    }));
    widget.append(heading);
    widget.append(sample);
    refresh();
    return { widget, refresh };
};
