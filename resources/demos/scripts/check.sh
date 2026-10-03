#!/usr/bin/env bash
# Syntax, lint, and a synthetic encoder check: never start GNOME or capture the desktop.
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
for script in "$script_dir/"*.sh; do
    bash -n "$script"
done
node --check "$script_dir/record.js"
cd -- "$script_dir/../../.."
yarn exec eslint resources/demos/scripts/record.js

# Exercise the recorder's actual pipeline and compare its decoded pixels with the input.
pipeline=$(node --input-type=module - "$script_dir/record.js" <<'JS'
import { readFileSync } from 'node:fs';
const source = readFileSync(process.argv[2], 'utf8');
const match = source.match(/'pipeline': new GLib\.Variant\('s', '([^']+)'\)/);
if (!match) throw new Error('Recording pipeline not found');
process.stdout.write(match[1]);
JS
)
read -r -a pipeline_elements <<<"$pipeline"
test_dir=$(mktemp -d /tmp/gradienttopbar-quality.XXXXXX)
trap 'rm -rf -- "$test_dir"' EXIT
nice -n 10 timeout 20s gst-launch-1.0 -q \
    videotestsrc num-buffers=8 pattern=snow \
    ! video/x-raw,format=Y444,width=320,height=200,framerate=30/1 ! tee name=t \
    t. ! queue ! filesink location="$test_dir/source.yuv" \
    t. ! queue ! "${pipeline_elements[@]}" ! filesink location="$test_dir/lossless.mkv"
nice -n 10 ffmpeg -hide_banner -loglevel error -n -threads 2 -i "$test_dir/lossless.mkv" \
    -pix_fmt yuv444p -f rawvideo "$test_dir/decoded.yuv"
cmp -- "$test_dir/source.yuv" "$test_dir/decoded.yuv"

mkdir -- "$test_dir/masters"
# The new tiling scenario must export through the same pipeline as the other demos.
mv -- "$test_dir/lossless.mkv" "$test_dir/masters/tiling.mkv"
bash "$script_dir/export.sh" "$test_dir" "$test_dir/exports"
ffprobe -v error -select_streams v:0 \
    -show_entries stream=codec_name,pix_fmt,width,height,nb_frames,r_frame_rate -of json \
    "$test_dir/exports/tiling.mp4" >"$test_dir/export.json"
node --input-type=module - "$test_dir/export.json" "$test_dir/exports" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const [video] = JSON.parse(readFileSync(process.argv[2], 'utf8')).streams;
assert.deepEqual(video, {
    codec_name: 'h264', width: 320, height: 200, pix_fmt: 'yuv420p',
    r_frame_rate: '30/1', nb_frames: '8'
});
assert.deepEqual(readdirSync(process.argv[3]), ['tiling.mp4'], 'Export must produce only an MP4');
JS
cp -- "$test_dir/exports/tiling.mp4" "$test_dir/unchanged.mp4"
if bash "$script_dir/export.sh" "$test_dir" "$test_dir/exports" >"$test_dir/overwrite.log" 2>&1; then
    printf 'Exporter unexpectedly accepted an existing output.\n' >&2; exit 1;
fi
cmp -- "$test_dir/unchanged.mp4" "$test_dir/exports/tiling.mp4"
printf 'Demo syntax, lint, lossless encoder, and MP4 export checks passed. No desktop sessions or captures started.\n'
