#!/bin/sh
set -eu
delivery=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$delivery/tools/apply.mjs" "$@"
