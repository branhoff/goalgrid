#!/bin/sh
# Run habit-hooks with this project's C plugin attached, without touching any
# globally installed habit-hooks. Passes arguments through (default: --all).
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ "$#" -eq 0 ] && set -- --all
cd "$ROOT"
exec uvx --from habit-hooks --with-editable tools/habit-hooks-c habit-hooks "$@"
