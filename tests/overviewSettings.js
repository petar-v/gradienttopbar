import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw';
import { normalizeColor } from '../src/colors.js';
import { getConfig, attachSettingsListeners, detachSettingsListeners } from '../src/config.js';
import { assert, test, run } from './fixtures/gjs.js';
import { initializePreferences, createSettingsFixture, trackWindow, findWidget as find, patch, waitUntil } from './fixtures/preferences.js';

await initializePreferences();
const { default: Gradients } = await import('../src/settings/gradientsPage.js');
const { default: Behavior } = await import('../src/settings/behavioursPage.js');

const createOverviewFixture = t => {
    const { settings, schema } = createSettingsFixture(t);
    const window = trackWindow(t, new Adw.PreferencesWindow());
    const page = new Gradients(window, settings);
    window.add(page);
    const behaviorPage = new Behavior(window, settings);
    window.add(behaviorPage);
    window.present();
    return { settings, schema, window, page, behaviorPage };
};
const waitForDistanceSave = () => waitUntil(() => false, 400);

test('overview defaults and transition controls remain independent', t => {
    const { settings, page, behaviorPage } = createOverviewFixture(t);
    assert(getConfig(settings).overviewBehavior === 'keep-gradient', 'Upgrade must keep the main gradient in overview');
    assert(page.title === 'Gradients', 'Gradient settings have their own tab');
    const transitions = find(behaviorPage, widget => widget instanceof Adw.PreferencesGroup && widget.title === 'Transitions');
    const proximityBlend = find(transitions, widget => widget instanceof Adw.SwitchRow && widget.title === 'Blend as windows approach');
    const overviewBlend = find(transitions, widget => widget instanceof Adw.SwitchRow && widget.title === 'Blend with overview gestures');
    assert(proximityBlend && overviewBlend, 'Both blending controls belong to Transitions');
    assert(!find(page, widget => widget instanceof Adw.SwitchRow && widget.title === 'Blend with overview gestures'), 'Overview blending moved out of Gradients');
    overviewBlend.active = true;
    assert(settings.get_boolean('overview-transition'), 'Overview blending writes its setting');
    settings.set_boolean('overview-transition', false);
    assert(!overviewBlend.active, 'Overview blending refreshes from settings');
    settings.set_string('maximized-behavior', 'keep-gradient');
    settings.set_string('style-trigger', 'proximity');
    assert(!proximityBlend.is_sensitive() && overviewBlend.is_sensitive(), 'Disabled window interaction leaves overview blending available');
    settings.set_string('maximized-behavior', 'keep-theme');
    assert(proximityBlend.is_sensitive(), 'Window blending is available with proximity interaction');
    settings.set_string('style-trigger', 'maximized');
    assert(!proximityBlend.is_sensitive(), 'Window blending is unavailable with maximized interaction');
});

test('workspace gesture blending defaults, binds independently and resets with transitions', t => {
    const { settings, window, behaviorPage } = createOverviewFixture(t);
    const row = find(behaviorPage, widget => widget instanceof Adw.SwitchRow && widget.title === 'Blend with workspace gestures');
    assert(row, 'Workspace blending is exposed in Behaviour');
    assert(getConfig(settings).workspaceGestureBlending === true && row.active, 'Workspace blending defaults on');
    const transitions = find(behaviorPage, widget => widget instanceof Adw.PreferencesGroup && widget.title === 'Transitions');
    assert(find(transitions, widget => widget === row), 'Workspace blending belongs beside overview blending');
    const changed = [];
    const handlers = attachSettingsListeners(settings, (_settings, key) => changed.push(key));
    t.after(() => detachSettingsListeners(settings, handlers));
    assert(handlers.length === 18, 'Runtime subscribes to every rendering setting');
    row.active = false;
    assert(!settings.get_boolean('workspace-gesture-blending'), 'The row writes its setting');
    assert(changed.includes('workspace-gesture-blending'), 'Workspace blending notifies runtime');
    settings.set_boolean('workspace-gesture-blending', true);
    assert(row.active, 'External settings refresh the row');
    for (const workspace of [false, true]) {
        for (const overview of [false, true]) {
            settings.set_boolean('workspace-gesture-blending', workspace);
            settings.set_boolean('overview-transition', overview);
            assert(row.active === workspace && getConfig(settings).overviewTransition === overview, 'The two gesture controls remain independent');
        }
    }
    settings.set_boolean('workspace-gesture-blending', false);
    settings.set_boolean('overview-transition', true);
    settings.set_boolean('proximity-transition', false);
    const before = new Map(settings.settings_schema.list_keys().map(key => [key, settings.get_value(key)]));
    const reset = find(behaviorPage, widget => widget instanceof Gtk.Button && widget.tooltip_text === 'Reset transitions?');
    reset.emit('clicked');
    let dialog = window.get_visible_dialog();
    dialog.emit('response', 'cancel');
    dialog.force_close();
    assert(!row.active, 'Cancelling leaves the saved choice intact');
    reset.emit('clicked');
    dialog = window.get_visible_dialog();
    dialog.emit('response', 'reset');
    dialog.force_close();
    for (const [key, value] of before) {
        const expected = ['proximity-transition', 'overview-transition', 'workspace-gesture-blending'].includes(key) ? settings.get_default_value(key) : value;
        assert(settings.get_value(key).equal(expected), `Transition reset changed the wrong setting: ${key}`);
    }
    assert(row.active && getConfig(settings).workspaceGestureBlending, 'Reset restores workspace blending');
});

test('workspace blending sensitivity follows only effective desktop appearances and preserves saved values', t => {
    const { settings, behaviorPage } = createOverviewFixture(t);
    const row = find(behaviorPage, widget => widget instanceof Adw.SwitchRow && widget.title === 'Blend with workspace gestures');
    assert(row, 'Workspace blending row exists');
    settings.set_boolean('workspace-gesture-blending', false);
    settings.set_string('maximized-behavior', 'keep-gradient');
    settings.set_string('overview-behavior', 'apply-style');
    settings.set_strv('overview-colors', ['red', 'blue']);
    assert(!row.is_sensitive() && !row.active, 'Overview-only changes cannot enable desktop blending');
    settings.set_string('maximized-behavior', 'keep-theme');
    assert(row.is_sensitive() && !row.active, 'Original theme differs from a custom gradient and preserves the saved choice');
    settings.set_string('maximized-behavior', 'apply-style');
    settings.set_strv('colors', ['rgba(255,0,0,1)', 'rgba(0,0,255,0.5)']);
    settings.set_strv('maximized-colors', ['rgb(255, 0, 0)', 'rgba(0, 0, 255, 0.5)']);
    settings.set_string('gradient-direction', 'vertical');
    settings.set_string('maximized-gradient-direction', 'vertical');
    assert(!row.is_sensitive() && !row.active, 'Normalized equivalent gradients disable blending without changing its value');
    settings.set_string('gradient-direction', 'horizontal');
    assert(row.is_sensitive(), 'Main direction changes refresh sensitivity');
    settings.set_string('maximized-gradient-direction', 'horizontal');
    assert(!row.is_sensitive(), 'Alternate direction changes refresh sensitivity');
    settings.set_strv('colors', ['green', 'blue']);
    assert(row.is_sensitive(), 'Main colours refresh sensitivity');
    settings.set_strv('maximized-colors', ['green', 'blue']);
    assert(!row.is_sensitive(), 'Alternate colours refresh sensitivity');
    settings.set_boolean('workspace-gesture-blending', true);
    assert(row.active && !row.is_sensitive(), 'External saved choices remain visible while insensitive');
    settings.set_string('maximized-behavior', 'keep-theme');
    assert(row.is_sensitive() && row.active, 'Re-enabling interaction restores the saved active choice');
});

const gradients = [
    ['Gradient Direction', 'Gradient Start Colour', 'colors', 'gradient-direction'],
    ['Alternate Gradient Direction', 'Alternate Gradient Start Colour', 'maximized-colors', 'maximized-gradient-direction'],
    ['Overview Gradient Direction', 'Overview Gradient Start Colour', 'overview-colors', 'overview-gradient-direction']
];

for (const [title, startTitle, colorsKey, directionKey] of gradients) {
    test(`${title} edits only its own gradient`, t => {
        const { settings, page } = createOverviewFixture(t);
        patch(t, Gtk.ColorDialog.prototype, 'choose_rgba', function (_parent, _initial, _cancellable, callback) {
            callback(this, null);
        });
        patch(t, Gtk.ColorDialog.prototype, 'choose_rgba_finish', () => ({ to_string: () => 'rgb(12,34,56)' }));
        const row = find(page, widget => widget instanceof Adw.ComboRow && widget.title === title);
        assert(row, `${title} exists`);
        row.selected = 1;
        assert(settings.get_string(directionKey) === 'horizontal', `${title} writes its own direction`);
        settings.set_string(directionKey, 'vertical');
        assert(row.selected === 0, `${title} refreshes from settings`);
        const beforeColors = new Map(gradients.map(([, , key]) => [key, settings.get_value(key)]));
        const button = find(page, widget => widget instanceof Gtk.Button && widget.tooltip_text === startTitle);
        assert(button, `${startTitle} exists`);
        button.emit('clicked');
        assert(settings.get_strv(colorsKey)[0] === 'rgb(12,34,56)', `${startTitle} writes its own colour`);
        assert(normalizeColor(settings.get_strv(colorsKey)[1]) === normalizeColor(beforeColors.get(colorsKey).deep_unpack()[1]), `${startTitle} preserves the other endpoint's colour and alpha`);
        for (const [key, value] of beforeColors) {
            if (key !== colorsKey)
                assert(settings.get_value(key).equal(value), `${startTitle} leaves ${key} unchanged`);
        }
    });
}

test('overview controls refresh external changes, preserve other gradients and reject malformed colours', t => {
    const { settings, page } = createOverviewFixture(t);
    const behavior = find(page, widget => widget instanceof Adw.ComboRow && widget.title === 'When overview is open');
    const direction = find(page, widget => widget instanceof Adw.ComboRow && widget.title === 'Overview Gradient Direction');
    assert(behavior && direction, 'Overview exposes its behavior and direction controls');
    assert(!direction.is_visible(), 'Custom controls start hidden');
    behavior.selected = 2;
    assert(getConfig(settings).overviewBehavior === 'apply-style' && direction.is_visible(), 'Custom selection enables the editor');
    direction.selected = 1;
    assert(getConfig(settings).gradients.overview.direction === 'horizontal', 'Direction persists');
    const originalMain = settings.get_value('colors');
    const originalAlternate = settings.get_value('maximized-colors');
    const changed = [];
    const handlers = attachSettingsListeners(settings, (_settings, key) => changed.push(key));
    t.after(() => detachSettingsListeners(settings, handlers));
    settings.set_strv('overview-colors', ['rgba(255,0,0,0.4)', 'rgba(0,0,255,0.2)']);
    settings.set_string('overview-gradient-direction', 'vertical');
    settings.set_string('overview-behavior', 'keep-theme');
    assert(behavior.selected === 1 && direction.selected === 0 && !direction.is_visible(), 'External settings refresh controls');
    assert(changed.includes('overview-colors') && changed.includes('overview-gradient-direction') && changed.includes('overview-behavior'), 'All overview settings notify runtime');
    behavior.selected = 2;
    assert(getConfig(settings).gradients.overview.colors.start === 'rgba(255,0,0,0.4)', 'Switching modes preserves saved colours and opacity');
    assert(settings.get_value('colors').equal(originalMain) && settings.get_value('maximized-colors').equal(originalAlternate), 'Overview edits leave other gradients intact');
    settings.set_strv('overview-colors', []);
    assert(getConfig(settings).gradients.overview.colors.start === getConfig(settings).gradients.main.colors.start, 'Malformed colour pair falls back to main');
    settings.set_strv('overview-colors', ['invalid', 'rgba(0,0,255,0.2)']);
    assert(getConfig(settings).gradients.overview.colors.start === getConfig(settings).gradients.main.colors.start, 'Invalid overview colour falls back to main');
});

test('overview reset requires confirmation and resets only its own appearance', t => {
    const { settings, schema, window, page } = createOverviewFixture(t);
    settings.set_string('overview-behavior', 'apply-style');
    settings.set_strv('overview-colors', ['rgba(255,0,0,0.4)', 'rgba(0,0,255,0.2)']);
    settings.set_string('overview-gradient-direction', 'horizontal');
    const before = new Map(schema.list_keys().map(key => [key, settings.get_value(key)]));
    const reset = find(page, widget => widget instanceof Gtk.Button && widget.tooltip_text === 'Reset overview appearance?');
    assert(reset, 'Overview has the same reset affordance as other appearance groups');
    window.present();
    reset.emit('clicked');
    let dialog = window.get_visible_dialog();
    dialog.emit('response', 'cancel');
    dialog.force_close();
    assert(settings.get_string('overview-behavior') === 'apply-style', 'Cancelling reset preserves overview');
    reset.emit('clicked');
    dialog = window.get_visible_dialog();
    dialog.emit('response', 'reset');
    dialog.force_close();
    for (const [key, value] of before) {
        const expected = key.startsWith('overview-') && key !== 'overview-transition' ? settings.get_default_value(key) : value;
        assert(settings.get_value(key).equal(expected), `Overview reset changed the wrong setting: ${key}`);
    }
});

test('external proximity changes cancel pending edits', t => {
    const { settings, behaviorPage } = createOverviewFixture(t);
    const distance = find(behaviorPage, widget => widget instanceof Adw.SpinRow && widget.title === 'Proximity distance');
    distance.set_value(65);
    settings.set_int('proximity-distance', 80);
    assert(distance.value === 80, 'External distance changes replace pending edits in the row');
    waitForDistanceSave();
    assert(settings.get_int('proximity-distance') === 80, 'A pending edit cannot overwrite an external distance change');
});

test('reset cancels pending proximity edits even when the saved value is default', t => {
    const { settings, window, behaviorPage } = createOverviewFixture(t);
    const distance = find(behaviorPage, widget => widget instanceof Adw.SpinRow && widget.title === 'Proximity distance');
    settings.reset('proximity-distance');
    const defaultDistance = settings.get_int('proximity-distance');
    distance.set_value(65);
    const resetInteraction = find(behaviorPage, widget => widget instanceof Gtk.Button && widget.tooltip_text === 'Reset window interaction?');
    resetInteraction.emit('clicked');
    const dialog = window.get_visible_dialog();
    dialog.emit('response', 'reset');
    dialog.force_close();
    assert(distance.value === defaultDistance, 'Reset discards an edit even when the saved distance was already default');
    waitForDistanceSave();
    assert(settings.get_int('proximity-distance') === defaultDistance, 'No stale edit is saved after reset');
});

test('closing preferences commits the pending distance once', t => {
    const { settings, window, behaviorPage } = createOverviewFixture(t);
    const distance = find(behaviorPage, widget => widget instanceof Adw.SpinRow && widget.title === 'Proximity distance');
    distance.set_value(70);
    window.close();
    assert(settings.get_int('proximity-distance') === 70, 'Closing preferences immediately commits the pending distance');
    waitForDistanceSave();
    assert(settings.get_int('proximity-distance') === 70, 'Closing leaves no stale distance save');
});

run();
