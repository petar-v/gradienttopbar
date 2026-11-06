import { extensionManager } from 'resource:///org/gnome/shell/ui/main.js';
import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import SignalConnections from '../../signalConnections.js';

const companionUuid = 'overview-seamless-zoom@jguece';

export default class WallpaperZoomAvailability {
    #signals = new SignalConnections();
    #requested = false;
    #lastEnabled = false;
    #hasError = false;
    #isPending = false;
    #callback;
    #getIsClosed;

    constructor(callback, getIsClosed) {
        this.#callback = callback;
        this.#getIsClosed = getIsClosed;
    }

    configure(isEnabled) {
        this.#requested = isEnabled;
        this.#update();
    }

    updateState() {
        this.#update();
    }

    #update(eventState) {
        const extension = extensionManager.lookup(companionUuid);
        // UNINSTALLED is emitted before Shell removes the old lookup entry.
        const state = eventState ?? extension?.state;
        this.#hasError ||= state === ExtensionState.ERROR;
        const isAbsent = !extension && eventState === undefined;
        const isBlocked = this.#hasError || (!isAbsent && ![
            ExtensionState.INITIALIZED, ExtensionState.INACTIVE,
            ExtensionState.OUT_OF_DATE, ExtensionState.UNINSTALLED
        ].includes(state));
        const isEnabled = this.#requested && !isBlocked;
        const isChanged = isEnabled !== this.#lastEnabled && (isBlocked || this.#getIsClosed());
        if (isChanged)
            this.#lastEnabled = isEnabled;
        const isPending = isEnabled !== this.#lastEnabled;
        const isPendingChanged = isPending !== this.#isPending;
        this.#isPending = isPending;

        if (!this.#hasError && (this.#requested || this.#lastEnabled)) {
            this.#signals.connect(extensionManager, 'extension-state-changed', (_manager, changed) => {
                if (changed.uuid === companionUuid)
                    this.#update(changed.state);
            });
        } else {
            this.#signals.disconnect(extensionManager);
        }
        if (isChanged || isPendingChanged)
            this.#callback({ isEnabled: this.#lastEnabled, isPending });
    }

    destroy() {
        this.#signals.disconnectAll();
    }
}
