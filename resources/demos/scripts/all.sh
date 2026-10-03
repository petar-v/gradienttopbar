#!/usr/bin/env bash
# Record every scenario sequentially, stopping at the first failure.
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ $# -le 1 ]] || { printf 'Usage: %s [run-directory]\n' "$0" >&2; exit 1; }
run_dir=$(realpath -m -- "${1:-$script_dir/../output/$(date +%Y%m%d-%H%M%S)}")
scenarios=(proximity touch workspace maximized tiling preferences)

# Check every destination before starting the first private session.
for scenario in "${scenarios[@]}"; do
    [[ ! -e $run_dir/masters/$scenario.mkv && ! -L $run_dir/masters/$scenario.mkv ]] || {
        printf 'Refusing to overwrite %s/masters/%s.mkv\n' "$run_dir" "$scenario" >&2; exit 1;
    }
done
mkdir -p -- "$run_dir/masters" "$run_dir/logs"
printf 'Saving %s lossless demo masters in %s\n' "${#scenarios[@]}" "$run_dir"
for scenario in "${scenarios[@]}"; do
    bash "$script_dir/$scenario.sh" "$run_dir" || exit 1
done 2>&1 | tee "$run_dir/logs/recording.log"
printf 'All %s demos saved in %s\n' "${#scenarios[@]}" "$run_dir"
