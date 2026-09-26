export const blendEffectStrength = (startStrength, endStrength, progress) =>
    startStrength + (endStrength - startStrength) * progress;
