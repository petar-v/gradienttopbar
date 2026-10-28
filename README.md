# Gradient Top Bar

Give GNOME’s top bar a customizable gradient.

- Choose start and end colors of the gradient
- Vertical or horizontal orientation
- Trigger an alternate style when windows are maximized or near the panel
- Keep the gradient, restore the original theme, or apply a custom gradient when triggered
- Hold the current appearance in overview, or independently choose the main gradient, a custom gradient, or the original theme
- Set the proximity distance from 0 to 100 px
- Optionally blend gradually into the alternate style as a window approaches the panel
- Smooth transitions when switching between workspaces with different top-bar styles
- Configure the style trigger, proximity distance, and transition controls in the preferences dialog
- Enable **Top Bar Style Settings** in **Behaviour** to open preferences from an empty-space right-click menu on the top bar (off by default)

Note:

If you use a tiling extension, switching the style trigger from **Maximized windows** to **Proximity** can improve detection and styling. Set the proximity distance to **0 px** to trigger the alternate (maximized) style when a window touches the top bar.

In **Gradients → Overview**, choose the top bar style for overview and the application grid. **Do nothing** is the default: it applies no overview override and leaves normal window and workspace behavior running, including proximity blends and desktop animations. Windows opening, closing or becoming maximized can still change the bar while overview is open. **Keep main gradient** uses the main gradient, **Use custom gradient** provides independent colours, opacity and direction, and **Use original theme** restores the active Shell theme. Closing an overview override restores the style for the current workspace. Explicitly saved overview choices are preserved when upgrading; resetting overview selects **Do nothing**. Switching options retains your custom gradient. The **Content Shadows** tab controls text and icon shadows for all gradients, including overview. Shadows do not apply to the original theme.

**Blend with overview gestures** is off by default and independent of proximity blending. The control is disabled for **Do nothing**, while retaining its saved value. For the other overview choices, enabling it makes CSS background opacity follow gesture progress, including the original theme. The theme background fades along with the gradients, so translucent gradients keep their appearance at both endpoints.

Static styles and transitions between native gradient or theme endpoints use Shell’s CSS fades, even when gesture blending is enabled elsewhere. Fractional proximity, workspace gestures and overview gestures use custom composition only while needed; settled native endpoints release the custom layers. A discrete workspace change that targets a fractional appearance still needs composition. Pure CSS overview cycles need no extension lifecycle callbacks. Mixed desktop composition and binary overview retain takeover/return callbacks, with final hidden observation only while cleanup needs it. **Do nothing** attaches no overview lifecycle or progress listeners. Selecting it while overview is open immediately restores the current desktop appearance and removes obsolete overview composition and observers. Native in-flight pixels cannot be captured: a native fade settles its known destination before custom takeover. Native fades can therefore look different when interrupted, reversed, or blending transparent gradients.

## Recommended companion: Overview Seamless Zoom

I recommend [Overview Seamless Zoom](https://extensions.gnome.org/extension/10794/overview-seamless-zoom/) for smoother wallpaper movement when entering and leaving overview. GNOME normally animates only the work area, excluding the desktop behind panels that reserve screen space. This can make strips of wallpaper abruptly disappear or reappear, especially with a transparent top bar. Overview Seamless Zoom includes those areas in the animation and works well alongside Gradient Top Bar.

## Screenshot
![gradient-bar-after](https://user-images.githubusercontent.com/3801306/236593253-bce6342f-67d4-4e68-9c1e-85db33074dfe.png)

## Demos

**Proximity blend:** the panel blends into the alternate style as a window approaches, then back as it moves away.

<video controls src="resources/demos/proximity.mp4" width="720">
  <a href="resources/demos/proximity.mp4">Watch the proximity blend demo</a>
</video>

[Watch the proximity blend demo (MP4)](resources/demos/proximity.mp4)

**Touch detection, 0 px:** an unmaximized window touches the panel to activate the alternate style.

<video controls src="resources/demos/touch.mp4" width="720">
  <a href="resources/demos/touch.mp4">Watch the touch detection demo</a>
</video>

[Watch the touch detection demo (MP4)](resources/demos/touch.mp4)

**Workspace transition:** swipe between workspaces with different panel styles for a smooth transition.

<video controls src="resources/demos/workspace.mp4" width="720">
  <a href="resources/demos/workspace.mp4">Watch the workspace transition demo</a>
</video>

[Watch the workspace transition demo (MP4)](resources/demos/workspace.mp4)

**Maximized mode:** maximize and restore a window to switch panel styles.

<video controls src="resources/demos/maximized.mp4" width="720">
  <a href="resources/demos/maximized.mp4">Watch the maximized mode demo</a>
</video>

[Watch the maximized mode demo (MP4)](resources/demos/maximized.mp4)

**Tiling, 0 px:** snap a window to the left half to activate the alternate style, then restore and move it away.

<video controls src="resources/demos/tiling.mp4" width="720">
  <a href="resources/demos/tiling.mp4">Watch the tiling demo</a>
</video>

[Watch the tiling demo (MP4)](resources/demos/tiling.mp4)

The clips use the included [wallpaper](resources/demos/wallpaper.jpg), a black-to-transparent normal style, and a gold-to-teal alternate style. See the [demo guide](resources/demos/README.md) to reproduce them.


# Compatibility

For up to GNOME 43, please use [this release](https://github.com/petar-v/gradienttopbar/releases/tag/44-0). Any new features will not be backwards compatible.

For GNOME 43 and above, please use the `master` branch or the latest release.

# Installation

## For Users

You can install this extension in several ways:

1. **From GNOME Extensions Website**:
   - Visit [Gradient Top Bar on GNOME Extensions](https://extensions.gnome.org/extension/1264/gradient-top-bar/)
   - Toggle the switch to install and enable the extension

2. **From GitHub Releases**:
   - Download the latest release from the [GitHub Releases page](https://github.com/petar-v/gradienttopbar/releases)
   - Install it using GNOME Extensions Manager or with the command:
     ```bash
     gnome-extensions install gradienttopbar@pshow.org.shell-extension.zip
     ```
   - Enable the extension using GNOME Extensions Manager or with the command:
     ```bash
     gnome-extensions enable gradienttopbar@pshow.org
     ```

3. **From Source**:
   - Follow the instructions in the Development Guide below

## For Developers

If you want to install the extension for development purposes, please refer to the Development Guide section.

# Issues

For any issues/bugs/problems/questions, please use the issues tab.

Beta-testing on newer releases is much appreciated as I usually use the latest GNOME version.

# Development Guide

This section provides information for developers who want to contribute to the Gradient Top Bar extension.

## Prerequisites

Before you start development, make sure you have the following installed:

- GNOME Shell (version 45 or higher)
- Node.js and Yarn (the project uses Yarn 4.18.1)
- Python 3.12 or newer
- Git

## Setting Up the Development Environment

1. Clone the repository:
   ```bash
   git clone https://github.com/petar-v/gradienttopbar.git
   cd gradienttopbar
   ```

2. Install dependencies:
   ```bash
   yarn install
   yarn setup-python
   ```

## Development Tools

The project includes several scripts to help with development:

### Testing and Debugging

- `yarn nested-wayland`: Runs a nested GNOME Shell session in Wayland mode for testing the extension without affecting your main session.
- `yarn pref-debug`: Monitors logs from GJS (GNOME JavaScript) for debugging preferences.
- `yarn open-prefs`: Opens the preferences dialog for the extension.

### Building and Installation

- `yarn validate-schemas`: Validates the GSettings schemas.
- `yarn zip` / `yarn zip-extension`: Creates the release archive with diagnostics disabled and debug modules excluded.
- `yarn local-install`: Compiles schemas, zips the extension, installs it locally, and enables it (all-in-one command for testing changes).
- `yarn zip:debug`: Creates a separate `gradienttopbar@pshow.org.debug.shell-extension.zip` with the Debug preferences tab.
- `yarn local-install:debug`: Builds and installs the debug archive locally.

### Listener monitoring

Install with `yarn local-install:debug`, then open preferences and select **Debug**. If Shell has already loaded another build in this login session, log out and back in to load the new code. The page reports an unavailable runtime until the debug extension is running.

The monitor groups actual Shell-side connections by subsystem and signal, with Settings last. Each signal's badge shows its current connection count: green above zero, red at zero, or `?` if the runtime is unavailable. It also shows callbacks since reset and callbacks per second between visible refreshes. Disconnected signals retain their totals with zero active connections. **Work** and **Renderer** rows count window scans, batched geometry refreshes, settings application and renderer calls separately, so raw event traffic can be compared with the work that survives filtering and batching. Maximization is observed through `size-changed`; proximity also observes `position-changed`.

**Collect callbacks** pauses counting without affecting the extension or its live connection inventory. Collection continues while you visit other preferences tabs; polling runs only while Debug is visible. **Reset statistics** clears totals and timings while retaining current connections and their live badge counts. **Measure callback duration** adds monotonic clock reads and reports average, maximum and total time for timed calls only. Durations are inclusive synchronous JavaScript time: nested rows overlap, and native CSS/GPU work is outside the measurement. Diagnostic polling and owner-cleanup hooks are excluded from the counts. Snapshots contain no window titles or event arguments and stay on the local session bus; no counters are written to settings or disk.

The tracked build flag defaults to false. Packaging copies sources into a temporary directory and generates the selected flag there. Release callbacks stay unwrapped, debug modules are absent from the release archive, and `yarn upload` rebuilds and selects the release archive explicitly. To remove monitoring locally, run `yarn local-install` and start a new login session.

### Code Quality

- `yarn prettify`: Formats code using Prettier.
- `yarn lint`: Lints the code using ESLint.
- `yarn shexli`: Runs the extensions.gnome.org static analyzer.
- `yarn verify`: Runs ESLint and Shexli.
- `yarn precommit`: Runs lint-staged for pre-commit hooks.

## Workflow

1. Make your changes to the code.
2. Run `yarn prettify` and `yarn verify` to ensure code quality.
3. Test your changes using `yarn local-install` and `yarn open-prefs`.
4. If needed, debug using `yarn pref-debug` or `yarn nested-wayland`.
5. Submit a pull request with your changes.
6. To publish a new version:
   1) Run `yarn zip` to create the complete extension zip
   2) Run `yarn upload` and follow the browser flow

# To Do

- [x] Add box shadow settings
- [x] Fix an issue where "Desktop icons" extension creates a weird window that messes up the dynamic toolbar colour effect.
- [x] Add demo videos
- [x] Figure out reliable testing methods or at least unit tests - the [demo recording scripts](resources/demos/README.md) provide reproducible scenarios for visual testing.
- [x] Make it work with something like tiling when the window occupies the whole top horizontally - proximity mode detects tiled windows near or touching the panel, resolving the styling issue without relying on maximized-window detection.

# Credits
This extension is a fork of [the Original Gradient Top Bar extension](https://extensions.gnome.org/extension/1264/gradient-top-bar/) by [Julien/jpec](https://peclu.net/).

I could not find the original repository nor reach the person via the email provided.

# License

DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE

        Version 2, December 2004

Copyright (C) 2026 Peter Vasilev <peter@pshow.org>

Everyone is permitted to copy and distribute verbatim or modified
copies of this license document, and changing it is allowed as long
as the name is changed.

DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

0. You just DO WHAT THE FUCK YOU WANT TO.
