#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s [--check | --reverse]\n' "$0"
}
if (( $# > 1 )); then
  usage >&2
  exit 2
fi
case "${1:-}" in
  '') mode=apply ;;
  --check) mode=check ;;
  --reverse) mode=reverse ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

package_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
repo=$(git -C "$package_dir" rev-parse --show-toplevel)
patch="$package_dir/patches/0001-boars-levels-v1.patch"
args=(--whitespace=error-all)
if [[ $mode == reverse ]]; then
  args+=(--reverse)
fi

if [[ $mode == apply ]] && git -C "$repo" apply --reverse --check --whitespace=error-all "$patch" 2>/dev/null; then
  printf 'Boar Island patch is already applied.\n'
  exit 0
fi
git -C "$repo" apply "${args[@]}" --check "$patch"
if [[ $mode == check ]]; then
  printf 'Boar Island patch applies cleanly.\n'
  exit 0
fi
git -C "$repo" apply "${args[@]}" "$patch"
if [[ $mode == reverse ]]; then
  printf 'Boar Island patch reverted.\n'
else
  printf 'Boar Island patch applied to the working tree.\n'
fi
