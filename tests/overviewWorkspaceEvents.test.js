import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModuleLoader } from './fixtures/modules.js';

class Actor {
    constructor(children = []) {
        this.children = children;
        this.handlers = new Map();
        this.nextId = 0;
    }
    connect(signal, callback) {
        const id = ++this.nextId;
        this.handlers.set(id, { signal, callback });
        return id;
    }
    disconnect(id) { assert(this.handlers.delete(id)); }
    emit(signal, ...args) {
        for (const { signal: registered, callback } of [...this.handlers.values()]) {
            if (registered === signal)
                callback(this, ...args);
        }
    }
    get_children() { return this.children; }
    add(child) {
        this.emit('child-added', child);
        this.children.push(child);
    }
    destroy() { this.emit('destroy'); }
}
class Workspace extends Actor {}
class WorkspacesView extends Actor {
    constructor(index, children = []) {
        super(children);
        this._monitorIndex = index;
        this._workspaces = [];
    }
}

const fixture = async t => {
    const display = new Actor();
    display._workspacesViews = [];
    const main = { overview: { _overview: { controls: { _workspacesDisplay: display } } }, layoutManager: { primaryIndex: 0 } };
    const load = createModuleLoader({
        'resource:///org/gnome/shell/ui/main.js': main,
        'resource:///org/gnome/shell/ui/workspace.js': { Workspace },
        'resource:///org/gnome/shell/ui/workspacesView.js': { WorkspacesView }
    });
    const module = await load('events/observers/overviewEvents/workspacePreviewLifecycle.js');
    const events = [];
    const observer = new module.namespace.default(event => events.push(event));
    t.after(() => observer.destroy());
    return { observer, display, events };
};

test('observes initial and dynamic primary children before private arrays are published', async t => {
    const { observer, display, events } = await fixture(t);
    const first = new Workspace();
    const primary = new WorkspacesView(0, [first, new Actor()]);
    display.children.push(primary, new WorkspacesView(1, [new Workspace()]));
    observer.configure(true);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'added');
    assert.equal(events[0].workspace, first);
    const next = new Workspace();
    primary.emit('child-added', next);
    assert.equal(events.at(-1).workspace, next, 'Uses the signal argument before child/array publication');
    assert.equal(events.length, 2);
    primary.emit('child-added', next);
    observer.configure(true);
    assert.equal(events.length, 2, 'Repeated enable and child signals are deduplicated');
    const dynamic = new Workspace();
    const newView = new WorkspacesView(0, [dynamic]);
    display.emit('child-added', newView);
    assert.equal(events.at(-1).workspace, dynamic, 'Adopts a view before display array publication');
    newView.add(new Workspace());
    assert.equal(events.length, 4);
    display.add(new WorkspacesView(1, [new Workspace()]));
    display.add(new Actor([new Workspace()]));
    assert.equal(events.length, 4, 'Secondary and unrelated actors are skipped');
});

test('view and workspace destruction emit one removal and disconnect all owned signals', async t => {
    const { observer, display, events } = await fixture(t);
    const first = new Workspace();
    const second = new Workspace();
    const view = new WorkspacesView(0, [first, second]);
    display.children.push(view);
    observer.configure(true);
    first.destroy();
    assert.equal(events.length, 3);
    assert.equal(events.at(-1).type, 'removed');
    assert.equal(events.at(-1).workspace, first);
    assert.equal(first.handlers.size, 0);
    first.destroy();
    view.destroy();
    assert.equal(events.length, 4);
    assert.equal(events.at(-1).workspace, second);
    assert.equal(events.at(-1).type, 'removed');
    assert.equal(view.handlers.size, 0);
    assert.equal(second.handlers.size, 0);
    second.destroy();
    assert.equal(events.length, 4, 'A later child destroy does not duplicate removal');
    observer.destroy();
    assert.equal(display.handlers.size, 0);
});

test('disable clears silently and re-enable adopts the current live children once', async t => {
    const { observer, display, events } = await fixture(t);
    const workspace = new Workspace();
    const view = new WorkspacesView(0, [workspace]);
    display.children.push(view);
    observer.configure(false);
    assert.equal(display.handlers.size, 0);
    observer.configure(true);
    observer.configure(false);
    assert.equal(events.length, 1, 'Disable leaves restoration to the geometry owner');
    for (const actor of [display, view, workspace])
        assert.equal(actor.handlers.size, 0);
    observer.configure(true);
    assert.equal(events.length, 2);
    observer.destroy();
    observer.destroy();
    assert.equal(events.length, 2, 'Destroy is idempotent and silent');
    for (const actor of [display, view, workspace])
        assert.equal(actor.handlers.size, 0);
});


test('signal hookup precedes scans and adopted workspaces survive their previous view destruction', async t => {
    const { observer, display, events } = await fixture(t);
    const workspace = new Workspace();
    const view = new WorkspacesView(0);
    display.get_children = () => {
        display.emit('child-added', view);
        return [view];
    };
    view.get_children = () => {
        view.emit('child-added', workspace);
        return [workspace];
    };
    observer.configure(true);
    assert.equal(events.length, 1, 'Signals emitted during either scan are captured and deduplicated');
    const replacement = new WorkspacesView(0);
    display.emit('child-added', replacement);
    replacement.emit('child-added', workspace);
    view.destroy();
    assert.equal(events.length, 1, 'An adopted workspace remains owned by its new view');
    workspace.destroy();
    assert.equal(events.length, 2);
    assert.equal(events.at(-1).type, 'removed');
});
