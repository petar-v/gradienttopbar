// Run with: node tests/eventBoundary.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';

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
