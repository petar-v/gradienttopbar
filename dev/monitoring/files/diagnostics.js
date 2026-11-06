import * as diagnostics from './debug/runtime.js';

export { diagnostics };
export const connectSignal = diagnostics.monitor.connect.bind(diagnostics.monitor);
export const disconnectSignal = diagnostics.monitor.disconnect.bind(diagnostics.monitor);
export const connectObject = diagnostics.monitor.connectObject.bind(diagnostics.monitor);
export const disconnectObject = diagnostics.monitor.disconnectObject.bind(diagnostics.monitor);
export const measureWork = diagnostics.monitor.work.bind(diagnostics.monitor);
