import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import ListenersPage from '../src/debug/listenersPage.js';
import { monitor, start, stop } from '../src/debug/runtime.js';
import { assert } from './fixtures/gjs.js';
import { findWidget as find } from './fixtures/preferences.js';

Adw.init();
const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));

const main = async () => {
    start();
    const window = new Adw.PreferencesWindow({ default_width: 760, default_height: 720 });
    const page = new ListenersPage(window);
    window.add(page);
    const action = new Gio.SimpleAction({ name: 'probe' });
    const settingsId = monitor.connect(action, 'notify::enabled', () => {}, 'Settings');
    const panelId = monitor.connect(action, 'notify::state', () => {}, 'Panel menu');
    const id = monitor.connect(action, 'activate', () => {}, 'Test');
    const render = monitor.work('Renderer', 'Window changed', () => {});
    render();
    monitor.work('Work', 'Window scan', () => {})();
    const actionStats = () => monitor.snapshot().rows.find(item => item.group === 'Test');
    action.activate(null);
    window.present();
    try {
        await wait(350);
        const row = find(page, widget => widget instanceof Adw.ActionRow && widget.title === 'activate');
        assert(row && row.subtitle.includes('1 callbacks'), 'D-Bus snapshots reach the preferences page');
        assert(page._summaryLabels.get('connections').label === '3', 'The summary shows total signal connections');
        assert(page._summaryLabels.get('desktopConnections').label === '2', 'Desktop connection totals exclude Settings');
        assert(page._summaryLabels.get('callbacks').label === '1' && page._summaryLabels.get('desktopCallbacks').label === '1', 'Callback totals exclude function calls');
        assert(page._status.description === '', 'The verbose summary paragraph is removed');
        const badge = find(row, widget => widget instanceof Gtk.Label && widget.has_css_class('listener-count'));
        assert(badge && badge.label === 'On' && badge.has_css_class('success'), 'Active listeners show a green On badge');
        const groupTitles = [];
        find(page, widget => {
            if (widget instanceof Adw.PreferencesGroup)
                groupTitles.push(widget.title);
            return false;
        });
        assert(groupTitles.at(-1) === 'Settings', 'Settings stay last even when other groups appear later');
        assert(groupTitles.at(-2) === 'Panel menu', 'Panel listeners stay directly above Settings');
        for (const title of ['Renderer functions', 'Work functions']) {
            const group = find(page, widget => widget instanceof Adw.PreferencesGroup && widget.title === title);
            assert(group && group.description.length > 0, 'Function groups have explanatory descriptions');
        }
        const functionRow = find(page, widget => widget instanceof Adw.ActionRow && widget.title === 'Update appearance after window changes');
        const functionBadge = find(functionRow, widget => widget instanceof Gtk.Label && widget.has_css_class('callback-count'));
        assert(functionRow.subtitle.startsWith('Requests an appearance update') && functionRow.subtitle.includes('\nFunction') && functionBadge.label === '1', 'Functions show descriptions, live statistics and callback totals in a badge');
        const reset = find(page, widget => widget instanceof Gtk.Button && widget.label === 'Reset statistics');
        assert(reset, 'The reset control names the statistics it clears');
        reset.emit('clicked');
        await wait(150);
        assert(actionStats().active === 1 && actionStats().calls === 0, 'Reset clears accumulated statistics but retains live connections');
        page._refresh();
        await wait(150);
        assert(functionBadge.label === '0', 'Reset clears the function callback badge');
        action.activate(null);
        const timing = find(page, widget => widget instanceof Adw.SwitchRow && widget.title === 'Measure callback duration');
        timing.active = true;
        await wait(150);
        action.activate(null);
        assert(monitor.snapshot().timing && actionStats().timedCalls === 1, 'Timing control reaches the running monitor');
        const collecting = find(page, widget => widget instanceof Adw.SwitchRow && widget.title === 'Collect callbacks');
        collecting.active = false;
        await wait(150);
        action.activate(null);
        assert(actionStats().calls === 2, 'Pause preserves callback behavior without adding counts');
        monitor.disconnect(action, id);
        monitor.disconnect(action, settingsId);
        monitor.disconnect(action, panelId);
        await wait(1200);
        assert(row.subtitle.includes('0 connected'), 'Disconnected listeners remain visible with zero active handlers');
        assert(badge.label === 'Off' && badge.has_css_class('error') && !badge.has_css_class('success'), 'Inactive listeners change to a red Off badge');
        stop();
        await wait(50);
        page._refresh();
        await wait(150);
        assert(badge.label === '?' && !badge.has_css_class('success') && !badge.has_css_class('error'), 'An unavailable runtime never presents stale counts as live');
        window.close();
        await wait(50);
        assert(page._timerId === null && page._closed, 'Closing preferences stops polling and cancels requests');
        print('PASS debug preferences D-Bus counts, timing, pause and cleanup');
    } finally {
        window.close();
        stop();
    }
};

await main();
