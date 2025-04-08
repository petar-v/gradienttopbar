import { screenShield } from 'resource:///org/gnome/shell/ui/main.js';

class EventManager {
    constructor() {
        this.evenIds = {}; // event name -> {target, eventID}
        this.monitoredWindows = {}; // windowID -> {eventName -> eventID}
        this.unlockHandlerId = null;
        this.positionCallbacks = new Set(); // Set of callbacks for position changes
    }

    attachGlobalEventOnce(eventName, target, callback) {
        if (this.evenIds[eventName] === undefined) {
            const id = target.connect(eventName, callback);
            this.evenIds[eventName] = {
                target,
                id
            };
        }
    }

    disconnectAllEvents() {
        Object.keys(this.evenIds).forEach(eventName => {
            const event = this.evenIds[eventName];
            event.target.disconnect(event.id);
        });
        this.detachUnlockScreenEvent();
        this.positionCallbacks.clear();
        this.evenIds = {};
    }

    attachWindowEventOnce(eventName, window, callback) {
        const windowId = window.get_id();
        if (this.monitoredWindows[windowId] === undefined)
            this.monitoredWindows[windowId] = {};

        if (this.monitoredWindows[windowId][eventName] === undefined) {
            this.monitoredWindows[windowId][eventName] = window.connect(
                eventName,
                callback
            );
        }
    }

    disconnectWindowEvents(window) {
        const windowId = window.get_id();
        if (this.monitoredWindows[windowId] === undefined)
            return;

        Object.keys(this.monitoredWindows[windowId]).forEach(eventName =>
            window.disconnect(this.monitoredWindows[windowId][eventName])
        );
        delete this.monitoredWindows[windowId];
    }

    attachUnlockScreenEvent(callback) {
        if (this.unlockHandlerId === null)
            this.unlockHandlerId = screenShield.connect('unlock-screen', callback);
    }

    detachUnlockScreenEvent() {
        if (this.unlockHandlerId !== null) {
            screenShield.disconnect(this.unlockHandlerId);
            this.unlockHandlerId = null;
        }
    }

    attachWindowPositionCallback(window, callback) {
        const eventName = 'position-changed';
        this.attachWindowEventOnce(eventName, window, callback);
        this.positionCallbacks.add(callback);
        return callback;
    }

    isPositionCallbackAttached(callback) {
        return this.positionCallbacks.has(callback);
    }

    attachGlobalPositionCallback(target, callback) {
        const eventName = 'position-changed';
        this.attachGlobalEventOnce(eventName, target, callback);
        this.positionCallbacks.add(callback);
        return callback;
    }

    detachGlobalPositionCallback(callback) {
        if (this.evenIds['position-changed'] && this.positionCallbacks.has(callback)) {
            const event = this.evenIds['position-changed'];
            event.target.disconnect(event.id);
            delete this.evenIds['position-changed'];
            this.positionCallbacks.delete(callback);
        }
    }

    detachWindowPositionCallback(window, callback) {
        const windowId = window.get_id();
        const eventName = 'position-changed';

        if (this.monitoredWindows[windowId] &&
            this.monitoredWindows[windowId][eventName] !== undefined) {
            window.disconnect(this.monitoredWindows[windowId][eventName]);
            delete this.monitoredWindows[windowId][eventName];

            // If no more events for this window, clean up the entry
            if (Object.keys(this.monitoredWindows[windowId]).length === 0)
                delete this.monitoredWindows[windowId];
        }

        this.positionCallbacks.delete(callback);
    }
}

export default EventManager;
