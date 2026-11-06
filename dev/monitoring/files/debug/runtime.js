import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import ListenerMonitor from './listenerMonitor.js';
import { listenerSignals } from './listenerCatalog.js';
import { BUS_NAME, OBJECT_PATH, INTERFACE_XML } from './protocol.js';

export const monitor = new ListenerMonitor(() => GLib.get_monotonic_time(), listenerSignals);
let exportedObject;
let ownerId;

export const start = () => {
    monitor.reset();
    monitor.setOptions(true, false);
    exportedObject = Gio.DBusExportedObject.wrapJSObject(INTERFACE_XML, {
        GetSnapshot: () => JSON.stringify(monitor.snapshot()),
        SetOptions: (collecting, timing) => monitor.setOptions(collecting, timing),
        Reset: () => monitor.reset()
    });
    exportedObject.export(Gio.DBus.session, OBJECT_PATH);
    ownerId = Gio.bus_own_name_on_connection(Gio.DBus.session, BUS_NAME, Gio.BusNameOwnerFlags.NONE, null, null);
};

export const stop = () => {
    exportedObject?.unexport();
    exportedObject = null;
    if (ownerId)
        Gio.bus_unown_name(ownerId);
    ownerId = null;
};
