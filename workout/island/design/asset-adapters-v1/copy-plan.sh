#!/bin/sh
# Default: inspect the pinned copy plan. Add --apply to copy audited payloads.
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$script_dir/tools/copy-assets.mjs" "$@"
