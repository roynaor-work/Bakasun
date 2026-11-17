#!/usr/bin/env bash
set -euo pipefail
package_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source_root="$(git -C "$package_dir" rev-parse --show-toplevel)"
if [[ $# -lt 1 || $# -gt 2 || ( $# -eq 2 && "$2" != --check ) ]]; then
  echo 'Usage: apply.sh CLEAN_GIT_COPY [--check]' >&2; exit 2
fi
target="$(cd -- "$1" && pwd -P)"
target_root="$(git -C "$target" rev-parse --show-toplevel)"
if [[ "$target" != "$target_root" || "$target" == "$source_root" ]]; then
  echo 'Refusing: use the root of a separate clean Git copy.' >&2; exit 2
fi
if [[ -n "$(git -C "$target" status --porcelain --untracked-files=all)" ]]; then
  echo 'Refusing: destination must have no tracked or untracked changes.' >&2; exit 2
fi
node "$package_dir/sim/verify-base.mjs" "$target"
combined="$(mktemp /tmp/soccer-quality-patches.XXXXXX)"
trap 'rm -f -- "$combined"' EXIT
cat "$package_dir"/patches/*.patch > "$combined"
git -C "$target" apply --check --whitespace=error-all "$combined"
if [[ "${2:-}" == --check ]]; then
  echo 'All patches checked; destination unchanged.'
else
  git -C "$target" apply --whitespace=error-all "$combined"
  echo 'Applied to the separate copy. Enable with ?soccerQuality=v1'
fi
