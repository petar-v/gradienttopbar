export const calculateProximityStrength = (windowDistance, proximityDistance) =>
    proximityDistance === 0
        ? Number(windowDistance <= 0)
        : Math.max(0, Math.min(1, 1 - windowDistance / proximityDistance));
