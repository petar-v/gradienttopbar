import { cp, readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { spawn } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { prepareExtension } from './package.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const gtk = process.argv.slice(2).includes('--gtk');
if (process.argv.slice(2).some(arg => arg !== '--gtk'))
    throw new Error('Usage: node scripts/test.mjs [--gtk]');

const run = (command, args, cwd) => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
        cwd, stdio: 'inherit',
        env: {
            ...process.env,
            GSETTINGS_BACKEND: 'memory',
            GTK_IM_MODULE: process.env.GTK_IM_MODULE ?? 'gtk-im-context-simple'
        }
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
        if (code === 0)
            resolve();
        else
            reject(new Error(`${command} exited with ${signal ?? code}`));
    });
});

const check = async debug => {
    const prepared = await prepareExtension({ debug });
    try {
        await Promise.all([
            cp(join(root, 'tests'), join(prepared.directory, 'tests'), { recursive: true }),
            cp(join(root, 'package.json'), join(prepared.directory, 'package.json')),
            cp(join(root, 'eslint.config.js'), join(prepared.directory, 'eslint.config.js')),
            symlink(join(root, 'node_modules'), join(prepared.directory, 'node_modules'), 'dir')
        ]);
        if (debug)
            await cp(join(root, 'dev/monitoring/tests'), join(prepared.directory, 'tests'), { recursive: true });
        console.log(`Testing ${debug ? 'debug overlay' : 'production source'} (${gtk ? 'GTK' : 'Node'})`);
        if (gtk) {
            const files = ['gradientEditor.js', 'overviewSettings.js', 'shadowSettings.js'];
            if (debug)
                files.push('listenersPage.js');
            for (const file of files)
                await run('gjs', ['-m', `tests/${file}`], prepared.directory); // eslint-disable-line no-await-in-loop
        } else {
            const names = await readdir(join(prepared.directory, 'tests'));
            const files = names.filter(name => name.endsWith('.test.js') && name !== 'debugPackaging.test.js');
            await run(process.execPath, ['--experimental-vm-modules', '--test', ...files.map(name => `tests/${name}`)], prepared.directory);
        }
    } finally {
        await prepared.cleanup();
    }
};

await check(false);
await check(true);
