#!/usr/bin/env bash
set -euo pipefail

package_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
target="$package_dir/../../../.."
check=false
reverse=false
visuals=auto

usage() {
  cat <<'HELP'
Usage: apply.sh [--check] [--reverse] [--core-only | --with-visuals] [--target DIR]
  --check         Verify the selected changes without writing files.
  --reverse       Remove the applied changes.
  --core-only     Apply or remove the battle changes alone.
  --with-visuals  Require the optional effects patch. By default it is used when compatible.
  --target DIR    Work against this checkout or staging root. Defaults to the package's checkout.
HELP
}

while (($#)); do
  case "$1" in
    --check) check=true ;;
    --reverse) reverse=true ;;
    --core-only | --with-visuals)
      if [[ $visuals != auto ]]; then usage >&2; exit 2; fi
      visuals=$1 ;;
    --target)
      if (($# < 2)); then usage >&2; exit 2; fi
      target=$2
      shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
  shift
done

cd -P -- "$target"
if [[ ! -f workout/island/minigames/naval.mjs || ! -f workout/island/data/config.json ]]; then
  echo 'Expected a Bakasun checkout or staging root.' >&2
  exit 2
fi

# Apply from exactly this root, including when the staging copy is inside another repo.
export GIT_CEILING_DIRECTORIES
GIT_CEILING_DIRECTORIES=$(dirname -- "$PWD")
core="$package_dir/patches/001-battle.patch"
effects="$package_dir/patches/002-visuals.patch"
options=()
if $reverse; then options+=(--reverse); fi
patches=("$core")
if [[ $visuals == --with-visuals ]]; then
  patches+=("$effects")
elif [[ $visuals == auto && -f $effects ]] && git apply "${options[@]}" --check "$effects" >/dev/null 2>&1; then
  patches+=("$effects")
fi
if $reverse && ((${#patches[@]} == 2)); then patches=("$effects" "$core"); fi

# A single git apply validates and applies the whole set together.
if $check; then options+=(--check); fi
git apply "${options[@]}" "${patches[@]}"
