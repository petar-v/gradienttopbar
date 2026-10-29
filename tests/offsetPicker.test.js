import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModuleLoader } from './fixtures/modules.js';

test('offset picker centres pointer mapping in rectangular allocations and clamps dragging', async () => {
    const signals = new Map();
    let width = 300;
    let height = 180;
    let offsets = null;
    const load = createModuleLoader({
        'gi://Gtk': {
            default: {
                Align: { CENTER: 0 },
                DrawingArea: class {
                    get_width() { return width; }
                    get_height() { return height; }
                    set_cursor_from_name() {}
                    set_draw_func() {}
                    add_controller() {}
                },
                GestureDrag: class {
                    connect(signal, callback) { signals.set(signal, callback); }
                }
            }
        },
        'gi://Gdk': { default: {} },
        'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js': { gettext: text => text }
    });
    const { createOffsetPicker } = (await load('settings/components/offsetPicker.js')).namespace;
    createOffsetPicker(() => [0, 0], () => 'black', (x, y) => { offsets = [x, y]; }, [[-6, 6], [-6, 6]]);
    signals.get('drag-begin')(null, 150, 90);
    assert.deepEqual(offsets, [0, 0], 'Centre maps to zero for a wide allocation');
    signals.get('drag-update')(null, -89, 89);
    assert.deepEqual(offsets, [-6, 6], 'The centred square edges map to the full range');
    signals.get('drag-update')(null, 1000, -1000);
    assert.deepEqual(offsets, [6, -6], 'Dragging beyond the square stays within the settings range');
    width = 180;
    height = 300;
    signals.get('drag-begin')(null, 90, 150);
    assert.deepEqual(offsets, [0, 0], 'Centre maps to zero for a tall allocation');
    width = height = 0;
    signals.get('drag-begin')(null, 100, 100);
    assert.deepEqual(offsets, [0, 0], 'Unallocated widgets do not write offsets');
});
