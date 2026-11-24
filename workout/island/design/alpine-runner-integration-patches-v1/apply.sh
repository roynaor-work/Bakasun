#!/usr/bin/env bash
set -euo pipefail

bundle_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
mode=apply
case "${1-}" in
  --check) mode=check; shift ;;
  -h|--help)
    printf '%s\n' 'Usage: apply.sh [--check] [Bakasun checkout]' \
      'The default target is the Git checkout containing this script.'
    exit 0 ;;
esac
if (( $# > 1 )); then
  printf '%s\n' 'Usage: apply.sh [--check] [Bakasun checkout]' >&2
  exit 2
fi

target=$(git -C "${1:-$bundle_dir}" rev-parse --show-toplevel)
patches=(
  "$bundle_dir/patches/0001-runner-runtime.patch"
  "$bundle_dir/patches/0002-runner-assets.patch"
  "$bundle_dir/patches/0003-island-integration.patch"
)

if git -C "$target" apply --reverse --check "${patches[@]}" 2>/dev/null; then
  printf '%s\n' 'Alpine runner patches are already applied.'
  exit 0
fi
git -C "$target" apply --check "${patches[@]}"
if [[ $mode == check ]]; then
  printf '%s\n' 'Alpine runner patches apply cleanly.'
  exit 0
fi

git -C "$target" apply "${patches[@]}"
printf '%s\n' 'Alpine runner patches applied to the working tree.'
