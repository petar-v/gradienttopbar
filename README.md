# Gradient Top Bar

Makes the topbar's background gradient.


## Screenshot
![gradient-bar-after](https://user-images.githubusercontent.com/3801306/236593253-bce6342f-67d4-4e68-9c1e-85db33074dfe.png)


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
- Node.js and Yarn (the project uses Yarn 4.0.1)
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
   ```

## Development Tools

The project includes several scripts to help with development:

### Testing and Debugging

- `yarn nested-wayland`: Runs a nested GNOME Shell session in Wayland mode for testing the extension without affecting your main session.
- `yarn restart-gnome-shell`: Restarts the GNOME Shell (useful after making changes).
- `yarn pref-debug`: Monitors logs from GJS (GNOME JavaScript) for debugging preferences.
- `yarn open-prefs`: Opens the preferences dialog for the extension.

### Building and Installation

- `yarn compile-schemas`: Compiles the GSettings schemas.
- `yarn zip`: Creates a zip archive of the extension.
- `yarn zip-extension`: Packs the extension using GNOME's extension tools.
- `yarn local-install`: Compiles schemas, zips the extension, installs it locally, and enables it (all-in-one command for testing changes).

### Code Quality

- `yarn prettify`: Formats code using Prettier.
- `yarn lint`: Lints the code using ESLint.
- `yarn precommit`: Runs lint-staged for pre-commit hooks.

## Workflow

1. Make your changes to the code.
2. Run `yarn prettify` and `yarn lint` to ensure code quality.
3. Test your changes using `yarn local-install` and `yarn open-prefs`.
4. If needed, debug using `yarn pref-debug` or `yarn nested-wayland`.
5. Submit a pull request with your changes.

# To Do

- [ ] Add box shadow settings
- [ ] Fix an issue where "Desktop icons" extension creates a weird window that messes up the dynamic toolbar colour effect.
- [ ] Add a demo video
- [ ] Figure out reliable testing methods or at least unit tests
- [ ] Make it work with something like tiling when the window occupies the whole top horizontally (to test with Tiling Assistant)

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
