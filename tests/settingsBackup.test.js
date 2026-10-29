import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModuleLoader } from './fixtures/modules.js';

const createBackupFixture = async () => {
    const state = { commands: [], text: '[general]\nvalue=1\n', stderr: '', isSuccessful: true, isClosed: false, replacements: 0 };
    const process = {
        communicate_utf8_async(input) { state.input = input; return Promise.resolve([state.text, state.stderr]); },
        get_successful: () => state.isSuccessful
    };
    const file = {
        load_contents_async() { return Promise.resolve([new TextEncoder().encode(state.text)]); },
        replace() { state.replacements++; return {}; }
    };
    const load = createModuleLoader({
        'gi://Gio': {
            default: {
                _promisify() {},
                File: class {},
                Subprocess: class {
                    static new(command) { state.commands.push([...command]); return process; }
                },
                SubprocessFlags: { STDIN_PIPE: 1, STDOUT_PIPE: 2, STDERR_PIPE: 4 },
                FileCreateFlags: { NONE: 0 },
                BufferedOutputStream: {
                    new_sized: () => ({
                        write_all(bytes) { state.output = new TextDecoder().decode(bytes); },
                        close() { state.isClosed = true; }
                    })
                }
            }
        },
        'config.js': { SETTINGS_GSCHEMA: 'org.gnome.shell.extensions.org.pshow.gradienttopbar' }
    }, { TextEncoder, TextDecoder });
    const { namespace: backup } = await load('settings/settingsBackup.js');
    return { backup, state, file };
};

test('settings import passes decoded file contents to the extension dconf path', async () => {
    const { backup, state, file } = await createBackupFixture();
    await backup.importSettingsFromFile(file);
    assert.deepEqual(state.commands, [['dconf', 'load', '/org/gnome/shell/extensions/org/pshow/gradienttopbar/']]);
    assert.equal(state.input, state.text);
});

test('settings import rejects invalid UTF-8 before starting dconf', async () => {
    const { backup, state, file } = await createBackupFixture();
    file.load_contents_async = () => Promise.resolve([new Uint8Array([0xff])]);
    await assert.rejects(backup.importSettingsFromFile(file), { name: 'TypeError' });
    assert.equal(state.commands.length, 0);
});

test('settings export writes and closes the dump output', async () => {
    const { backup, state, file } = await createBackupFixture();
    await backup.exportSettingsToFile(file);
    assert.deepEqual(state.commands, [['dconf', 'dump', '/org/gnome/shell/extensions/org/pshow/gradienttopbar/']]);
    assert.equal(state.output, state.text);
    assert.equal(state.isClosed, true);
});

test('settings backup reports dconf failures and never replaces a file after a failed dump', async () => {
    const { backup, state, file } = await createBackupFixture();
    state.isSuccessful = false;
    state.stderr = '  dconf failed  ';
    await assert.rejects(backup.importSettingsFromFile(file), /dconf failed/);
    await assert.rejects(backup.exportSettingsToFile(file), /dconf failed/);
    assert.equal(state.replacements, 0);
});
