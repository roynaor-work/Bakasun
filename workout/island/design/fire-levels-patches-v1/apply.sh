#!/usr/bin/env bash
set -euo pipefail

base=9e95482fbe1887856cbca69fd43c1c77ba62cff4
package_dir=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
check_only=false
direction=()
while (($#)); do
  case "$1" in
    --check) check_only=true ;;
    --reverse) direction=(--reverse) ;;
    -h|--help)
      printf 'Usage from the target repository: %s [--check] [--reverse]\n' "${0##*/}"
      exit 0 ;;
    *) printf 'Unknown argument %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

repo=$(git rev-parse --show-toplevel)
git -C "$repo" cat-file -e "$base^{commit}"
temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/fire-levels-patches.XXXXXXXX")
trap 'rm -rf -- "$temp_dir"' EXIT
mkdir "$temp_dir/objects"
objects=$(git -C "$repo" rev-parse --path-format=absolute --git-path objects)

# Build a single change against the published base. This lets Git verify all
# code and asset paths together before it writes into the target worktree.
(
  export GIT_INDEX_FILE="$temp_dir/index"
  export GIT_OBJECT_DIRECTORY="$temp_dir/objects"
  export GIT_ALTERNATE_OBJECT_DIRECTORIES="$objects${GIT_ALTERNATE_OBJECT_DIRECTORIES:+:$GIT_ALTERNATE_OBJECT_DIRECTORIES}"
  git -C "$repo" read-tree "$base"
  for patch in "$package_dir"/patches/[0-9][0-9]-*.patch; do
    git -C "$repo" apply --cached "$patch"
  done

  assets="$package_dir/patches/assets"
  if [[ -d "$assets" ]]; then
    find "$assets" -type f -print0 > "$temp_dir/assets"
    while IFS= read -r -d '' file; do
      target=workout/island/assets/${file#"$assets/"}
      if git -C "$repo" cat-file -e ":$target" 2>/dev/null; then
        printf 'Asset path already exists in the patch base: %s\n' "$target" >&2
        exit 1
      fi
      blob=$(git -C "$repo" hash-object -w --no-filters -- "$file")
      git -C "$repo" update-index --add --cacheinfo 100644 "$blob" "$target"
    done < "$temp_dir/assets"
  fi
  git -C "$repo" diff --cached --binary --full-index --no-ext-diff --no-textconv "$base" > "$temp_dir/install.patch"
)

git -C "$repo" apply --check --whitespace=error "${direction[@]}" "$temp_dir/install.patch"
if "$check_only"; then
  printf 'Fire levels patch check passed.\n'
else
  git -C "$repo" apply --whitespace=error "${direction[@]}" "$temp_dir/install.patch"
  if (("${#direction[@]}")); then
    printf 'Fire levels patch reversed in %s.\n' "$repo"
  else
    printf 'Fire levels patch applied in %s.\n' "$repo"
  fi
fi
