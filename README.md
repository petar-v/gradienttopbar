# Gradient Top Bar

Give GNOME’s top bar a customizable gradient.

- Choose start and end colors of the gradient
- Vertical or horizontal orientation
- Trigger an alternate style when windows are maximized or near the panel
- Keep the gradient, restore the original theme, or apply a custom gradient when triggered
- Set the proximity distance from 0 to 100 px
- Optionally blend gradually into the alternate style as a window approaches the panel
- Smooth transitions when switching between workspaces with different top-bar styles
- Configure the style trigger, proximity distance, and transition controls in the preferences dialog

Note:

If you use a tiling extension, switching the style trigger from **Maximized windows** to **Proximity** can improve detection and styling. Set the proximity distance to **0 px** to trigger the alternate (maximized) style when a window touches the top bar.


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
- `yarn zip`: Creates a zip archive of the extension.
- `yarn zip-extension`: Packs the extension using GNOME's extension tools.
- `yarn local-install`: Compiles schemas, zips the extension, installs it locally, and enables it (all-in-one command for testing changes).

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

- [ ] Add box shadow settings
- [ ] Fix an issue where "Desktop icons" extension creates a weird window that messes up the dynamic toolbar colour effect.
- [x] Add demo videos
- [x] Figure out reliable testing methods or at least unit tests - the [demo recording scripts](resources/demos/README.md) provide reproducible scenarios for visual testing.
- [x] Make it work with something like tiling when the window occupies the whole top horizontally - proximity mode detects tiled windows near or touching the panel, resolving the styling issue without relying on maximized-window detection.

# Credits
This extension is a fork of [the Original Gradient Top Bar extension](https://extensions.gnome.org/extension/1264/gradient-top-bar/) by [Julien/jpec](https://peclu.net/).

I could not find the original repository nor reach the person via the email provided.

# License

DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE

        Version 2, December 2004

Copyright (C) 2004 Sam Hocevar <sam@hocevar.net>

Everyone is permitted to copy and distribute verbatim or modified
copies of this license document, and changing it is allowed as long
as the name is changed.

DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

0. You just DO WHAT THE FUCK YOU WANT TO.
