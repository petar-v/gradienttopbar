import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { URL } from 'node:url';

const execute = promisify(execFile);

test('release and debug archives have independent flags and never modify the source flag', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'gradienttopbar-pack-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const { packageExtension } = await import('../scripts/package.mjs');
    const sourceFlag = await readFile(new URL('../src/buildConfig.js', import.meta.url), 'utf8');
    await Promise.all([true, false].map(async debug => {
        const archive = join(directory, `${debug}.zip`);
        await packageExtension({ debug, output: archive });
        const { stdout: files } = await execute('unzip', ['-Z1', archive]);
        assert.equal(files.includes('debug/runtime.js'), debug);
        assert.equal(files.includes('debug/listenersPage.js'), debug);
        const { stdout: flag } = await execute('unzip', ['-p', archive, 'buildConfig.js']);
        assert.equal(flag.trim(), `export const DEBUG = ${debug};`);
    }));
    assert.equal(await readFile(new URL('../src/buildConfig.js', import.meta.url), 'utf8'), sourceFlag);
});
