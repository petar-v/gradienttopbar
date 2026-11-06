import { cp, mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

const assertProductionSource = async source => {
    const names = await readdir(source, { recursive: true });
    await Promise.all(names.map(async name => {
        if (name.split(/[\\/]/).includes('debug') || ['diagnostics.js', 'buildConfig.js'].includes(basename(name)))
            throw new Error(`Monitoring file in production source: ${name}`);
        if (name.endsWith('.js')) {
            const content = await readFile(join(source, name), 'utf8');
            if (/diagnostics|measureWork|connectSignal|disconnectSignal|buildConfig|\bDEBUG\b|ListenersPage|ListenerMonitor|GradientTopBar\.Debug|listener-count|debug\//.test(content))
                throw new Error(`Monitoring reference in production source: ${name}`);
        }
    }));
};

export const prepareExtension = async ({ debug = false, sourceRoot = join(root, 'src') } = {}) => {
    const staging = await mkdtemp(join(tmpdir(), 'gradienttopbar-package-'));
    const source = join(staging, 'src');
    const cleanup = () => rm(staging, { recursive: true, force: true });
    try {
        await cp(sourceRoot, source, {
            recursive: true,
            filter: path => !['user-stylesheet.css', 'gschemas.compiled'].includes(basename(path))
        });
        await assertProductionSource(source);
        if (debug) {
            const patch = join(root, 'dev/monitoring/instrumentation.patch');
            try {
                await execute('git', ['apply', '--check', patch], { cwd: source });
                await execute('git', ['apply', patch], { cwd: source });
            } catch (cause) {
                throw new Error('The monitoring patch no longer applies; update dev/monitoring/instrumentation.patch.', { cause });
            }
            await cp(join(root, 'dev/monitoring/files'), source, { recursive: true });
        }
        return { directory: staging, source, cleanup };
    } catch (error) {
        await cleanup();
        throw error;
    }
};

export const packageExtension = async ({ debug = false, output } = {}) => {
    const archive = resolve(output ?? join(root, `gradienttopbar@pshow.org${debug ? '.debug' : ''}.shell-extension.zip`));
    const prepared = await prepareExtension({ debug });
    try {
        await execute('glib-compile-schemas', ['--strict', '--dry-run', join(prepared.source, 'schemas')]);
        await mkdir(dirname(archive), { recursive: true });
        const stagedArchive = join(prepared.directory, 'extension.zip');
        await execute('zip', ['-q', '-r', stagedArchive, '.'], { cwd: prepared.source });
        await cp(stagedArchive, archive);
        return archive;
    } finally {
        await prepared.cleanup();
    }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--debug'))
        throw new Error('Usage: node scripts/package.mjs [--debug]');
    console.log(await packageExtension({ debug: args.includes('--debug') }));
}
