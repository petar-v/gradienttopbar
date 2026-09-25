export const areSameState = (state1, state2) => {
    if ([state1, state2].includes(null))
        return false;
    if (state1.inOverview !== state2.inOverview)
        return false;
    if (state1.effectStrength !== state2.effectStrength)
        return false;
    if ([state1.currentWorkspace, state2.currentWorkspace].includes(undefined))
        return false;
    if (state1.currentWorkspace.index() !== state2.currentWorkspace.index())
        return false;

    return true;
};
