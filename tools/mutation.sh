#!/bin/sh
# Mutation-test the C model: inject small bugs with universalmutator and check
# the unit tests notice. Runs on a scratch copy so the source tree is never
# modified. Fails below MUTATION_MIN (percent of compilable mutants killed).
set -eu

SOURCE=src/c/model/goalgrid.c
MUTATION_MIN="${MUTATION_MIN:-85}"  # real score ~95%; headroom for sample variance
MUTANTS="${MUTANTS:-300}"  # seeded sample; all ~1100 take ~25 min under amd64 emulation
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# cp, not tar: tar's chmod syscalls are unimplemented under amd64 emulation.
for entry in "$ROOT"/* "$ROOT"/.[!.]*; do
	case "$(basename "$entry")" in
	build | out | .git | shots) continue ;;
	esac
	cp -R "$entry" "$WORK"/
done
cd "$WORK"

# Sanitizers turn out-of-bounds mutants into failures instead of silent garbage.
cmake -S . -B out -G Ninja -DGOALGRID_SANITIZE=ON >/dev/null
cmake --build out >/dev/null
mutate "$SOURCE" --mutantDir mutants >/dev/null

analyze_mutants "$SOURCE" "ctest --test-dir out -R goalgrid" \
	--mutantDir mutants --compileCommand "cmake --build out" --timeout 60 \
	--seed 1 --numMutants "$MUTANTS" \
	>analysis.log 2>&1 || true

[ -f killed.txt ] && [ -f notkilled.txt ] || { echo "mutation analysis failed:"; tail -20 analysis.log; exit 2; }
killed=$(wc -l <killed.txt | tr -d ' ')
alive=$(wc -l <notkilled.txt | tr -d ' ')
total=$((killed + alive))
[ "$total" -gt 0 ] || { echo "no mutants were analyzed"; cat analysis.log; exit 2; }
score=$((killed * 100 / total))
echo "mutation score: $score% ($killed killed, $alive surviving, $total compilable)"
if [ "$alive" -gt 0 ]; then
	echo "surviving mutants (each is a missing assertion unless provably equivalent):"
	while read -r mutant _; do
		diff "$SOURCE" "mutants/$mutant" | grep '^[<>]' | head -2 | sed "s|^|$mutant  |"
	done <notkilled.txt | head -40
fi
[ "$score" -ge "$MUTATION_MIN" ] || { echo "below MUTATION_MIN=$MUTATION_MIN"; exit 1; }
