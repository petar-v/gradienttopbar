# Demo recordings

The recorder in `scripts/` reproduces the extension demos in a disposable GNOME Shell 51 Wayland devkit session. It uses `wallpaper.jpg`, a vertical black-to-transparent normal panel, and a horizontal gold-to-teal alternate panel.

Final MP4s, the wallpaper, and scripts belong in Git. Generated masters and logs live under `output/`, which is ignored. Extension packaging includes only `src/`, so none of these demo assets enter the extension ZIP.

## Requirements

Recording needs GNOME Shell 51 with Mutter devkit, GJS, D-Bus tools, `glib-compile-schemas`, working PipeWire screencasting, and GStreamer's `x264enc` and `matroskamux` plugins. Run from an existing Wayland desktop. The preferences recorder uses the GNOME Shell libraries installed under `/usr/lib/gnome-shell`.

Exporting needs FFmpeg with `libx264`. Validation also needs Node.js, Yarn, `gst-launch-1.0`, and `ffprobe`. No additional Node or Python packages are needed for recording.

## Record

From the project root:

```sh
yarn demo all
```

`scripts/record.sh` records the six scenarios sequentially and stops on the first failure. Omitting the scenario also records all six. Each run creates `output/<timestamp>/masters/` and `output/<timestamp>/logs/`. To choose the run directory:

```sh
yarn demo all resources/demos/output/my-run
```

Run one scenario by name. The optional second argument is a run directory:

```sh
yarn demo proximity
yarn demo tiling resources/demos/output/tiling-run
yarn demo preferences resources/demos/output/preferences-run
```

| Scenario | Approximate length | What it records |
| --- | --- | --- |
| `proximity` | 6 seconds | A window approaches the panel, blends into the alternate style, then moves away. |
| `touch` | 4 seconds | With a 0 px distance, an unmaximized window touches the panel and moves away. |
| `workspace` | 6 seconds | A native workspace swipe moves between alternate and normal panel styles, then back. |
| `maximized` | 4 seconds | A window maximizes and restores. |
| `tiling` | 4–5 seconds | With proximity at 0 px, a floating window snaps to the left half, touches the panel and activates the alternate style, then restores. |
| `preferences` | 5 seconds | The actual Behaviour page switches to proximity, sets the distance to 0 and 100 px, and enables the gradual transition. |

The recorder checks the private Shell PID, D-Bus bus, extension path, and Wayland display before controlling the session. Settings use private XDG directories, and cleanup closes the private Shell. The printed `/tmp/gradienttopbar-demo.*` profile is retained for troubleshooting; session and Shell logs are also saved in the run's `logs/` folder.

The tiling demo uses GNOME's native Super+Left shortcut, sent through a virtual keyboard on the private Shell's seat. After untiling, it moves the window away from the panel so the normal style returns. It checks the snapped and restored window geometry and stops if either operation fails. No third-party tiling extension is needed. Watch the recorded [tiling clip](tiling.mp4).

Capture uses the built-in GNOME recorder at native 1024×640 resolution, requesting 30 fps. H.264 encoding uses zero quantization, 4:4:4 color, the ultrafast preset, and two encoder threads. Encoding is lossless after conversion to YUV color. The original recording is copied into `masters/` without resizing or re-encoding.

The preferences scenario is included, but its clip is still pending: the previous run stopped before capture because the private monitor reported 480×480 instead of 1024×640. The monitor check remains enforced.

## Export for the README

Export the available masters without starting a desktop session:

```sh
yarn demo:export resources/demos/output/my-run resources/demos/output/my-run/review
```

The exporter creates native-resolution H.264 MP4s at 30 fps with CRF 14 and 4:2:0 color for browser playback. The main README embeds each MP4 with a video element and a direct link for renderers that do not support it. Encoding uses two threads and a lower scheduling priority.

Review the exports, then replace the corresponding MP4 files directly under `resources/demos/`. If the export directory is omitted, that is the default destination. Existing exports and masters are never overwritten by the scripts. Only scenarios with a master are exported.

## Validate without recording

```sh
yarn demo:check
```

This checks Bash syntax and JavaScript lint, verifies the lossless encoder with synthetic frames, checks MP4 export metadata and output files, and verifies that the exporter refuses to overwrite an existing file. It does not launch GNOME or capture the desktop.
