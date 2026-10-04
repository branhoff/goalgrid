#!/bin/sh
# Local, on-demand reviewer pass (AGENTS.md rule #9): an LLM reads the uncommitted change
# set and reasons about correctness, security, and design -- the judgement that habit-hooks
# (structural smells only) and `make verify` (deterministic gates) can't provide. Kept out
# of CI (by choice) and out of the pre-commit hook on purpose: an LLM there is slow, costs
# tokens on every commit, and `--no-verify` defeats it. Run it yourself before you commit.
#
#   make review                  # review the working tree vs HEAD
#   make review REF=origin/main  # review vs another ref
set -eu

ref="${REF:-HEAD}"

if ! command -v claude >/dev/null 2>&1; then
	echo "review: the 'claude' CLI is not on PATH; install it or review by hand" >&2
	exit 1
fi

changes=$(git --no-pager diff "$ref"; git --no-pager diff --cached --diff-filter=ACM)
untracked=$(git ls-files --others --exclude-standard)  # --exclude-standard skips gitignored secrets

if [ -z "$changes" ] && [ -z "$untracked" ]; then
	echo "review: no uncommitted changes to review"
	exit 0
fi

{
	echo "You are a demanding code reviewer doing a pre-commit review of the Goal Grid Pebble"
	echo "watchface. Read AGENTS.md for the house rules and judge the change set against them."
	echo "Focus on correctness, security (secret leaks), robustness, and design -- NOT"
	echo "formatting/lint/coverage, which 'make verify' already enforces. Read the untracked"
	echo "files listed below (they are new and not in the diff). Return findings ranked by"
	echo "severity (blocker/major/minor/nit) with file:line and a concrete fix, then a one-line"
	echo "verdict: safe to commit, or blockers. Be concrete and adversarial."
	echo
	echo "=== untracked files to read (new; gitignored secrets excluded) ==="
	echo "$untracked"
	echo
	echo "=== diff vs $ref (working tree + staged) ==="
	echo "$changes"
} | claude -p
