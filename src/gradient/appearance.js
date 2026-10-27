/** @typedef {'main'|'alternate'|'overview'} AppearanceName */
/** @typedef {Readonly<{colors: Readonly<{start: string, end: string}>, direction: string}>} GradientDefinition */

export const GRADIENT_DIRECTION = {
    VERTICAL: 'vertical',
    HORIZONTAL: 'horizontal'
};

export const STYLE_TRIGGER = {
    MAXIMIZED: 'maximized',
    PROXIMITY: 'proximity'
};

export const APPEARANCE_BEHAVIOR = {
    KEEP_GRADIENT: 'keep-gradient',
    KEEP_THEME: 'keep-theme',
    APPLY_STYLE: 'apply-style'
};

export const APPEARANCE_STATE = {
    NORMAL: 'normal',
    TRIGGERED: 'triggered',
    OVERVIEW: 'overview'
};

/**
 * @param {ReturnType<import('../config.js').getConfig>} config
 * @param {string} state
 * @returns {AppearanceName|null}
 */
export const getAppearanceName = (config, state) => {
    const overview = state === APPEARANCE_STATE.OVERVIEW;
    if (!overview && state !== APPEARANCE_STATE.TRIGGERED)
        return 'main';

    const behavior = overview ? config.overviewBehavior : config.windowBehavior;
    if (behavior === APPEARANCE_BEHAVIOR.KEEP_THEME)
        return null;

    if (behavior === APPEARANCE_BEHAVIOR.APPLY_STYLE)
        return overview ? 'overview' : 'alternate';

    return 'main';
};

/**
 * @param {ReturnType<import('../config.js').getConfig>} config
 * @param {string} state
 * @returns {GradientDefinition|null}
 */
export const getAppearance = (config, state) => {
    const name = getAppearanceName(config, state);
    return name === null ? null : config.gradients[name];
};
