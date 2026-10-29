// Include never-attached signals so settings-dependent listeners are visible as Off.
export const listenerSignals = {
    Windows: [
        'window-created', 'destroy', 'minimize', 'unminimize', 'window-left-monitor',
        'monitors-changed', 'unlock-screen', 'size-changed', 'position-changed', 'workspace-changed'
    ],
    Overview: ['showing', 'hiding', 'hidden', 'notify::value'],
    Workspace: ['workspace-switched', 'begin', 'notify::progress', 'destroy'],
    Rendering: ['notify::allocation', 'style-changed', 'new-frame', 'completed'],
    'Panel menu': ['may-recognize', 'recognize'],
    Settings: [
        'changed::gradient-direction', 'changed::maximized-behavior', 'changed::style-trigger',
        'changed::proximity-distance', 'changed::proximity-transition', 'changed::workspace-gesture-blending',
        'changed::content-shadows', 'changed::shadow-color', 'changed::shadow-blur',
        'changed::shadow-offset-x', 'changed::shadow-offset-y', 'changed::colors',
        'changed::maximized-colors', 'changed::maximized-gradient-direction',
        'changed::overview-behavior', 'changed::overview-transition', 'changed::overview-colors',
        'changed::overview-gradient-direction', 'changed::top-bar-style-settings'
    ]
};
