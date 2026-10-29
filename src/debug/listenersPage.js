import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import { BUS_NAME, OBJECT_PATH } from './protocol.js';

const functionDetails = {
    Renderer: {
        'Window changed': {
            title: 'Update appearance after window changes',
            description: 'Requests an appearance update after a discrete window-state change.',
            method: 'Gradient.updateWindow()'
        },
        'Window progress': {
            title: 'Blend as windows approach',
            description: 'Updates the blend as a window approaches or moves away from the panel.',
            method: 'Gradient.followWindow()'
        },
        'Workspace progress': {
            title: 'Blend during workspace swipes',
            description: 'Updates the blend during a workspace swipe.',
            method: 'Gradient.updateWorkspaceProgress()'
        },
        'Workspace completed': {
            title: 'Finish workspace swipe',
            description: 'Settles the appearance when the swipe finishes.',
            method: 'Gradient.completeWorkspace()'
        },
        'Overview changed': {
            title: 'Update overview appearance',
            description: 'Updates the appearance for overview opening, closing, or gesture progress.',
            method: 'Gradient.updateOverview()'
        }
    },
    Work: {
        'Window scan': {
            title: 'Check windows for panel effects',
            description: 'Checks a workspace’s windows to calculate the required effect strength.',
            method: 'WindowEvents.getEffectStrengthForWorkspace()'
        },
        'Batched geometry refresh': {
            title: 'Combine window movement updates',
            description: 'Processes queued movement and resize events together before redraw.',
            method: 'WindowEvents.#scheduleUpdate() → before-redraw callback'
        },
        'Apply settings': {
            title: 'Apply preference changes',
            description: 'Applies queued settings changes after the debounce delay.',
            method: 'GradientTopBar.#scheduleConfigure() → timeout callback'
        }
    }
};

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
            .listener-count { border-radius: 99px; padding: 4px 10px; min-width: 20px; background-color: alpha(currentColor, 0.08); }
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
        const headerActions = new Gtk.Box({ spacing: 12, valign: Gtk.Align.CENTER });
        headerActions.append(new Gtk.Image({ icon_name: 'utilities-system-monitor-symbolic', pixel_size: 24 }));
        headerActions.append(reset);
        this._status.header_suffix = headerActions;
        const summary = new Gtk.Grid({
            column_homogeneous: true, column_spacing: 24, row_spacing: 16,
            margin_top: 8, margin_bottom: 16, margin_start: 12, margin_end: 12
        });
        this._summaryLabels = new Map();
        [
            ['connections', 'Total connections'],
            ['desktopConnections', 'Desktop connections'],
            ['callbacks', 'Total signal callbacks'],
            ['desktopCallbacks', 'Desktop signal callbacks']
        ].forEach(([key, title], index) => {
            const metric = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4 });
            const value = new Gtk.Label({ label: '—', css_classes: ['title-1', 'numeric'], tooltip_text: title });
            metric.append(value);
            metric.append(new Gtk.Label({ label: title, wrap: true, css_classes: ['caption'] }));
            if (key.startsWith('desktop'))
                metric.tooltip_text = 'Excludes Settings';
            summary.attach(metric, index % 2, Math.floor(index / 2), 1, 1);
            this._summaryLabels.set(key, value);
        });
        this._status.add(summary);
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
                        for (const value of this._summaryLabels.values())
                            value.label = '—';
                        for (const badge of this._badges.values()) {
                            badge.label = '?';
                            badge.remove_css_class('success');
                            badge.remove_css_class('error');
                            badge.tooltip_text = 'Live data unavailable';
                            badge.update_property([Gtk.AccessibleProperty.LABEL], ['Live data unavailable']);
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
        const totals = { connections: 0, desktopConnections: 0, callbacks: 0, desktopCallbacks: 0 };
        for (const row of snapshot.rows) {
            if (row.kind !== 'signal')
                continue;
            totals.connections += row.active;
            totals.callbacks += row.calls;
            if (row.group !== 'Settings') {
                totals.desktopConnections += row.active;
                totals.desktopCallbacks += row.calls;
            }
        }
        for (const [key, value] of Object.entries(totals))
            this._summaryLabels.get(key).label = String(value);
        this._status.description = null;
        const previous = this._previous;
        const interval = previous && snapshot.generation === previous.generation
            ? (snapshot.elapsedUs - previous.elapsedUs) / 1e6 : 0;
        const previousRows = new Map((previous?.rows ?? []).map(row => [`${row.group}:${row.signal}:${row.kind}`, row]));
        for (const row of snapshot.rows) {
            const key = `${row.group}:${row.signal}:${row.kind}`;
            const details = row.kind === 'work' ? functionDetails[row.group]?.[row.signal] : null;
            if (!this._groups.has(row.group)) {
                const isFunctionGroup = row.group === 'Renderer' || row.group === 'Work';
                const group = new Adw.PreferencesGroup({
                    title: isFunctionGroup ? `${row.group} functions` : row.group,
                    description: row.group === 'Renderer'
                        ? 'Functions that apply window, workspace and overview changes to the panel appearance. Calls can finish without changing the display.'
                        : null
                });
                if (row.group === 'Work')
                    group.description = 'Functions that scan windows, batch movement and resize events, and apply queued settings changes.';
                this._groups.set(row.group, group);
                this.add(group);
                for (const name of ['Renderer', 'Work', 'Panel menu', 'Settings']) {
                    const bottomGroup = this._groups.get(name);
                    if (bottomGroup) {
                        this.remove(bottomGroup);
                        this.add(bottomGroup);
                    }
                }
            }
            if (!this._rows.has(key)) {
                const widget = new Adw.ActionRow({ title: details?.title ?? row.signal, use_markup: true });
                const badge = new Gtk.Label({ valign: Gtk.Align.CENTER, css_classes: ['listener-count', 'caption-heading'] });
                if (row.kind === 'work')
                    badge.add_css_class('callback-count');
                widget.add_suffix(badge);
                this._badges.set(key, badge);
                this._groups.get(row.group).add(widget);
                this._rows.set(key, widget);
            }
            const rate = interval > 0 ? Math.max(0, row.calls - (previousRows.get(key)?.calls ?? 0)) / interval : 0;
            let subtitle = row.kind === 'signal'
                ? `${row.active} connected · ${row.calls} callbacks · ${rate.toFixed(1)}/s`
                : `Function · ${rate.toFixed(1)}/s`;
            if (row.timedCalls > 0)
                subtitle += `\nTimed ${row.timedCalls}: avg ${(row.totalUs / row.timedCalls).toFixed(1)} µs · max ${row.maxUs.toFixed(1)} µs · total ${(row.totalUs / 1000).toFixed(2)} ms`;

            this._rows.get(key).subtitle = details ? `${details.description}\n<tt>${details.method}</tt>\n${subtitle}` : subtitle;
            const badge = this._badges.get(key);
            if (badge) {
                if (row.kind === 'signal') {
                    const isActive = row.active > 0;
                    badge.label = isActive ? 'On' : 'Off';
                    badge.remove_css_class(isActive ? 'error' : 'success');
                    badge.add_css_class(isActive ? 'success' : 'error');
                    badge.tooltip_text = isActive ? `${row.active} active connections` : 'No active connections';
                } else {
                    badge.label = String(row.calls);
                    badge.tooltip_text = `${row.calls} callbacks since reset`;
                }
                badge.update_property([Gtk.AccessibleProperty.LABEL], [badge.tooltip_text]);
            }
        }
        this._previous = snapshot;
    }
});
