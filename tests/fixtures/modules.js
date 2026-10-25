import { readFile } from 'node:fs/promises';
import { createContext, runInContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { URL } from 'node:url';

const src = new URL('../../src/', import.meta.url);

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
                const values = stubs[url] ?? stubs[url.replace(src.href, '')];
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
