import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {
    PROXIMITY_DISTANCE, getSettingRange, getProximityDistance, setProximityDistance
} from '../../config.js';

const PROXIMITY_DISTANCE_SAVE_DELAY_MS = 300;

export const createProximityDistanceEditor = settings => {
    const [minDistance, maxDistance] = getSettingRange(settings, PROXIMITY_DISTANCE);
    const widget = new Adw.SpinRow({
        title: gettext('Proximity distance'),
        subtitle: gettext('Distance from the panel in pixels'),
        adjustment: new Gtk.Adjustment({
            lower: minDistance,
            upper: maxDistance,
            step_increment: 1,
            page_increment: 5,
            value: getProximityDistance(settings)
        }),
        digits: 0
    });
    let timeoutId = null;

    const cancel = () => {
        if (timeoutId) {
            GLib.Source.remove(timeoutId);
            timeoutId = null;
        }
    };

    const commit = () => {
        cancel();
        const value = Math.round(widget.value);
        if (value !== getProximityDistance(settings))
            setProximityDistance(settings, value);
    };

    const refresh = () => {
        cancel();
        widget.set_value(getProximityDistance(settings));
    };

    widget.connect('notify::value', () => {
        cancel();
        if (Math.round(widget.value) === getProximityDistance(settings))
            return;

        timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PROXIMITY_DISTANCE_SAVE_DELAY_MS, () => {
            timeoutId = null;
            commit();
            return GLib.SOURCE_REMOVE;
        });
    });

    return { widget, refresh, commit };
};
