#!/bin/sh
# PostToolUse hook: run habit-hooks on the file Claude just edited and feed
# findings back. Exit 2 = enforced findings (shown to the agent to fix now);
# anything else is informational. See AGENTS.md, "Automated enforcement".
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
file=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))')

case "$file" in
	*.c|*.h|*.py|*.js) ;;
	*) exit 0 ;;
esac

out=$("$ROOT/scripts/habit.sh" --file "$file" 2>&1)
status=$?
[ "$status" -eq 0 ] && exit 0
printf '%s\n' "$out" >&2
[ "$status" -eq 1 ] && exit 2
exit 1
