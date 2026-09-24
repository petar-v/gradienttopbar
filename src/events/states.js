const eqSet = (as, bs) => {
    if (as.size !== bs.size)
        return false;

    for (const a of as)
    { if (!bs.has(a))
        return false; }


    return true;
};

export const areSameState = (state1, state2) => {
    if ([state1, state2].includes(null))
        return false;
    if (state1.inOverview !== state2.inOverview)
        return false;
    if ([state1.currentWorkspace, state2.currentWorkspace].includes(undefined))
        return false;
    if (state1.currentWorkspace.index() !== state2.currentWorkspace.index())
        return false;

    return eqSet(state1.triggerWindows, state2.triggerWindows);
};
