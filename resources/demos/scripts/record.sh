#!/usr/bin/env bash
# Shared launcher for one demo in a disposable GNOME Wayland devkit session.
# Usage: ./record.sh SCENARIO [run-directory] (existing files are never overwritten).
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
demo_dir=$(cd -- "$script_dir/.." && pwd)
extension_schema=org.gnome.shell.extensions.org.pshow.gradienttopbar

if [[ ${1:-} == --session ]]; then
    [[ $# == 3 ]] || exit 1
    profile=$2
    scenario=$3
    [[ $profile == /tmp/gradienttopbar-demo.* && -d $profile &&
        ${XDG_CONFIG_HOME:-} == "$profile/config" && ${XDG_DATA_HOME:-} == "$profile/data" &&
        -n ${DBUS_SESSION_BUS_ADDRESS:-} && ${DBUS_SESSION_BUS_ADDRESS:-} != "${demo_parent_bus:-}" ]] || {
        printf 'Refusing to configure settings outside the private demo session.\n' >&2; exit 1;
    }
    wallpaper_uri=$(gjs -c 'print(imports.gi.Gio.File.new_for_path(ARGV[0]).get_uri())' "$demo_dir/wallpaper.jpg")

    # All settings below live on the private session bus and in its private XDG directories.
    gsettings set org.gnome.shell allow-extension-installation false
    gsettings set org.gnome.shell enabled-extensions "['gradienttopbar@pshow.org']"
    gsettings set org.gnome.shell welcome-dialog-last-shown-version "$(gnome-shell --version | awk '{print $3}')"
    gsettings set org.gnome.desktop.screensaver lock-enabled false
    gsettings set org.gnome.desktop.session idle-delay 0
    gsettings set org.gnome.mutter dynamic-workspaces false
    gsettings set org.gnome.desktop.wm.preferences num-workspaces 2
    gsettings set org.gnome.desktop.background picture-uri "$wallpaper_uri"
    gsettings set org.gnome.desktop.background picture-uri-dark "$wallpaper_uri"
    gsettings set org.gnome.desktop.background picture-options zoom
    style_trigger=proximity
    proximity_distance=100
    proximity_transition=false
    case $scenario in
        proximity) proximity_transition=true ;;
        touch|workspace|tiling) proximity_distance=0 ;;
        maximized|preferences) style_trigger=maximized ;;
        *) printf 'Unknown scenario: %s\n' "$scenario" >&2; exit 1 ;;
    esac
    if [[ $scenario == tiling ]]; then
        gsettings set org.gnome.mutter.keybindings toggle-tiled-left "['<Super>Left']"
    fi
    gsettings set "$extension_schema" style-trigger "$style_trigger"
    gsettings set "$extension_schema" proximity-distance "$proximity_distance"
    gsettings set "$extension_schema" proximity-transition "$proximity_transition"
    gsettings set "$extension_schema" maximized-behavior apply-style
    gsettings set "$extension_schema" gradient-direction vertical
    gsettings set "$extension_schema" colors "['rgba(0, 0, 0, 1)', 'rgba(0, 0, 0, 0)']"
    gsettings set "$extension_schema" maximized-gradient-direction horizontal
    gsettings set "$extension_schema" maximized-colors "['rgba(157, 115, 53, 1)', 'rgba(61, 105, 114, 1)']"

    gnome-shell --devkit --devkit-args='--monitor-size=1024x640' --wayland --no-x11 --unsafe-mode --force-animations >"$profile/shell.log" 2>&1 &
    shell_pid=$!
    cleanup() {
        kill -TERM "$shell_pid" 2>/dev/null || true
        wait "$shell_pid" 2>/dev/null || true
    }
    trap cleanup EXIT
    trap 'exit 130' INT TERM HUP
    gdbus wait --session --timeout 25 org.gnome.Shell
    GDK_BACKEND=wayland \
        GI_TYPELIB_PATH="/usr/lib/gnome-shell/girepository-1.0${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}" \
        LD_LIBRARY_PATH="/usr/lib/gnome-shell${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
        gjs -m "$script_dir/record.js" "$shell_pid" "$profile" "$scenario"
    exit
fi

[[ $# -ge 1 && $# -le 2 ]] || { printf 'Usage: %s SCENARIO [run-directory]\n' "$0" >&2; exit 1; }
scenario=$1
case $scenario in
    proximity|touch|workspace|maximized|tiling|preferences) ;;
    *) printf 'Unknown scenario: %s\n' "$scenario" >&2; exit 1 ;;
esac
[[ -n ${WAYLAND_DISPLAY:-} && -n ${XDG_RUNTIME_DIR:-} ]] || {
    printf 'Run from an existing Wayland desktop session.\n' >&2; exit 1;
}
for command in gnome-shell gjs gsettings gdbus dbus-run-session glib-compile-schemas gst-inspect-1.0 timeout; do
    command -v "$command" >/dev/null || { printf 'Missing command: %s\n' "$command" >&2; exit 1; }
done
for plugin in x264enc matroskamux; do
    gst-inspect-1.0 "$plugin" >/dev/null || { printf 'Missing GStreamer plugin: %s\n' "$plugin" >&2; exit 1; }
done
run_dir=$(realpath -m -- "${2:-$demo_dir/output/$(date +%Y%m%d-%H%M%S)}")
output="$run_dir/masters/$scenario.mkv"
log_dir="$run_dir/logs"
[[ ! -e $output && ! -L $output ]] || {
    printf 'Refusing to overwrite %s\n' "$output" >&2; exit 1;
}
[[ -f $demo_dir/wallpaper.jpg ]] || { printf 'Missing wallpaper.jpg\n' >&2; exit 1; }
mkdir -p -- "$run_dir/masters" "$log_dir"

profile=$(mktemp -d /tmp/gradienttopbar-demo.XXXXXX)
printf 'Private profile and logs: %s\n' "$profile"
trap 'if [[ -f $profile/shell.log ]]; then cp -- "$profile/shell.log" "$log_dir/$scenario-shell.log"; fi' EXIT
export XDG_CONFIG_HOME="$profile/config" XDG_DATA_HOME="$profile/data"
export XDG_CACHE_HOME="$profile/cache" XDG_STATE_HOME="$profile/state"
export XDG_DATA_DIRS="$profile/extensions-data:/usr/local/share:/usr/share"
export GTK_A11Y=none GSETTINGS_BACKEND=dconf GIO_USE_VFS=local LC_ALL=C.UTF-8
export demo_parent_bus=${DBUS_SESSION_BUS_ADDRESS:-}
export demo_host_display=$WAYLAND_DISPLAY
extension_dir="$profile/extensions-data/gnome-shell/extensions/gradienttopbar@pshow.org"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME" "$extension_dir"
cp -a -- "$script_dir/../../../src/." "$extension_dir/"
export GSETTINGS_SCHEMA_DIR="$extension_dir/schemas"
glib-compile-schemas --strict "$GSETTINGS_SCHEMA_DIR"
# The temporary system-data path lets the extension load with online updates disabled.
nice -n 10 timeout --signal=TERM --kill-after=5s 75s dbus-run-session -- bash "$script_dir/record.sh" --session "$profile" "$scenario" 2>&1 | tee "$log_dir/$scenario.log"
recording=$(cat "$profile/recording.path")
cp --update=none-fail -- "$recording" "$output"
printf 'Saved %s demo: %s\n' "$scenario" "$output"
