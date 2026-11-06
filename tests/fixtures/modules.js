import { readFile } from 'node:fs/promises';
import { createContext, runInContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { URL } from 'node:url';

const src = new URL('../../src/', import.meta.url);

// Component tests replace the native D-Bus boundary; monitor tests inject real counters.
const nativeDiagnostics = {
    diagnostics: null,
    connectSignal: (target, signal, callback) => target.connect(signal, callback),
    disconnectSignal: (target, id) => target.disconnect(id),
    connectObject: (target, signal, callback, owner) => target.connectObject(signal, callback, owner),
    disconnectObject: (target, owner) => target.disconnectObject(owner),
    measureWork: (_group, _name, callback) => callback
};

export const createModuleLoader = (stubs = {}, globals = {}) => {
    const context = createContext(globals);
    runInContext(`
        globalThis.global = globalThis;
        Math.clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    `, context);
    const modules = new Map();
    const get = url => {
        if (!modules.has(url)) {
            modules.set(url, (async () => {
                const relative = url.replace(src.href, '');
                const values = stubs[url] ?? stubs[relative] ?? (relative === 'diagnostics.js' ? nativeDiagnostics : null);
                if (values) {
                    return new SyntheticModule(Object.keys(values), function () {
                        for (const [key, value] of Object.entries(values))
                            this.setExport(key, value);
                    }, { context, identifier: url });
                }
                if (!url.startsWith(src.href))
                    throw new Error(`Missing test stub: ${url}`);
                return new SourceTextModule(await readFile(new URL(url), 'utf8'), {
                    context,
                    identifier: url,
                    initializeImportMeta(meta) { meta.url = url; }
                });
            })());
        }
        return modules.get(url);
    };
    return async entry => {
        const module = await get(new URL(entry, src).href);
        if (module.status === 'unlinked') {
            await module.link((specifier, parent) => get(specifier.startsWith('.')
                ? new URL(specifier, parent.identifier).href : specifier));
        }
        if (module.status === 'linked')
            await module.evaluate();
        return module;
    };
};
