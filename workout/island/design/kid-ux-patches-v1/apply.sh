#!/bin/sh
set -eu

usage() {
  printf '%s\n' "Usage: $0 [--check] /path/to/clean-checkout" >&2
  exit 2
}

dry_run=false
if [ "${1:-}" = "--check" ]; then
  dry_run=true
  shift
fi
[ "$#" = 1 ] || usage

package_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)
target=$(git -C "$1" rev-parse --show-toplevel)
target=$(CDPATH='' cd -- "$target" && pwd -P)
source=$(git -C "$package_dir" rev-parse --show-toplevel 2>/dev/null || :)
if [ "$target" = "$source" ]; then
  printf '%s\n' "Choose a separate clean checkout." >&2
  exit 1
fi
if [ -n "$(git -C "$target" status --porcelain --untracked-files=normal)" ]; then
  printf '%s\n' "The target checkout must be clean." >&2
  exit 1
fi

# Validate the whole ordered series in a temporary index before touching files.
temp_dir=$(mktemp -d)
trap 'rm -rf -- "$temp_dir"' EXIT
trap 'exit 1' HUP INT TERM
GIT_INDEX_FILE="$temp_dir/index"
export GIT_INDEX_FILE
git -C "$target" read-tree HEAD
while IFS= read -r filename; do
  [ -n "$filename" ] || continue
  git -C "$target" apply --cached --whitespace=error-all "$package_dir/patches/$filename"
done < "$package_dir/patches/order.txt"
git -C "$target" diff --cached --binary --no-ext-diff -- workout/island > "$temp_dir/series.patch"
unset GIT_INDEX_FILE

git -C "$target" apply --check "$temp_dir/series.patch"
if [ "$dry_run" = false ]; then
  git -C "$target" apply "$temp_dir/series.patch"
  printf '%s\n' "Applied to $target. Preview with ?kidUx=1. Use ?kidUx=0 to restore the prior UI."
else
  printf '%s\n' "Verified the patch series against $target."
fi
