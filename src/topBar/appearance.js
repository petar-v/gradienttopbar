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

export const isProgressiveProximity = config =>
    config.styleTrigger === STYLE_TRIGGER.PROXIMITY && config.proximityTransition && config.proximityDistance > 0;

export const APPEARANCE_BEHAVIOR = {
    DO_NOTHING: 'do-nothing',
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
    const isOverview = state === APPEARANCE_STATE.OVERVIEW;
    if (!isOverview && state !== APPEARANCE_STATE.TRIGGERED)
        return 'main';

    const behavior = isOverview ? config.overviewBehavior : config.windowBehavior;
    if (behavior === APPEARANCE_BEHAVIOR.KEEP_THEME)
        return null;

    if (behavior === APPEARANCE_BEHAVIOR.APPLY_STYLE)
        return isOverview ? 'overview' : 'alternate';

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

const isAppearanceEqual = (first, second) => first === second || (
    first !== null && second !== null &&
    first.direction === second.direction &&
    first.colors.start === second.colors.start && first.colors.end === second.colors.end
);

// Do nothing leaves desktop behavior independent of overview visibility.
export const getObservationNeeds = config => {
    const main = getAppearance(config, APPEARANCE_STATE.NORMAL);
    const triggered = getAppearance(config, APPEARANCE_STATE.TRIGGERED);
    const overview = getAppearance(config, APPEARANCE_STATE.OVERVIEW);
    const isWindowObservationNeeded = !isAppearanceEqual(main, triggered);
    const isOverviewOverrideNeeded = config.overviewBehavior !== APPEARANCE_BEHAVIOR.DO_NOTHING && (
        !isAppearanceEqual(main, overview) || !isAppearanceEqual(triggered, overview)
    );
    return {
        isWindowObservationNeeded,
        isWorkspaceProgressNeeded: isWindowObservationNeeded && config.workspaceGestureBlending,
        isOverviewObservationNeeded: isOverviewOverrideNeeded,
        isOverviewProgressNeeded: isOverviewOverrideNeeded && config.overviewTransition
    };
};

// Capabilities describe effective inputs, never the renderer for an unrelated transition.
export const isDesktopCompositionPossible = config => {
    const needs = getObservationNeeds(config);
    return needs.isWorkspaceProgressNeeded || (needs.isWindowObservationNeeded && isProgressiveProximity(config));
};

export const isShellOverviewStyleSupported = config =>
    config.overviewBehavior !== APPEARANCE_BEHAVIOR.DO_NOTHING &&
    config.overviewBehavior !== APPEARANCE_BEHAVIOR.KEEP_THEME;

export const isShellOverviewPassive = config => {
    const needs = getObservationNeeds(config);
    return needs.isOverviewObservationNeeded && !needs.isOverviewProgressNeeded &&
        !isDesktopCompositionPossible(config) && isShellOverviewStyleSupported(config);
};
