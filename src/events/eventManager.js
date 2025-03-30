class EventManager {
    constructor() {
        this.evenIds = {}; // event name -> {target, eventID}
        this.monitoredWindows = {}; // windowID -> {eventName -> eventID}
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
}

export default EventManager;
