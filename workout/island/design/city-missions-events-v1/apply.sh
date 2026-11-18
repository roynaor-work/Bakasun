#!/bin/sh
set -eu

usage() {
    printf '%s\n' 'apply.sh [--check] [--reverse] [--repo PATH | PATH]'
}

fail() {
    printf '%s\n' "$1" >&2
    exit 2
}

package_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
patch_file="$package_dir/patches/island-integration.patch"
repo=
check=
reverse=

while [ "$#" -gt 0 ]; do
    case "$1" in
        --check) check=--check ;;
        --reverse) reverse=--reverse ;;
        --repo)
            [ "$#" -ge 2 ] && [ -n "$2" ] || fail 'חסר נתיב אחרי --repo.'
            [ -z "$repo" ] || fail 'יש לציין נתיב מאגר אחד.'
            repo=$2
            shift
            ;;
        -h|--help) usage; exit 0 ;;
        -*) usage >&2; fail "אפשרות לא מוכרת $1" ;;
        *)
            [ -z "$repo" ] || fail 'יש לציין נתיב מאגר אחד.'
            repo=$1
            ;;
    esac
    shift
done

repo=${repo:-"$package_dir/../../../.."}
[ -d "$repo" ] || fail "תיקיית המאגר לא קיימת $repo"
repo=$(CDPATH= cd -- "$repo" && pwd -P)
repo_root=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null) || fail "התיקייה אינה עץ עבודה של Git $repo"
[ "$repo" = "$repo_root" ] || fail "יש לציין את תיקיית השורש של המאגר $repo_root"
[ -r "$patch_file" ] || fail "קובץ ה־patch חסר $patch_file"

set --
if [ -n "$check" ]; then set -- "$@" "$check"; fi
if [ -n "$reverse" ]; then set -- "$@" "$reverse"; fi
exec git -C "$repo" apply --whitespace=error "$@" -- "$patch_file"
