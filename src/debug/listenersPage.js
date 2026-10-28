import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import { BUS_NAME, OBJECT_PATH } from './protocol.js';

export default GObject.registerClass(class ListenersPage extends Adw.PreferencesPage {
    _init(window) {
        super._init({ title: 'Debug', name: 'Debug', icon_name: 'utilities-system-monitor-symbolic' });
        this._rows = new Map();
        this._badges = new Map();
        this._groups = new Map();
        this._timerId = null;
        this._closed = false;
        this._cancellable = new Gio.Cancellable();
        const badgeStyles = new Gtk.CssProvider();
        badgeStyles.load_from_string(`
            .listener-count { border-radius: 99px; padding: 4px 10px; min-width: 20px; }
            .listener-count.success { color: @success_color; background-color: alpha(@success_color, 0.15); }
            .listener-count.error { color: @error_color; background-color: alpha(@error_color, 0.15); }
        `);
        Gtk.StyleContext.add_provider_for_display(window.get_display(), badgeStyles, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        this._status = new Adw.PreferencesGroup({
            title: 'Listener monitor',
            description: 'Connecting to the running debug extension…'
        });
        const reset = new Gtk.Button({ label: 'Reset statistics', valign: Gtk.Align.CENTER, tooltip_text: 'Clear callback totals and timings; live connection counts stay unchanged' });
        reset.connect('clicked', () => this._call('Reset', null, () => {
            this._previous = null;
            this._refresh();
        }));
        this._status.header_suffix = reset;
        this._collecting = new Adw.SwitchRow({
            title: 'Collect callbacks', active: true,
            subtitle: 'Collection continues while you change settings on other tabs.'
        });
        this._timing = new Adw.SwitchRow({
            title: 'Measure callback duration',
            subtitle: 'Adds clock reads. Inclusive synchronous time; nested rows overlap. Excludes GPU work.'
        });
        this._status.add(this._collecting);
        this._status.add(this._timing);
        this.add(this._status);
        this._collecting.connect('notify::active', () => this._setOptions());
        this._timing.connect('notify::active', () => this._setOptions());
        this.connect('map', () => {
            this._previous = null;
            this._refresh();
            this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
                this._refresh();
                return GLib.SOURCE_CONTINUE;
            });
        });
        this.connect('unmap', () => this._stopPolling());
        window.connect('close-request', () => {
            this._closed = true;
            this._stopPolling();
            this._cancellable.cancel();
            Gtk.StyleContext.remove_provider_for_display(window.get_display(), badgeStyles);
            return false;
        });
    }

    _stopPolling() {
        if (this._timerId)
            GLib.Source.remove(this._timerId);
        this._timerId = null;
    }

    _call(method, parameters, onSuccess) {
        if (this._closed)
            return;
        Gio.DBus.session.call(BUS_NAME, OBJECT_PATH, BUS_NAME, method, parameters, null,
            Gio.DBusCallFlags.NO_AUTO_START, 1000, this._cancellable, (connection, result) => {
                try {
                    const reply = connection.call_finish(result);
                    if (!this._closed)
                        onSuccess(reply.deep_unpack());
                } catch (error) {
                    if (!this._closed) {
                        this._status.description = `Debug runtime unavailable. Enable the debug build; after reinstalling, log out and back in. ${error.message}`;
                        this._previous = null;
                        for (const badge of this._badges.values()) {
                            badge.label = '?';
                            badge.remove_css_class('success');
                            badge.remove_css_class('error');
                            badge.tooltip_text = 'Live count unavailable';
                            badge.update_property([Gtk.AccessibleProperty.LABEL], ['Live count unavailable']);
                        }
                    }
                } finally {
                    if (method === 'GetSnapshot')
                        this._busy = false;
                    if (method === 'SetOptions')
                        this._optionsBusy = false;
                }
            });
    }

    _setOptions() {
        if (this._updating)
            return;
        this._optionsBusy = true;
        this._call('SetOptions', new GLib.Variant('(bb)', [this._collecting.active, this._timing.active]), () => {});
    }

    _refresh() {
        if (this._busy || this._optionsBusy || this._closed)
            return;
        this._busy = true;
        this._call('GetSnapshot', null, ([json]) => this._render(JSON.parse(json)));
    }

    _render(snapshot) {
        if (!this._optionsBusy) {
            this._updating = true;
            this._collecting.active = snapshot.collecting;
            this._timing.active = snapshot.timing;
            this._updating = false;
        }
        const active = snapshot.rows.reduce((total, row) => total + row.active, 0);
        const calls = snapshot.rows.reduce((total, row) => total + (row.kind === 'signal' ? row.calls : 0), 0);
        this._status.description = `${active} signal connections · ${calls} signal callbacks · ${snapshot.collecting ? 'Collecting' : 'Paused'}. Counts since reset; rates since the last visible refresh. Monitor polling and cleanup hooks are excluded.`;
        const previous = this._previous;
        const interval = previous && snapshot.generation === previous.generation
            ? (snapshot.elapsedUs - previous.elapsedUs) / 1e6 : 0;
        const previousRows = new Map((previous?.rows ?? []).map(row => [`${row.group}:${row.signal}:${row.kind}`, row]));
        for (const row of snapshot.rows) {
            const key = `${row.group}:${row.signal}:${row.kind}`;
            if (!this._groups.has(row.group)) {
                const group = new Adw.PreferencesGroup({ title: row.group });
                this._groups.set(row.group, group);
                this.add(group);
                const settingsGroup = this._groups.get('Settings');
                if (settingsGroup && settingsGroup !== group) {
                    this.remove(settingsGroup);
                    this.add(settingsGroup);
                }
            }
            if (!this._rows.has(key)) {
                const widget = new Adw.ActionRow({ title: row.signal });
                if (row.kind === 'signal') {
                    const badge = new Gtk.Label({ valign: Gtk.Align.CENTER, css_classes: ['listener-count', 'numeric', 'caption-heading'] });
                    widget.add_suffix(badge);
                    this._badges.set(key, badge);
                }
                this._groups.get(row.group).add(widget);
                this._rows.set(key, widget);
            }
            const rate = interval > 0 ? Math.max(0, row.calls - (previousRows.get(key)?.calls ?? 0)) / interval : 0;
            const counts = row.kind === 'signal' ? `${row.active} connected` : 'Work counter';
            let subtitle = `${counts} · ${row.calls} callbacks · ${rate.toFixed(1)}/s`;
            if (row.timedCalls > 0)
                subtitle += `\nTimed ${row.timedCalls}: avg ${(row.totalUs / row.timedCalls).toFixed(1)} µs · max ${row.maxUs.toFixed(1)} µs · total ${(row.totalUs / 1000).toFixed(2)} ms`;

            this._rows.get(key).subtitle = subtitle;
            const badge = this._badges.get(key);
            if (badge) {
                const isActive = row.active > 0;
                badge.label = String(row.active);
                badge.remove_css_class(isActive ? 'error' : 'success');
                badge.add_css_class(isActive ? 'success' : 'error');
                badge.tooltip_text = isActive ? `${row.active} active connections` : 'No active connections';
                badge.update_property([Gtk.AccessibleProperty.LABEL], [badge.tooltip_text]);
            }
        }
        this._previous = snapshot;
    }
});
