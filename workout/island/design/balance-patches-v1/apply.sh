#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--check] /path/to/clean/Bakasun-checkout" >&2
  exit 2
}

check_only=false
if [[ ${1:-} == --check ]]; then
  check_only=true
  shift
fi
[[ $# == 1 ]] || usage

package_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
patches=("$package_dir"/patches/*.patch)
[[ -f ${patches[0]} ]] || { echo "No balance patches found in $package_dir." >&2; exit 1; }

target_dir=$(cd -- "$1" && pwd -P)
target_root=$(git -C "$target_dir" rev-parse --show-toplevel)
[[ $target_dir == "$target_root" ]] || { echo "Pass the root of the target checkout." >&2; exit 1; }
if [[ -n $(git -C "$target_dir" status --porcelain=v1 --untracked-files=all) ]]; then
  echo "Target checkout must be clean." >&2
  exit 1
fi

git -C "$target_dir" apply --check --index --whitespace=error-all -- "${patches[@]}"
if "$check_only"; then
  echo "All balance patches apply cleanly to $target_dir."
else
  git -C "$target_dir" apply --whitespace=error-all -- "${patches[@]}"
  echo "Applied ${#patches[@]} balance patches to $target_dir."
fi
