#!/usr/bin/env bash
set -euo pipefail

check_only=false
if [[ ${1:-} == --check ]]; then
  check_only=true
  shift
fi
if [[ $# != 1 ]]; then
  printf 'Usage: %s [--check] /path/to/clean-checkout\n' "$0" >&2
  exit 2
fi

bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
target=$(git -C "$1" rev-parse --show-toplevel)
status=$(git -C "$target" status --porcelain --untracked-files=all)
if [[ -n $status ]]; then
  printf 'The target checkout must be clean: %s\n' "$target" >&2
  exit 1
fi

shopt -s nullglob
patches=("$bundle"/patches/*.patch)
if [[ ${#patches[@]} != 14 ]]; then
  printf 'Expected 14 patch files, found %s\n' "${#patches[@]}" >&2
  exit 1
fi

scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
objects=$(git -C "$target" rev-parse --path-format=absolute --git-path objects)
mkdir "$scratch/objects"
(
  export GIT_INDEX_FILE="$scratch/index"
  export GIT_OBJECT_DIRECTORY="$scratch/objects"
  export GIT_ALTERNATE_OBJECT_DIRECTORIES="$objects"
  git -C "$target" read-tree HEAD
  for patch in "${patches[@]}"; do
    printf 'Checking %s\n' "${patch##*/}"
    git -C "$target" apply --cached --whitespace=error "$patch"
  done
  git -C "$target" diff --cached --binary --full-index --no-renames --no-ext-diff HEAD > "$scratch/series.patch"
)
git -C "$target" apply --check --index --whitespace=error "$scratch/series.patch"
if "$check_only"; then
  printf 'All patches apply cleanly to %s\n' "$target"
else
  git -C "$target" apply --index --whitespace=error "$scratch/series.patch"
  printf 'Applied and staged all patches in %s\n' "$target"
fi
