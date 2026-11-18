#!/usr/bin/env bash
set -euo pipefail

bundle=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
target=$bundle
mode=apply
reverse=false

usage() {
  printf '%s\n' 'Usage: apply.sh [--check] [--reverse] [--target PATH]'
}

while (($#)); do
  case $1 in
    --check) mode=check ;;
    --reverse) reverse=true ;;
    --target)
      if (($# < 2)); then usage >&2; exit 2; fi
      target=$2
      shift
      ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
  shift
done

repo=$(git -C "$target" rev-parse --show-toplevel)
if [[ ! -f "$repo/workout/island/minigames/hoops-session.mjs" ]]; then
  printf '%s\n' 'Target must be a Bakasun Git checkout.' >&2
  exit 2
fi
patches=(
  "$bundle/patches/01-ball-contact.patch"
  "$bundle/patches/02-arena-view.patch"
  "$bundle/patches/03-impact-audio.patch"
  "$bundle/patches/04-session-offline.patch"
)

direction=()
other=(--reverse)
if $reverse; then
  direction=(--reverse)
  other=()
fi
apply=(git -C "$repo" apply --whitespace=error)

if diagnostics=$("${apply[@]}" --check "${direction[@]}" "${patches[@]}" 2>&1); then
  if [[ $mode == check ]]; then
    printf '%s\n' 'All four basketball patches passed git apply --check.'
  else
    "${apply[@]}" "${direction[@]}" "${patches[@]}"
    if $reverse; then printf '%s\n' 'Reversed all four basketball patches.'
    else printf '%s\n' 'Applied all four basketball patches.'; fi
  fi
elif "${apply[@]}" --check "${other[@]}" "${patches[@]}" >/dev/null 2>&1; then
  if $reverse; then printf '%s\n' 'Basketball patches are already absent.'
  else printf '%s\n' 'Basketball patches are already applied.'; fi
else
  printf '%s\n' "$diagnostics" >&2
  exit 1
fi
