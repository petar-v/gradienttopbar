import { DEBUG } from './buildConfig.js';

export const diagnostics = DEBUG ? await import('./debug/runtime.js') : null;

// Release callbacks are passed through unchanged, with no per-event instrumentation.
export const connectSignal = diagnostics
    ? diagnostics.monitor.connect.bind(diagnostics.monitor)
    : (target, signal, callback) => target.connect(signal, callback);
export const disconnectSignal = diagnostics
    ? diagnostics.monitor.disconnect.bind(diagnostics.monitor)
    : (target, id) => target.disconnect(id);
export const connectObject = diagnostics
    ? diagnostics.monitor.connectObject.bind(diagnostics.monitor)
    : (target, signal, callback, owner) => target.connectObject(signal, callback, owner);
export const disconnectObject = diagnostics
    ? diagnostics.monitor.disconnectObject.bind(diagnostics.monitor)
    : (target, owner) => target.disconnectObject(owner);
export const measureWork = diagnostics
    ? diagnostics.monitor.work.bind(diagnostics.monitor)
    : (_group, _name, callback) => callback;
