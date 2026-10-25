import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const createEditor = async () => {
    const pending = new Map();
    const writes = [];
    let nextId = 0;
    const settings = { distance: 30 };
    class SpinRow {
        constructor({ adjustment }) { this.value = adjustment.value; }
        connect(signal, callback) {
            assert.equal(signal, 'notify::value');
            this.changed = callback;
        }
        set_value(value) {
            if (this.value === value) return;
            this.value = value;
            this.changed();
        }
    }
    const stubs = {
        'gi://Gtk': { default: { Adjustment: class { constructor(properties) { Object.assign(this, properties); } } } },
        'gi://Adw': { default: { SpinRow } },
        'gi://GLib': { default: {
            PRIORITY_DEFAULT: 0,
            SOURCE_REMOVE: false,
            Source: { remove(id) { assert(pending.delete(id), 'Only remove a live timer'); } },
            timeout_add(_priority, _delay, callback) { pending.set(++nextId, callback); return nextId; }
        } },
        '../../config.js': {
            PROXIMITY_DISTANCE: 'proximity-distance',
            getSettingRange: () => [0, 100],
            getProximityDistance: s => s.distance,
            setProximityDistance(s, value) { s.distance = value; writes.push(value); editor.refresh(); }
        },
        'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js': { gettext: text => text }
    };
    const module = new SourceTextModule(await readFile(new URL('../src/settings/components/proximityDistanceEditor.js', import.meta.url), 'utf8'));
    await module.link(specifier => {
        const values = stubs[specifier];
        assert(values, `Unexpected import: ${specifier}`);
        return new SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        });
    });
    await module.evaluate();
    const editor = module.namespace.createProximityDistanceEditor(settings);
    const expire = () => {
        for (const [id, callback] of [...pending]) {
            pending.delete(id);
            assert.equal(callback(), false);
        }
    };
    return { editor, settings, writes, pending, expire };
};

test('rapid edits save only the latest distance after the delay', async () => {
    const { editor, settings, writes, pending, expire } = await createEditor();
    editor.widget.set_value(40);
    editor.widget.set_value(65);
    assert.equal(settings.distance, 30);
    assert.deepEqual(writes, []);
    assert.equal(pending.size, 1);
    expire();
    assert.deepEqual(writes, [65]);
    assert.equal(pending.size, 0, 'The settings notification must not schedule another save');
});

test('returning to the saved distance cancels an earlier edit', async () => {
    const { editor, writes, pending, expire } = await createEditor();
    editor.widget.set_value(65);
    editor.widget.set_value(30);
    assert.equal(pending.size, 0);
    expire();
    assert.deepEqual(writes, []);
});

for (const [reason, distance] of [['reset to the unchanged default', 30], ['external change', 80]]) {
    test(`${reason} cancels the pending edit and refreshes the row`, async () => {
        const { editor, settings, writes, pending, expire } = await createEditor();
        editor.widget.set_value(65);
        settings.distance = distance;
        editor.refresh();
        assert.equal(editor.widget.value, distance);
        assert.equal(pending.size, 0);
        expire();
        assert.equal(settings.distance, distance);
        assert.deepEqual(writes, []);
    });
}

test('closing commits the latest edit once and removes its timer', async () => {
    const { editor, settings, writes, pending, expire } = await createEditor();
    editor.widget.set_value(65);
    editor.commit();
    assert.equal(settings.distance, 65);
    assert.equal(pending.size, 0);
    expire();
    editor.commit();
    assert.deepEqual(writes, [65]);
});

test('initial refresh and closing an untouched editor do not write settings', async () => {
    const { editor, writes, pending } = await createEditor();
    editor.refresh();
    editor.commit();
    assert.equal(editor.widget.value, 30);
    assert.equal(pending.size, 0);
    assert.deepEqual(writes, []);
});
