import assert from 'node:assert/strict';
import { createModuleLoader } from './modules.js';
import { dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

export const createRendererFixture = async t => {
    const state = { animationsEnabled: false, nativeAlpha: 153, strength: 0, css: '', writes: 0, loads: 0 };
    const handlers = new Map();
    let nextId = 0;
    const overview = {
        visibleTarget: false,
        connect(signal, callback) { handlers.set(++nextId, { signal, callback }); return nextId; },
        disconnect(id) { handlers.delete(id); }
    };
    const showOverview = visible => {
        overview.visible = visible;
        overview.visibleTarget = visible;
        for (const event of visible ? ['showing', 'shown'] : ['hiding', 'hidden']) {
            for (const { signal, callback } of handlers.values()) {
                if (signal === event)
                    callback();
            }
        }
    };
    const timelines = new Set();
    class Timeline {
        constructor() { this.handlers = new Map(); }
        set_progress_mode() {}
        connect(signal, callback) { this.handlers.set(signal, callback); }
        start() { timelines.add(this); }
        stop() { timelines.delete(this); }
        get_progress() { return this.progress; }
        advance(progress) {
            assert(timelines.has(this), 'Only live animations can advance');
            this.progress = progress;
            this.handlers.get('new-frame')();
            if (progress === 1) {
                timelines.delete(this);
                this.handlers.get('completed')();
            }
        }
    }
    const classes = new Set();
    const children = new Set();
    const allocations = new Map();
    const styleHandlers = new Map();
    const panel = {
        width: 1920, height: 32,
        add_style_class_name: name => classes.add(name),
        remove_style_class_name: name => classes.delete(name),
        insert_child_at_index: (actor, index) => {
            const ordered = [...children];
            ordered.splice(index, 0, actor);
            children.clear();
            ordered.forEach(child => children.add(child));
        },
        get_style_class_name: () => [...classes].join(' '),
        get_style_pseudo_class: () => '',
        get_style: () => '',
        ensure_style() {},
        connectObject(signal, callback, owner) { allocations.set(owner, { signal, callback }); },
        disconnectObject(owner) { allocations.delete(owner); }
    };
    class Widget {
        constructor(properties) { Object.assign(this, properties); }
        connectObject(signal, callback, owner) {
            assert.equal(signal, 'style-changed');
            styleHandlers.set(this, { callback, owner });
        }
        add_child(actor) { (this.children ??= []).push(actor); }
        get_style_class_name() { return this.style_class; }
        get_children() { return this.children ?? []; }
        allocate(box) { this.box = { ...box }; }
        get_theme_node() {
            this.themeReads = (this.themeReads ?? 0) + 1;
            // Model only background alpha; actual CSS parsing/rendering belongs to Shell.
            const gradientClass = this.style_class?.match(/panel-(?:maximized-|overview-)?gradient/)?.[0];
            const rule = gradientClass && state.css.match(new RegExp(`\\.${gradientClass}\\s*\\{([^}]+)\\}`))?.[1];
            const alpha = property => {
                const color = rule.match(new RegExp(`${property}: (rgba\\([^)]+\\))`))?.[1];
                assert(color, `Missing normalized ${property} in fixture`);
                return { alpha: Number(color.slice(color.lastIndexOf(',') + 1, -1)) * 255 };
            };
            return {
                get_background_image: () => null,
                get_border_image: () => null,
                get_background_gradient: () => rule
                    ? [1, alpha('background-gradient-start'), alpha('background-gradient-end')]
                    : [0, null, null],
                get_background_color: () => ({ alpha: state.nativeAlpha })
            };
        }
        destroy() {
            for (const [actor, handler] of styleHandlers) {
                if (actor === this || handler.owner === this)
                    styleHandlers.delete(actor);
            }
            this.children?.forEach(child => child.destroy());
            children.delete(this);
            allocations.delete(this);
        }
    }
    let windowEvents;
    class WindowEvents {
        constructor() { windowEvents = this; }
        setStateChangeCallback(callback) { this.callback = callback; }
        configureDetector() {}
        enable() { this.enabled = true; }
        disable() { this.enabled = false; }
        updateState() { this.callback({ effectStrength: state.strength }); }
        getEffectStrength() { return state.strength; }
        getCurrentState() { return { effectStrength: state.strength }; }
    }
    class WorkspaceEvents {
        enable() {}
        disable() {}
        detachTransition() {}
    }
    const stylesheetPath = fileURLToPath(new URL('../../src/user-stylesheet.css', import.meta.url));
    const mockFile = path => ({
        path,
        get_parent: () => mockFile(dirname(path)),
        get_child: name => mockFile(join(path, name)),
        replace() { assert.equal(path, stylesheetPath, 'Generated CSS belongs in the extension root'); }
    });
    const theme = {
        load_stylesheet(file) { assert.equal(file.path, stylesheetPath); state.loads++; },
        unload_stylesheet(file) { assert.equal(file.path, stylesheetPath); }
    };
    const stubs = {
        'resource:///org/gnome/shell/ui/main.js': { overview, panel },
        'resource:///org/gnome/shell/extensions/extension.js': { Extension: class {} },
        'gi://GLib': { default: { Source: { remove() {} } } },
        'gi://St': {
            default: {
                Widget, GradientType: { NONE: 0 },
                Settings: { get: () => ({ enable_animations: state.animationsEnabled }) },
                ThemeContext: { get_for_stage: () => ({ get_theme: () => theme }) }
            }
        },
        'gi://Clutter': { default: { ActorBox: class {}, Timeline, AnimationMode: { EASE_OUT_QUAD: 1 } } },
        'gi://Gio': {
            default: {
                File: { new_for_uri: uri => mockFile(fileURLToPath(uri)) },
                FileCreateFlags: { NONE: 0 },
                DataOutputStream: class {
                    static new() { return new this(); }
                    put_string(value) { state.css = value; state.writes++; }
                    close() {}
                }
            }
        },
        'config.js': {
            TOP_BAR_STYLE_SETTINGS: 'top-bar-style-settings',
            getTopBarStyleSettings: settings => settings.get_boolean('top-bar-style-settings'),
            attachSettingListener: (settings, key, callback) => settings.connect(`changed::${key}`, callback),
            getConfig: settings => ({ ...settings }),
            attachSettingsListeners: () => [], detachSettingsListeners() {}
        },
        'topBarMenu.js': { default: class {} },
        'events/observers/windowsEvents/windowEvents.js': { default: WindowEvents },
        'events/observers/workspaceEvents.js': { default: WorkspaceEvents }
    };
    const load = createModuleLoader(stubs, { get_workspace_manager: () => ({}) });
    const settings = {
        get_boolean: () => false,
        connect: () => 1,
        disconnect() {},
        windowBehavior: 'keep-gradient', styleTrigger: 'maximized', proximityTransition: false,
        overviewBehavior: 'apply-style',
        // Rendering receives normalized config; overviewSettings.js exercises real settings normalization.
        gradients: {
            main: { colors: { start: 'rgba(0,0,0,1)', end: 'rgba(0,0,0,0)' }, direction: 'vertical' },
            alternate: { colors: { start: 'rgba(255,0,0,1)', end: 'rgba(0,0,255,1)' }, direction: 'horizontal' },
            overview: { colors: { start: 'rgba(0,255,0,0.4)', end: 'rgba(255,255,255,1)' }, direction: 'horizontal' }
        },
        contentShadows: true, shadowColor: 'black', shadowBlur: 3, shadowOffsetX: 0, shadowOffsetY: 0
    };

    const resources = [];
    let onProgress = null;
    const adjustment = {
        value: 0,
        connect(_signal, callback) { onProgress = callback; return 1; },
        disconnect() { onProgress = null; }
    };
    const setOverviewProgress = progress => {
        adjustment.value = progress;
        overview._overview = { controls: { _stateAdjustment: adjustment } };
        onProgress?.();
    };
    t.after(() => {
        const errors = [];
        for (const dispose of resources.reverse()) {
            try {
                dispose();
            } catch (error) {
                errors.push(error);
            }
        }
        try {
            // Check production teardown; clearing these collections would hide leaks.
            for (const [name, collection] of Object.entries({ children, allocations, styleHandlers, handlers, timelines, classes }))
                assert.equal(collection.size, 0, `Fixture leaked ${name}`);
            assert.equal(onProgress, null, 'Fixture leaked overview adjustment handler');
        } catch (error) {
            errors.push(error);
        }
        if (errors.length)
            throw new AggregateError(errors, 'Renderer fixture teardown failed');
    });
    const module = await load('extension.js');
    const { default: Gradient } = (await load('gradient/gradient.js')).namespace;
    const { createPanelBackground } = (await load('gradient/panelBackground.js')).namespace;
    const { default: BackgroundBlend, calculateBackgroundBlend } = (await load('gradient/backgroundBlend.js')).namespace;
    const track = resource => {
        resources.push(() => resource.destroy());
        return resource;
    };
    return {
        state, settings, panel, theme, children, classes, timelines, allocations, styleHandlers, handlers,
        get windowEvents() { return windowEvents; },
        showOverview,
        setOverviewProgress,
        expectStyle: expected => assert.deepEqual([...classes], expected ? [expected] : []),
        calculateBackgroundBlend,
        createRenderer: () => track(new Gradient()),
        createBlend: (source, target) => track(new BackgroundBlend(source, target)),
        createPanelBackground: style => track(createPanelBackground(style)),
        createExtension: () => {
            const extension = new module.namespace.default();
            extension.getSettings = () => settings;
            resources.push(() => {
                if (extension.events)
                    extension.disable();
            });
            return extension;
        }
    };
};
