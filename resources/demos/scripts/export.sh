#!/usr/bin/env bash
# Export available lossless masters as MP4s for the README.
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ $# -ge 1 && $# -le 2 ]] || { printf 'Usage: %s RUN_DIRECTORY [export-directory]\n' "$0" >&2; exit 1; }
run_dir=$(realpath -e -- "$1")
output_dir=$(realpath -m -- "${2:-$script_dir/..}")
command -v ffmpeg >/dev/null || { printf 'Missing command: ffmpeg\n' >&2; exit 1; }
shopt -s nullglob
masters=("$run_dir/masters/"*.mkv)
[[ ${#masters[@]} -gt 0 ]] || { printf 'No masters found in %s/masters\n' "$run_dir" >&2; exit 1; }

for master in "${masters[@]}"; do
    name=$(basename -- "$master" .mkv)
    case $name in
        proximity|touch|workspace|maximized|tiling|preferences) ;;
        *) printf 'Unknown demo master: %s\n' "$master" >&2; exit 1 ;;
    esac
    [[ ! -e $output_dir/$name.mp4 && ! -L $output_dir/$name.mp4 ]] || {
        printf 'Refusing to overwrite %s/%s.mp4\n' "$output_dir" "$name" >&2; exit 1;
    }
done
mkdir -p -- "$output_dir"
staging_dir=$(mktemp -d "$run_dir/export.XXXXXX")
trap 'rm -rf -- "$staging_dir"' EXIT
for master in "${masters[@]}"; do
    name=$(basename -- "$master" .mkv)
    nice -n 10 ffmpeg -hide_banner -loglevel error -n -threads 2 -i "$master" \
        -map 0:v:0 -vf fps=30 -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p \
        -threads 2 -an -map_metadata -1 -movflags +faststart "$staging_dir/$name.mp4"
    cp --update=none-fail -- "$staging_dir/$name.mp4" "$output_dir/$name.mp4"
    printf 'Exported %s/%s.mp4\n' "$output_dir" "$name"
done
