#!/usr/bin/env sh
set -eu
bundle_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec python3 "$bundle_dir/patches/apply-bundle.py" "$@"
