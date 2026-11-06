/**
 * Calculate actor opacities for a destination background drawn over a source.
 * Keep both backgrounds' original colors and alpha; apply these coefficients
 * only to their actor opacity. All inputs and outputs use the range [0, 1].
 *
 * With source alpha a, destination alpha b and gesture progress p, the desired
 * combined alpha is A = (1 - p) * a + p * b. Source-over compositing gives
 * A = p * b + sourceOpacity * a * (1 - p * b), so a cancels and
 * sourceOpacity = (1 - p) / (1 - p * b); destinationOpacity = p.
 *
 * Use the mean of the destination gradient's two endpoint alphas for b.
 * shortcut: varying alpha is approximate between endpoints; use per-pixel
 * blending if exact intermediate gradients are required. The original source
 * is preserved at p = 0 and the original destination at p = 1.
 * For an opaque destination, sourceOpacity stays at 1 until completion, then
 * becomes 0 underneath the fully opaque destination without a visible jump.
 */
export const calculateBlendOpacities = (progress, destinationStartAlpha, destinationEndAlpha) => {
    for (const value of [progress, destinationStartAlpha, destinationEndAlpha]) {
        if (!Number.isFinite(value) || value < 0 || value > 1)
            throw new RangeError('Progress and gradient alphas must be finite numbers between 0 and 1');
    }

    // At completion only the destination remains; also avoid 0 / 0 when b = 1.
    if (progress === 1)
        return { sourceOpacity: 0, destinationOpacity: 1 };

    // Approximate a two-color gradient's destination alpha by its endpoint mean.
    const destinationAlpha = (destinationStartAlpha + destinationEndAlpha) / 2;

    // The destination leaves this fraction of the source visible underneath it.
    const sourceTransmission = 1 - progress * destinationAlpha;

    // Compensate for that occlusion to retain the desired (1 - p) contribution.
    const sourceOpacity = (1 - progress) / sourceTransmission;

    // The destination contributes p times its original alpha, without modification.
    return { sourceOpacity, destinationOpacity: progress };
};
