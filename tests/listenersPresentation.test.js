import assert from 'node:assert/strict';
import test from 'node:test';
import { createModuleLoader } from './fixtures/modules.js';

test('listener states and function counts have separate badges, with panel and settings last', async () => {
    class Group {
        constructor(properties) { Object.assign(this, properties); }
        children = [];
        add(child) { this.children.push(child); }
        remove(child) { this.children.splice(this.children.indexOf(child), 1); }
    }
    class Row {
        constructor(properties) { Object.assign(this, properties); }
        add_suffix(badge) { this.badge = badge; }
    }
    class Label {
        constructor(properties) { Object.assign(this, properties); this.classes = new Set(properties.css_classes); }
        add_css_class(name) { this.classes.add(name); }
        remove_css_class(name) { this.classes.delete(name); }
        update_property(_properties, values) { this.accessibleLabel = values[0]; }
    }
    const load = createModuleLoader({
        'gi://Adw': { default: { PreferencesPage: Group, PreferencesGroup: Group, ActionRow: Row } },
        'gi://Gtk': { default: { Label, Align: { CENTER: 0 }, AccessibleProperty: { LABEL: 0 } } },
        'gi://Gio': { default: {} },
        'gi://GLib': { default: {} },
        'gi://GObject': { default: { registerClass: type => type } }
    });
    const { default: Page } = (await load('debug/listenersPage.js')).namespace;
    const page = new Page();
    Object.assign(page, {
        _rows: new Map(), _groups: new Map(), _badges: new Map(), _status: {}, _collecting: {}, _timing: {},
        _summaryLabels: new Map(['connections', 'desktopConnections', 'callbacks', 'desktopCallbacks'].map(key => [key, {}]))
    });
    const row = (group, kind = 'signal') => ({ group, kind, signal: group, active: 1, calls: 7, timedCalls: 0 });
    const snapshot = { collecting: true, timing: false, generation: 1, elapsedUs: 0, rows: [row('Settings'), row('Panel menu'), row('Renderer', 'work'), row('Windows'), row('Work', 'work')] };
    page._render(snapshot);
    assert.equal(page._summaryLabels.get('connections').label, '3', 'Only signal connections count toward the total');
    assert.equal(page._summaryLabels.get('desktopConnections').label, '2', 'Desktop connections exclude Settings');
    assert.equal(page._summaryLabels.get('callbacks').label, '21', 'Signal callbacks exclude function counters');
    assert.equal(page._summaryLabels.get('desktopCallbacks').label, '14', 'Desktop callbacks exclude Settings and functions');
    assert.equal(page._status.description, null, 'The summary replaces the explanatory paragraph');
    assert.deepEqual(page.children.slice(-4).map(group => group.title), ['Renderer functions', 'Work functions', 'Panel menu', 'Settings']);
    assert(page._groups.get('Renderer').title.includes('functions'));
    assert(page._groups.get('Renderer').description.includes('appearance'));
    assert(page._groups.get('Work').description.includes('scan'));
    const signalBadge = page._rows.get('Windows:Windows:signal').badge;
    assert.equal(signalBadge.label, 'On');
    assert(signalBadge.classes.has('success'));
    const workRow = page._rows.get('Renderer:Renderer:work');
    assert(workRow.subtitle.startsWith('Function'));
    assert.equal(workRow.badge.label, '7');
    assert(workRow.badge.classes.has('callback-count'));
    snapshot.rows.find(item => item.group === 'Windows').active = 0;
    snapshot.rows.find(item => item.group === 'Renderer').calls = 0;
    snapshot.rows.push(row('Overview'));
    page._render({ ...snapshot, elapsedUs: 1000000 });
    assert.equal(page._summaryLabels.get('connections').label, '3');
    assert.equal(page._summaryLabels.get('desktopConnections').label, '2');
    assert.equal(page._summaryLabels.get('callbacks').label, '28');
    assert.equal(page._summaryLabels.get('desktopCallbacks').label, '21');
    assert.equal(signalBadge.label, 'Off');
    assert(signalBadge.classes.has('error') && !signalBadge.classes.has('success'));
    assert.equal(workRow.badge.label, '0');
    assert.deepEqual(page.children.slice(-4).map(group => group.title), ['Renderer functions', 'Work functions', 'Panel menu', 'Settings']);
    const descriptions = [
        ['Renderer', 'Window changed', 'discrete window-state change', 'Update appearance after window changes', 'Gradient.updateWindow()'],
        ['Renderer', 'Window progress', 'approaches or moves away', 'Blend as windows approach', 'Gradient.followWindow()'],
        ['Renderer', 'Workspace progress', 'workspace swipe', 'Blend during workspace swipes', 'Gradient.updateWorkspaceProgress()'],
        ['Renderer', 'Workspace completed', 'swipe finishes', 'Finish workspace swipe', 'Gradient.completeWorkspace()'],
        ['Renderer', 'Overview changed', 'opening, closing, or gesture progress', 'Update overview appearance', 'Gradient.updateOverview()'],
        ['Work', 'Window scan', 'required effect strength', 'Check windows for panel effects', 'WindowEvents.getEffectStrengthForWorkspace()'],
        ['Work', 'Batched geometry refresh', 'together before redraw', 'Combine window movement updates', 'WindowEvents.#scheduleUpdate() → before-redraw callback'],
        ['Work', 'Apply settings', 'debounce delay', 'Apply preference changes', 'GradientTopBar.#scheduleConfigure() → timeout callback']
    ];
    snapshot.rows.push(...descriptions.map(([group, signal]) => ({ ...row(group, 'work'), signal })));
    page._render({ ...snapshot, elapsedUs: 2000000 });
    for (const [group, signal, description, title, method] of descriptions) {
        const widget = page._rows.get(`${group}:${signal}:work`);
        assert.equal(widget.title, title);
        assert(widget.subtitle.includes(description), `${signal} explains its purpose in the row`);
        assert(widget.subtitle.includes(`<tt>${method}</tt>`), `${signal} identifies its class and method in monospace`);
        assert(widget.subtitle.includes('\nFunction · '), `${signal} retains its live statistics below the description`);
        assert.equal(widget.badge.label, '7');
    }
});
