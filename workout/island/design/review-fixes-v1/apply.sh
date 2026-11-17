#!/usr/bin/env bash
set -euo pipefail

# Always patch a NEW detached worktree. Never apply anything to the caller's tree.
bundle=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo=$(git -C "$bundle" rev-parse --show-toplevel)
base=43b27dc235387e3cb737aee9558cdf9d5fd5a262
run_dir=$(mktemp -d "${TMPDIR:-/tmp}/review-fixes-v1.XXXXXXXX")
checkout="$run_dir/checkout"
cleanup() {
  if [[ ${KEEP_REVIEW_FIX_WORKTREE:-0} != 1 ]]; then
    git -C "$repo" worktree remove --force "$checkout" >/dev/null 2>&1 || true
  fi
  printf '\nEvidence: %s\n' "$run_dir/evidence"
}
trap cleanup EXIT
git -C "$repo" cat-file -e "$base^{commit}"
git -C "$repo" worktree add --detach "$checkout" "$base"
if git -C "$checkout" symbolic-ref -q HEAD; then
  printf 'Refusing a worktree attached to a branch.\n' >&2
  exit 1
fi
node "$bundle/validate.mjs" --root "$checkout" --output "$run_dir/evidence" "$@"
