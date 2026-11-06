import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, readdir, cp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { URL } from 'node:url';

const execute = promisify(execFile);
const forbidden = /diagnostics|measureWork|connectSignal|disconnectSignal|buildConfig|\bDEBUG\b|ListenersPage|debug\//;

test('release source and archive contain no monitoring code; debug overlay leaves source untouched', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'gradienttopbar-pack-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const { packageExtension } = await import('../scripts/package.mjs');
    const source = new URL('../src/', import.meta.url);
    const names = await readdir(source, { recursive: true });
    assert(!names.some(name => name === 'debug' || name === 'diagnostics.js' || name === 'buildConfig.js'));
    const scripts = names.filter(name => name.endsWith('.js'));
    const originals = await Promise.all(scripts.map(async name => [name, await readFile(new URL(name, source), 'utf8')]));
    for (const [name, content] of originals)
        assert(!forbidden.test(content), `Monitoring code remains in production ${name}`);
    const checkBuild = async debug => {
        const archive = join(directory, `${debug}.zip`);
        assert.equal(await packageExtension({ debug, output: archive }), archive);
        const { stdout: files } = await execute('unzip', ['-Z1', archive]);
        assert.equal(files.includes('debug/runtime.js'), debug);
        assert.equal(files.includes('debug/listenersPage.js'), debug);
        assert.equal(files.includes('diagnostics.js'), debug);
        assert(!files.includes('buildConfig.js'), 'The build flag is a packaging option, not shipped code');
        if (!debug) {
            const contents = await Promise.all(scripts.map(async name => {
                const { stdout } = await execute('unzip', ['-p', archive, name]);
                assert(!forbidden.test(stdout), `Monitoring reference leaked into release ${name}`);
                return [name, stdout];
            }));
            assert.deepEqual(contents, originals, 'Release JS matches production source byte for byte');
        }
    };
    await checkBuild(true);
    await checkBuild(false);
    const after = await Promise.all(scripts.map(async name => [name, await readFile(new URL(name, source), 'utf8')]));
    assert.deepEqual(after, originals, 'Debug packaging never patches the checkout');
});

test('an incompatible monitoring patch fails the debug build instead of silently dropping hooks', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'gradienttopbar-drift-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const { prepareExtension } = await import('../scripts/package.mjs');
    await cp(new URL('../src/', import.meta.url), directory, { recursive: true });
    await writeFile(join(directory, 'extension.js'), 'export default class ChangedExtension {}\n');
    await assert.rejects(prepareExtension({ debug: true, sourceRoot: directory }), /monitoring patch/i);
});

test('production signal connections receive original callbacks', async () => {
    const { default: SignalConnections } = await import('../src/events/signalConnections.js');
    const callback = () => false;
    const target = {
        connect: (_signal, received) => {
            assert.equal(received, callback);
            return 1;
        },
        disconnect() {}
    };
    const signals = new SignalConnections();
    signals.connect(target, 'changed', callback);
    signals.disconnectAll();
});

test('release preparation rejects accidentally reintroduced monitoring code', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'gradienttopbar-leak-test-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const { prepareExtension } = await import('../scripts/package.mjs');
    await cp(new URL('../src/', import.meta.url), directory, { recursive: true });
    await writeFile(join(directory, 'accidental.js'), "import './diagnostics.js';\n");
    await assert.rejects(prepareExtension({ sourceRoot: directory }), /monitoring.*accidental.js/i);
});
