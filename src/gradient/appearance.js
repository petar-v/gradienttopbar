import { MAXIMIZED_BEHAVIOR, OVERVIEW_BEHAVIOR } from '../constants.js';

export const APPEARANCE_STATE = {
    NORMAL: 'normal',
    TRIGGERED: 'triggered',
    OVERVIEW: 'overview'
};

export const getAppearance = (config, state) => {
    let behavior = null;
    if (state === APPEARANCE_STATE.OVERVIEW)
        behavior = config.overviewBehavior;

    else if (state === APPEARANCE_STATE.TRIGGERED)
        behavior = config.maximizedBehavior;

    if (behavior === MAXIMIZED_BEHAVIOR.KEEP_THEME)
        return null;

    if (state === APPEARANCE_STATE.OVERVIEW && behavior === OVERVIEW_BEHAVIOR.APPLY_STYLE)
        return { name: 'overview', colors: config.overviewColors, direction: config.overviewGradientDirection };

    if (state === APPEARANCE_STATE.TRIGGERED && behavior === MAXIMIZED_BEHAVIOR.APPLY_STYLE)
        return { name: 'alternate', colors: config.maximizedColors, direction: config.maximizedGradientDirection };

    return { name: 'main', colors: config.colors, direction: config.gradientDirection };
};
