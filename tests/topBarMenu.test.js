import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTopBarMenuFixture } from './fixtures/topBarMenu.js';

test('settings menu filters targets and respects modal interactions', async t => {
    const { state, panel, click, setModalCount } = await createTopBarMenuFixture(t);
    assert.equal(panel.actionPhase, 1, 'Settings gesture captures right-click before native window dragging');
    click();
    assert.equal(state.opened, 1, 'Empty panel opens menu');
    state.target = {};
    click();
    assert.equal(state.opened, 1, 'Panel controls do not open menu');
    state.target = panel._leftBox;
    click();
    assert.equal(state.opened, 2, 'Empty panel box opens menu');
    setModalCount(1);
    click();
    assert.equal(state.opened, 2, 'Modal interaction is preserved');
    setModalCount(0);
});

test('settings menu activation opens preferences', async t => {
    const { state } = await createTopBarMenuFixture(t);
    state.menu.activate();
    assert.equal(state.preferences, 1, 'Menu item opens preferences');
});

test('destroying the menu releases its gesture and popup', async t => {
    const { state, panel, interaction } = await createTopBarMenuFixture(t);
    interaction.destroy();
    assert.equal(panel.actions.size, 0, 'Gesture removed');
    assert.equal(state.menu.destroyed, true, 'Popup destroyed');
});
