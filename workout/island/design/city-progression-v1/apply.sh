#!/bin/sh
set -eu

usage() {
  printf '%s\n' 'Usage: apply.sh [--check | --apply | --reverse] [target Git checkout]'
}

mode=--check
case ${1-} in
  --check|--apply|--reverse) mode=$1; shift ;;
  -h|--help) usage; exit 0 ;;
  -*) usage >&2; exit 2 ;;
esac
if [ "$#" -gt 1 ]; then usage >&2; exit 2; fi

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(git -C "${1:-$here}" rev-parse --show-toplevel)
patch_file=$here/patches/island-integration.patch
feature=$root/workout/island/design/city-progression-v1
if [ "$mode" = --apply ] && [ ! -f "$feature/src/island-adapter.mjs" ]; then
  printf '%s\n' 'Copy the city-progression-v1 package into the target checkout before applying the runtime patch.' >&2
  exit 1
fi

case $mode in
  --check) git -C "$root" apply --check "$patch_file" ;;
  --apply) git -C "$root" apply --check "$patch_file" && git -C "$root" apply "$patch_file" ;;
  --reverse) git -C "$root" apply --reverse --check "$patch_file" && git -C "$root" apply --reverse "$patch_file" ;;
esac
