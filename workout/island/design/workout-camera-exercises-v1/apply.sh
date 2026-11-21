#!/usr/bin/env bash
set -euo pipefail

bundle_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd -- "$bundle_dir/../../../.." && pwd -P)"
usage() {
  echo "Usage: $0 [--check|--apply|--check-reverse|--reverse] [--dir REPO_ROOT]"
}
action=--check
if [[ $# -gt 0 && $1 != --dir ]]; then
  action=$1
  shift
fi
if [[ $# -eq 2 && $1 == --dir ]]; then
  repo_root="$(cd -- "$2" && pwd -P)"
elif [[ $# -ne 0 ]]; then
  usage >&2
  exit 2
fi
case "$action" in
  --check|--apply) opts=() ;;
  --check-reverse|--reverse) opts=(-R) ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

if [[ ! -f "$repo_root/workout/index.html" ]]; then
  echo 'Expected Bakasun repository root with workout/index.html.' >&2
  exit 2
fi

patches=("$bundle_dir"/patches/*.patch)
git -C "$repo_root" apply "${opts[@]}" --check "${patches[@]}"
if [[ $action == --apply || $action == --reverse ]]; then
  git -C "$repo_root" apply "${opts[@]}" "${patches[@]}"
fi
echo "$action OK: $repo_root"
