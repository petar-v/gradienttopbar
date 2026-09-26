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

export const getWorkspaceTransition = (workspaces, snapPoints, progress) => {
    if (workspaces.length === 0 || workspaces.length !== snapPoints.length)
        return null;

    const lastIndex = snapPoints.length - 1;
    const endIndex = snapPoints.findIndex(point => point >= progress);

    if (endIndex <= 0) {
        const index = endIndex === 0 ? 0 : lastIndex;
        return {
            startWorkspace: workspaces[index],
            endWorkspace: workspaces[index],
            progress: 0
        };
    }

    const startIndex = endIndex - 1;
    const distance = snapPoints[endIndex] - snapPoints[startIndex];
    return {
        startWorkspace: workspaces[startIndex],
        endWorkspace: workspaces[endIndex],
        progress: distance === 0
            ? 0
            : (progress - snapPoints[startIndex]) / distance
    };
};
