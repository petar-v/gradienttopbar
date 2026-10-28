import { cp, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

export const packageExtension = async ({ debug = false, output } = {}) => {
    const archive = resolve(output ?? join(root, `gradienttopbar@pshow.org${debug ? '.debug' : ''}.shell-extension.zip`));
    const staging = await mkdtemp(join(tmpdir(), 'gradienttopbar-package-'));
    try {
        await cp(join(root, 'src'), staging, {
            recursive: true,
            filter: path => (debug || path !== join(root, 'src/debug')) && !['user-stylesheet.css', 'gschemas.compiled'].includes(basename(path))
        });
        await writeFile(join(staging, 'buildConfig.js'), `export const DEBUG = ${debug};\n`);
        await execute('glib-compile-schemas', ['--strict', join(staging, 'schemas')]);
        await mkdir(dirname(archive), { recursive: true });
        const stagedArchive = join(staging, 'extension.zip');
        await execute('zip', ['-q', '-r', stagedArchive, '.'], { cwd: staging });
        await cp(stagedArchive, archive);
        return archive;
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--debug'))
        throw new Error('Usage: node scripts/package.mjs [--debug]');
    console.log(await packageExtension({ debug: args.includes('--debug') }));
}
