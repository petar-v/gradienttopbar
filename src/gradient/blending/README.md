# Overview background blending specification

Blend the panel's currently displayed desktop appearance into its selected
overview appearance as the overview gesture progresses. The source may already
be a partial window/proximity blend. Preserve that appearance at gesture start;
preserve the actual overview appearance at completion.

The overview choices remain main gradient, original theme, and custom gradient.
“Blend with overview gestures” is off by default and independent of window
proximity blending. When off, keep the existing timed CSS transition.

When enabled, follow GNOME's overview progress, including pauses, reversals,
cancellation, and settling. A pause must hold the same appearance. Reversing
progress must retrace the same blend when the endpoints remain unchanged.
Moving between the window picker and app grid must retain the overview style.

## Rendering approach

Use CSS backgrounds with their original colors, gradient directions, and alpha.
Draw the destination above the source. Apply the calculated coefficients to
background actor opacity only; panel text and icons stay live and unaffected.

During the gesture, update actor opacity rather than writing a stylesheet or
regenerating gradient CSS each frame. JavaScript owns progress, state, and the
small calculation below. No screenshots, texture snapshots, offscreen capture,
custom shaders, or equivalent capture techniques are part of this approach.

## Why complementary opacities need correction

Simply giving the source opacity `1 - p` and the destination opacity `p` does
not produce a linear crossfade under normal source-over compositing. The upper
layer also obscures the lower layer. Even two opaque backgrounds become only
75% opaque at halfway progress, exposing more of the scene behind the panel.

The desired combined alpha is the linear interpolation of the endpoint alphas:

```text
p = gesture progress, from 0 to 1
a = source background's original alpha
b = destination background's original alpha

desiredAlpha = (1 - p) * a + p * b
```

For example, 10% source alpha and 60% destination alpha should give 35% combined
alpha at halfway progress. Here “alpha” means opacity: zero is transparent.

## Calculation

Keep the destination actor coefficient at `p`. Its contribution is then `p * b`.
The destination transmits `1 - p * b` of the source underneath it. Let `s` be
the source actor coefficient:

```text
combinedAlpha = p * b + s * a * (1 - p * b)

Set combinedAlpha equal to desiredAlpha:
s * a * (1 - p * b) = (1 - p) * a

sourceOpacity      = (1 - p) / (1 - p * b)
destinationOpacity = p
```

The source alpha cancels, so the module does not need it as an input. When the
source is fully transparent its coefficient has no visible effect, and the
same formula remains usable.

For the 10% to 60% example at `p = 0.5`, the source coefficient is approximately
`0.714286` and the destination coefficient is `0.5`:

```text
combinedAlpha = 0.5 * 0.6 + 0.714286 * 0.1 * (1 - 0.5 * 0.6)
              = 0.35
```

These are coefficients applied to the original backgrounds, not replacement
alpha values for their gradient colors.

## Gradients with varying alpha

Use the arithmetic mean of the destination gradient's two endpoint alphas:

```text
b = (destinationStartAlpha + destinationEndAlpha) / 2
```

This is an approximation. One actor coefficient cannot exactly compensate for
different alpha values at every position across the panel. Different gradient
directions and a source composed of multiple backgrounds make that distinction
especially relevant. The formula is exact for uniform destination alpha and
approximate between endpoints when destination alpha varies.

Keep the original backgrounds intact so this approximation disappears at the
endpoints. Do not replace the final gradient with its mean alpha or switch from
a flattened average gradient to the real gradient at completion.

## Endpoint rules

| Progress | Source actor opacity | Destination actor opacity | Visible result |
| --- | --- | --- | --- |
| `0` | `1` | `0` | Original source appearance |
| `1` | `0` | `1` | Original destination appearance |

Handle `p = 1` explicitly to avoid `0 / 0` for an opaque destination. When the
destination is completely opaque, the source stays fully visible underneath
it until completion; removing that fully covered source has no visible effect.
The source coefficient can change abruptly in that special case while the
rendered appearance remains continuous.

Restore matching real panel styling before removing temporary background
layers. On cancellation, restore the current desktop appearance. Window
callbacks must not overwrite an active overview blend. Respect reduced motion
and remove actors and signal handlers on disable/re-enable.

## Pure module contract

```js
calculateBackgroundBlend(progress, destinationStartAlpha, destinationEndAlpha)
// Returns { sourceOpacity, destinationOpacity }
```

All inputs are finite numbers in `[0, 1]`; invalid inputs throw `RangeError`.
Outputs also use `[0, 1]`. The function has no GNOME dependencies, side effects,
rendering, timers, settings access, or mutable state.

The future caller supplies normalized gesture progress and destination color
alphas, then applies the result to source and destination background actors.
Native theme backgrounds may not expose a meaningful pair of gradient alphas;
their alpha extraction or fallback remains an integration decision. Do not
silently assume an arbitrary theme is opaque or use capture to estimate it.

## Separate wallpaper limitation

The prior GNOME 51.1 source investigation found that the desktop wallpaper is
hidden when overview starts and replaced by wallpaper inside the overview
workspace preview. That preview uses the work area, which excludes the panel.
Translucent panel backgrounds can expose this scene change immediately.

Correcting background coefficients removes the extra transparency introduced
by our compositing; it does not preserve the wallpaper behind the panel.
Managing a wallpaper actor or changing GNOME's background visibility would be
separate work, outside this module and this agreement. Recheck this behavior
on other GNOME versions.

## Checks before future integration is considered complete

- Verify the 10% to 60% example, fully transparent and opaque backgrounds,
  differing endpoint alphas, and exact progress-zero/progress-one appearances.
- Check actual gesture pauses, reversals, cancellation, settling, and app-grid
  transitions without endpoint flashes or window callbacks overriding the blend.
- Check source appearances that are already partially blended, original-theme
  handling, reduced motion, and disable/re-enable cleanup.
- Confirm no stylesheet writes occur during progress updates. Keep any runtime
  validation isolated from the installed extension and desktop settings unless
  separately authorized.

Only the standalone calculation was requested for implementation in this
discussion. It passed a temporary numeric self-check and targeted ESLint;
those checks do not establish visual correctness of a future integration.
