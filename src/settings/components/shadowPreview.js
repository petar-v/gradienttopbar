import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import { getConfig } from '../../config.js';
import { MAXIMIZED_BEHAVIOR } from '../../constants.js';
import { createGradientPreview } from './gradientEditor.js';
import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const createShadowPreview = settings => {
    const styles = [gettext('Normal'), gettext('Triggered')];
    let styleIndex = 0;
    const styleLabel = new Gtk.Label({ xalign: 0, css_classes: ['dim-label'] });
    const styleSwitch = new Gtk.Button({
        icon_name: 'view-refresh-symbolic',
        tooltip_text: gettext('Preview triggered appearance'),
        css_classes: ['osd', 'circular'],
        valign: Gtk.Align.CENTER
    });
    const background = createGradientPreview(() => {
        const config = getConfig(settings);
        if (styleIndex === 1 && config.maximizedBehavior === MAXIMIZED_BEHAVIOR.KEEP_THEME)
            return null;
        const alternate = styleIndex === 1 && config.maximizedBehavior === MAXIMIZED_BEHAVIOR.APPLY_STYLE;
        return {
            colors: alternate ? config.maximizedColors : config.colors,
            direction: alternate ? config.maximizedGradientDirection : config.gradientDirection
        };
    });
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
    const sampleText = new Gtk.Label({ label: 'AaBbCc' });
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
        const originalTheme = styleIndex === 1 && config.maximizedBehavior === MAXIMIZED_BEHAVIOR.KEEP_THEME;
        const shadow = config.contentShadows && !originalTheme
            ? `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowColor}` : 'none';
        sampleStyle.load_from_string(`
        label { font-size: 24px; font-weight: bold; color: white; text-shadow: ${shadow}; }
        image { color: white; -gtk-icon-shadow: ${shadow}; }`);
        styleLabel.set_label(`${gettext('Preview')} · ${styles[styleIndex]}`);
        const nextStyle = styles[(styleIndex + 1) % styles.length];
        const nextLabel = gettext('Next preview style: %s').replace('%s', nextStyle);
        styleSwitch.set_tooltip_text(nextLabel);
        styleSwitch.update_property([Gtk.AccessibleProperty.LABEL], [nextLabel]);
        sample.set_tooltip_text(originalTheme
            ? gettext('Original Shell theme cannot be reproduced here; checkerboard shows unavailable background.')
            : gettext('Shadow preview using the configured gradient colours'));
        background.queue_draw();
    };

    styleSwitch.connect('clicked', () => {
        styleIndex = (styleIndex + 1) % styles.length;
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
    widget.append(styleLabel);
    widget.append(sample);
    refresh();
    return { widget, refresh };
};
