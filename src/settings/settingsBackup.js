import Gio from 'gi://Gio';

import { SETTINGS_GSCHEMA } from '../config.js';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');

const SETTINGS_GSCHEMA_PATH = `/${SETTINGS_GSCHEMA.replaceAll('.', '/')}/`;

/**
 * Exports all settings to a file
 *
 * @param {Gio.File} file - The file to export settings to
 */
export const exportSettingsToFile = async file => {
    const process = Gio.Subprocess.new(
        ['dconf', 'dump', SETTINGS_GSCHEMA_PATH],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    );
    const [stdout, stderr] = await process.communicate_utf8_async(null, null);

    if (!process.get_successful())
        throw new Error(stderr.trim() || 'Failed to export settings');

    const raw = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
    const out = Gio.BufferedOutputStream.new_sized(raw, 4096);
    out.write_all(new TextEncoder().encode(stdout), null);
    out.close(null);
};

/**
 * Imports settings from a file
 *
 * @param {Gio.File} settingsFile - The file to load settings from
 */
export const importSettingsFromFile = async settingsFile => {
    const [contents] = await settingsFile.load_contents_async(null);
    const input = new TextDecoder('utf-8', { fatal: true }).decode(contents);
    const process = Gio.Subprocess.new(
        ['dconf', 'load', SETTINGS_GSCHEMA_PATH],
        Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    );
    const [, stderr] = await process.communicate_utf8_async(input, null);

    if (!process.get_successful())
        throw new Error(stderr.trim() || 'Failed to import settings');
};
