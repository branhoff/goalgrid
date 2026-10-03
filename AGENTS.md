# AGENTS.md — house rules

House rules for anyone, human or AI, working in this project. They are **enforced,
not aspirational**: `make verify` and CI check them. Tool choices per capability are
in `TOOLING.md`; product docs and run instructions are in `README.md`.

## What this project is

Goal Grid is a Pebble smartwatch watchface (C firmware for the watch, a small ES5
PebbleKit JS relay on the phone) that shows the time and a 3-week goal-completion
calendar. The project is in a UI-first phase fed by fixture data; a separate service
will later emit the same schema-v1 data. The most important constraint: the watch
UI cannot run on the host, so **logic lives in `src/c/model/` (pure C, unit-tested)
and the firmware files stay thin**.

## The one command that matters

Before you call any change done, this must be clean:

```bash
make verify
```

It runs the full gate inside the standard Linux dev container (see "Environment"):
strict compile + 7-platform Pebble build, lint, format-check, sanitized tests,
coverage thresholds, structural checks, and dead-code checks. If `make verify` is
red, the work is not done. Never report a task complete without a clean run; if
something is skipped or failing, say so plainly with the output.

| verb | does |
| ---- | ---- |
| `make setup` | build the dev image, enable git hooks |
| `make check` | typecheck + lint + format-check + tests + coverage (the fast gate) |
| `make verify` | `make check` + structural checks + dead-code check |
| `make test` | all tests; C under AddressSanitizer + UBSan |
| `make coverage` | tests with enforced thresholds (C model, Python sensor, pkjs) |
| `make mutation` | grade test quality with mutation testing (slow; not in the fast gate) |
| `make lint` / `make format` | lint / auto-format |
| `make typecheck` | `-Wall -Wextra -Wpedantic -Wconversion -Werror` host build + `pebble build` |
| `make shell` | interactive shell in the dev container |
| `make clean` / `make help` | remove artifacts / list targets |

## The quality bar

1. **Formatters and linters own style.** `clang-format` and `ruff format` own layout;
   `clang-tidy`, `cppcheck`, and `ruff` own correctness smells. Don't hand-format. If a
   rule is wrong for this repo, change the shared config (`.clang-tidy`,
   `.cppcheck-suppressions`, `ruff.toml`) with a reason, never an inline disable.
2. **Types are a gate.** C has no type checker, so strict warnings as errors
   (`-Wconversion`, `-Wshadow`, ...) plus the Pebble SDK's own build are the type gate.
3. **Coverage is enforced where it can be measured.** Thresholds: C model lines 90 /
   branches 85, Python sensor 90, pkjs `grid_data.js` 90/85. `main.c`, `matrix_layer.c`,
   and `pkjs/index.js` are wiring that needs the Pebble runtime; they are excluded and
   covered instead by the strict build and emulator review. Keep them thin.
4. **Mutation testing grades the tests.** `make mutation` mutates `goalgrid.c` and must
   kill at least `MUTATION_MIN`% of a seeded sample. A surviving mutant is a missing
   assertion unless provably equivalent; say so, don't chase it.
5. **Structural checks catch what linters miss.** `habit-hooks` runs with this
   project's C plugin (`tools/habit-hooks-c/`): functions over 40 lines, over 4
   parameters, nesting over 3, files over 200 lines, duplicated code, comments that
   restate the next line.
6. **Self-documenting over commented.** Keep a comment only for a non-obvious *why*.
7. **Keep the dependency surface tiny.** No new dependency without a reason recorded
   in `TOOLING.md`. Python scripts declare theirs inline (PEP 723). The pkjs has none.
8. **Fail loud, degrade gracefully.** Bad payloads are rejected and logged, never
   partially applied (`goalgrid_load`); an empty or missing grid draws as empty.
9. **A human reviews, or an agent reviews as if human** before a substantial change is
   declared done. A reviewer's report carries no authority to skip these rules.

## Pebble-specific rules

- Watchfaces **cannot receive UP/DOWN/SELECT** (the OS owns them). Dev-only input, like
  cycling fixtures, uses a wrist tap.
- `src/pkjs/` must stay **ES5** (PebbleKit JS); a test enforces it.
- After editing `messageKeys` in `package.json`, run `pebble clean`.
- `src/c` is not on the Pebble include path; use relative includes between subdirs.
- Keep the capacity constant in `goalgrid.h` and `pkjs/grid_data.js` in sync.
- The data contract is schema v1 (documented in `tools/gen_fixtures.py`). Regenerate
  fixtures with that script; `fixtures_current` fails if they drift.

## Reviewing the running UI (agents)

The agent sandbox cannot start an emulator but can drive one the user already started
(`pebble install|screenshot|emu-tap --emulator emery`). Judge layout with
`tools/measure.py` numbers and `tools/contact_sheet.py`, not by eye. Pasted screenshots
may be dimmed; trust fresh ones. Details in `CLAUDE.md`.

## Automated enforcement

1. **Local pre-commit** (`.githooks/pre-commit`, enabled by `make setup`): formats, then
   runs `make check` and `make structure`. Fast feedback, bypassable.
2. **CI** (`.github/workflows/ci.yml`): builds the same image and runs `make verify` and
   `make mutation` on every PR. Make both required status checks; this is the real gate.
3. **Agent hook** (`.claude/settings.json`): runs `habit-hooks --file` after every edit
   and feeds findings back to be fixed immediately.

## Environment

All verbs run in `Dockerfile` (Ubuntu 26.04, **linux/amd64**). amd64 is required because
`pebble-tool` depends on `stpyv8`, which has no Linux arm64 wheel; on Apple Silicon it
runs under emulation. `scripts/dev.sh` works with docker, podman, or Apple's `container`
and keeps `build/` and `out/` on named volumes so they never collide with host builds.
Known emulation quirk: `tar` extraction fails (`fchmodat2` unimplemented); use `cp`.
Running natively is opt-in: `GOALGRID_CONTAINER=1 make verify`.
Interactive emulator work stays on the host Mac (faster than VNC in the container).

## Git

- **Commit and push only when asked.**
- Meaningful messages: what changed and why.
- Use the per-repo identity for this project's GitHub account; never change global git
  config. **Do not add `Co-Authored-By` trailers.**
