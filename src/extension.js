import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { applyGradientStyle, toggleGradient } from './gradient.js';
import {
    getConfig,
    attachSettingsListeners,
    detachSettingsListeners
} from './config.js';
import Gio from 'gi://Gio';

import WindowEvents from './events/windowEvents.js';

export default class GradientTopBar extends Extension {
    constructor(metadata) {
        super(metadata);

        // gradient state
        this.isEffectApplied = false;
        this.windowEvents = null;
        this._screenShieldSettings = null;
        this._screenLockHandler = null;
        this._sessionManager = null;
        this._unlockScreenHandler = null;

        this.onSettingsChanged = settings => {
            const config = getConfig(settings);
            applyGradientStyle(config, this.path);

            const { isOpaqueOnMaximized } = config;

            if (isOpaqueOnMaximized) {
                this.windowEvents.enable();
            } else {
                this.windowEvents.disable();
                this.toggleGradient(true);
            }
        };
    }

    toggleGradient(enabled) {
    // this checks if the gradient is currently applied
    // or not so we don't add classes multiple times.
    // The effect is applied if there is no maximized window
    // if the respective setting is applied.
        if (this.isEffectApplied === enabled)
            return;

        toggleGradient(enabled);
        this.isEffectApplied = enabled;
    }

    enable() {
        this._settings = this.getSettings();
        this.windowEvents = new WindowEvents(
            global.display,
            global.window_manager,
            global.get_workspace_manager()
        );
        this.windowEvents.setStateChangeCallback(
            ({ maximizedWindows, currentWorkspace, inOverview }) => {
                if (inOverview) {
                    this.toggleGradient(true);
                    return;
                }

                const workspaceDisplayMaximizedWindows = currentWorkspace
          .list_windows()
          // filter windows only on the primary monitor
          .filter(
              window =>
                  window.get_monitor() === global.display.get_primary_monitor()
          ) // TODO: or is_on_primary_monitor()
          // filter maximized windows on the primary monitor
          .filter(window => maximizedWindows.has(window.get_id()));
                this.toggleGradient(workspaceDisplayMaximizedWindows.length === 0);
            }
        );

        // Add screen lock/unlock event handling
        this._screenShieldSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.screensaver' });
        this._screenLockHandler = this._screenShieldSettings.connect('changed::lock-enabled', () => {
            // Force state re-evaluation after screen unlock
            if (this.windowEvents)
                this.windowEvents.forceStateUpdate();
        });

        // Alternative approach using session manager signals
        this._sessionManager = Gio.DBus.session.lookup_proxy_sync(
            'org.gnome.SessionManager',
            '/org/gnome/SessionManager',
            Gio.DBusProxyFlags.NONE,
            null
        );
        this._unlockScreenHandler = this._sessionManager.connect('signal::SessionRunning', () => {
            // Force state re-evaluation after screen unlock
            if (this.windowEvents)
                this.windowEvents.forceStateUpdate();
        });

        attachSettingsListeners(this._settings, this.onSettingsChanged);

        const config = getConfig(this._settings);
        const { isOpaqueOnMaximized } = config;
        if (isOpaqueOnMaximized)
            this.windowEvents.enable();

        // initially set up the gradient
        applyGradientStyle(config, this.path);
        this.toggleGradient(true);
    }

    disable() {
        this.windowEvents.disable();
        this.toggleGradient(false);
        detachSettingsListeners(this._settings, this.onSettingsChanged);

        // Disconnect screen lock/unlock handlers
        if (this._screenShieldSettings && this._screenLockHandler) {
            this._screenShieldSettings.disconnect(this._screenLockHandler);
            this._screenShieldSettings = null;
            this._screenLockHandler = null;
        }

        if (this._sessionManager && this._unlockScreenHandler) {
            this._sessionManager.disconnect(this._unlockScreenHandler);
            this._sessionManager = null;
            this._unlockScreenHandler = null;
        }

        this.windowEvents = null;
        this.isEffectApplied = false;
        this._settings = null;
    }
}
