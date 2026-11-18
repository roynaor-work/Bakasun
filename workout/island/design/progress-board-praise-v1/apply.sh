#!/usr/bin/env bash
set -euo pipefail

feature_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(git -C "$feature_dir" rev-parse --show-toplevel)
patch="$feature_dir/patches/0001-connect-progress-board.patch"

cd -- "$repo_root"
case "${1:---check}" in
  --check)
    git apply --check --whitespace=error "$patch"
    printf '%s\n' 'החיבור מתאים לעותק הנוכחי.'
    ;;
  --apply)
    git apply --check --whitespace=error "$patch"
    git apply --whitespace=error "$patch"
    printf '%s\n' 'הלוח חובר בנקודות הכניסה של האי והאימון.'
    ;;
  --reverse)
    git apply --check --reverse "$patch"
    git apply --reverse "$patch"
    printf '%s\n' 'חיבור הלוח הוסר מקובצי האי והאימון.'
    ;;
  *)
    printf '%s\n' 'אפשרויות החיבור הן --check, --apply, --reverse.' >&2
    exit 2
    ;;
esac
