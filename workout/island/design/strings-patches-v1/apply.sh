#!/usr/bin/env bash
set -euo pipefail

bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
base=9e95482fbe1887856cbca69fd43c1c77ba62cff4
patches=(
  "$bundle/patches/01-catalog.patch"
  "$bundle/patches/02-interface.patch"
  "$bundle/patches/03-speech.patch"
  "$bundle/patches/04-offline-and-regressions.patch"
)
fail() { printf '%s\n' "$*" >&2; exit 1; }
clean() { [[ -z $(git -C "$1" status --porcelain --untracked-files=all) ]]; }

case "${1:---check}" in
  --check)
    [[ $# -le 1 ]] || fail "Usage: $0 [--check | --apply CLEAN_CHECKOUT]"
    repository=$(git -C "$bundle" rev-parse --show-toplevel)
    revision=$(git -C "$repository" rev-parse --verify "$base^{commit}")
    ;;
  --apply)
    [[ $# -eq 2 ]] || fail "Usage: $0 --apply CLEAN_CHECKOUT"
    repository=$(git -C "$2" rev-parse --show-toplevel)
    clean "$repository" || fail "Target checkout must be clean: $repository"
    revision=$(git -C "$repository" rev-parse HEAD)
    ;;
  *) fail "Usage: $0 [--check | --apply CLEAN_CHECKOUT]" ;;
esac

scratch=$(mktemp -d)
checkout="$scratch/checkout"
cleanup() {
  if [[ -e "$checkout/.git" ]]; then
    git -C "$repository" worktree remove --force "$checkout"
  fi
  [[ ! -d $scratch ]] || rmdir "$scratch"
}
trap cleanup EXIT
git -C "$repository" worktree add --quiet --detach "$checkout" "$revision"
git -C "$checkout" apply --index --check --whitespace=error "${patches[@]}"
git -C "$checkout" apply --index --whitespace=error "${patches[@]}"

python3 "$bundle/tests/catalog.py" "$checkout"
ISLAND_PATCH_CHECKOUT="$checkout" node --jitless --expose-internals --test "$bundle"/tests/*.test.mjs
(
  cd -- "$checkout"
  node --jitless --test tests/island-{l1,economy,boot-splash,offline,offline-v25,tennis-v24-4}.test.mjs
  copy_tests='words, styles and the offline list|words for the child|bundled Boar sources|boars v24: wired|v7 HUD: tool button|v8 strings and offline|a single truck hint|pit HUD'
  node --jitless --test --test-name-pattern="$copy_tests" \
    tests/island-{aliens-naval-v24,aliens-v23,boar-integration,boars-v24,catch-v7,catch-v8,g2j,racing-v24-1}.test.mjs
)

if [[ ${1:-} == --apply ]]; then
  clean "$repository" || fail "Target checkout changed during validation: $repository"
  [[ $(git -C "$repository" rev-parse HEAD) == "$revision" ]] || fail "Target HEAD changed during validation."
  git -C "$repository" apply --index --whitespace=error "${patches[@]}"
  printf 'Patches applied and staged in %s\n' "$repository"
else
  printf 'Patches verified on a clean copy of %s\n' "$revision"
fi
