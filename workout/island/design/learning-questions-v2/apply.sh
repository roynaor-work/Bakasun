#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'שימוש: %s [--check]\n' "${0##*/}"
}

case "${1:-}" in
  ''|--check) ;;
  --help|-h) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac
if (( $# > 1 )); then
  usage >&2
  exit 2
fi

package_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(git -C "$package_dir" rev-parse --show-toplevel)"
patch="$package_dir/patches/0001-island-learning-v2.patch"

if git -C "$repo_dir" apply --check --reverse "$patch" 2>/dev/null; then
  printf 'הטלאי כבר הוחל.\n'
elif git -C "$repo_dir" apply --check "$patch"; then
  if [[ "${1:-}" == --check ]]; then
    printf 'הטלאי מתאים לגרסת הקבצים הנוכחית.\n'
    exit 0
  fi
  command -v node >/dev/null
  git -C "$repo_dir" apply "$patch"
else
  exit 1
fi

if [[ "${1:-}" != --check ]]; then
  node "$repo_dir/workout/island/tools/offline-shell.mjs"
fi
