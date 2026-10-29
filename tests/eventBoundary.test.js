// Run with: node tests/eventBoundary.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import { createModuleLoader } from './fixtures/modules.js';

test('event classes expose only their collaboration and lifecycle methods', async () => {
    const load = createModuleLoader({
        'resource:///org/gnome/shell/ui/main.js': { overview: {}, wm: {}, layoutManager: {}, screenShield: {}, panel: {} },
        'gi://Meta': { default: { MaximizeFlags: { VERTICAL: 2, BOTH: 3 } } }
    });
    const surfaces = [
        ['events/eventManager.js', ['configure', 'destroy', 'setOverviewCleanupNeeded']],
        ['events/signalConnections.js', ['connect', 'disconnect', 'disconnectAll']],
        ['events/observers/overviewEvents.js', ['configure', 'destroy', 'isHidden', 'isTargetVisible', 'progress']],
        ['events/observers/workspaceEvents.js', ['configure', 'disable', 'stopObservingWorkspaceSwipe', 'transition', 'isTransitioning']],
        ['events/observers/windowsEvents/windowEvents.js', [
            'configure', 'disable', 'getCurrentState', 'getEffectStrengthForWorkspace', 'setStateChangeCallback', 'updateState'
        ]],
        ['events/observers/windowsEvents/windowsDetectors/maximizedWindows.js', ['attachWindowEvents', 'getEffectStrength']],
        ['events/observers/windowsEvents/windowsDetectors/proximityWindows.js', ['attachWindowEvents', 'getEffectStrength']]
    ];
    await load('events/eventManager.js');
    await Promise.all(surfaces.map(async ([path, methods]) => {
        const { default: EventClass } = (await load(path)).namespace;
        assert.deepEqual(Object.getOwnPropertyNames(EventClass.prototype).sort(), ['constructor', ...methods].sort(), path);
    }));
});

const cases = [
    ['src/extension.js', "import Events from './events/eventManager.js';", false],
    ['src/extension.js', "import Windows from './events/observers/windowsEvents/windowEvents.js';", true],
    ['src/settings/page.js', "import Overview from '../events/observers/overviewEvents.js';", true],
    ['src/extension.js', "import Signals from './events/signalConnections.js';", true],
    ['src/extension.js', "export * from './events/observers/workspaceEvents.js';", true],
    ['src/events/eventManager.js', "import Windows from './observers/windowsEvents/windowEvents.js';", false]
];
for (const [filePath, code, restricted] of cases) {
    test(`event import boundary: ${filePath}: ${code}`, async () => {
        const eslint = new ESLint();
        const [result] = await eslint.lintText(code, { filePath });
        assert.equal(result.messages.some(message => message.ruleId === 'no-restricted-imports'), restricted,
            `Event boundary for ${filePath}: ${code}`);
    });
}
