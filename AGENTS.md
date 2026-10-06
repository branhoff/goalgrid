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
   branches 85, Python sensor 90, pkjs `wire.js`/`calendar.js`/`service.js`/`config.js` and the
   config page's `web/onboard.js`/`web/goals.js` 90/85. `main.c`, `matrix_layer.c`,
   `pkjs/index.js`, and the page's `web/page.js` glue are wiring that needs a runtime (Pebble or a
   DOM); they are excluded and covered instead by the strict build and emulator/page review. Keep
   them thin.
4. **Mutation testing grades the tests.** `make mutation` mutates `goalgrid.c` and must
   kill at least `MUTATION_MIN`% of a seeded sample. A surviving mutant is a missing
   assertion unless provably equivalent; say so, don't chase it.
5. **Structural checks catch what linters miss.** `habit-hooks` runs two plugins
   (`.habit-hooks/config.toml`). The project's C plugin (`tools/habit-hooks-c/`,
   sensor `c-structure`) flags functions over 40 lines, over 4 parameters, and nesting
   over 3; it is pinned to C (`[sensors.c-structure] files`) because its function/
   parameter rules misread JS module wrappers. The language-agnostic `generic` sensors
   — `line-count` (files over 200 lines) and `jscpd` (duplicated code) — apply to **all**
   the code: C, the pkjs, `web/`, the JS tests, and the Python tools. So the 200-line
   cap and the no-duplication rule hold everywhere, including a module split made only to
   satisfy them (a second `.js` file must reuse shared helpers, not copy them, or jscpd
   fails). Deep JS/Python structure (function length, nesting) would need a language
   plugin; `habit-hooks-python` is the recommended one for the tools.
6. **Self-documenting over commented.** Keep a comment only for a non-obvious *why*.
7. **Keep the dependency surface tiny.** No new dependency without a reason recorded
   in `TOOLING.md`. Python scripts declare theirs inline (PEP 723). The pkjs has none.
8. **Fail loud, degrade gracefully.** Bad payloads are rejected and logged, never
   partially applied (`goalgrid_load`); an empty or missing grid draws as empty.
9. **A human reviews, or an agent reviews as if human** before a substantial change is
   declared done. Run `make review` for the local, on-demand reviewer pass (an LLM reads the
   uncommitted diff for correctness/security/design); it is deliberately not in CI or the
   commit hook. A reviewer's report carries no authority to skip these rules.

## Pebble-specific rules

- Watchfaces **cannot receive UP/DOWN/SELECT** (the OS owns them). The one gesture a
  watchface gets is the accelerometer tap/shake (`accel_tap_service`) — the same flick
  that lights the backlight — and it is wired to **refresh the grid** (`prv_tap_handler`
  in `main.c`, debounced). A refresh re-runs the existing request→fetch→push path, so a
  flick/double-tap pulls fresh data on demand; a periodic poll is the backstop. Any future
  goal-view stepping must share or re-use this gesture, not assume it is free. Dev-only
  fixture selection never lives on the watch (use `tools/push_fixture.js`).
- `src/pkjs/` must stay **ES5** (PebbleKit JS); a test enforces it.
- The watchface's config/onboarding page is a static page in `web/`, deployed to GitHub Pages
  by `.github/workflows/pages.yml`; the watch opens it via `CONFIG_URL` in `src/pkjs/config.js`.
  It must be hosted (not a `data:` URL) because its `POST /signup` `fetch` needs a real,
  CORS-allowlistable origin. Keep the split: pure, node-tested logic in `web/onboard.js`
  (token/signup) and `web/goals.js` (goal CRUD), both coverage-gated; thin DOM/fetch glue in
  `web/page.js`, loaded by `web/index.html` (both review-only). `goals.js` reuses `onboard.js`'s
  `baseOf`/`failureMessage` rather than copying them (jscpd forbids the duplication). The page
  has **no dependencies**. CORS allowlisting of the page origin is a ring-capture-side dependency.
- After editing `messageKeys` in `package.json`, run `pebble clean`.
- `src/c` is not on the Pebble include path; use relative includes between subdirs.
- Keep `GOALGRID_CAPACITY`, `GOALGRID_MAX_GOALS`, `GOALGRID_NAME_LEN` in `goalgrid.h` and
  their copies at the top of `pkjs/wire.js` in sync.
- The data contract is ring-capture's `GET /grid` schema 2 (raw UTC events, half-open
  `[from, to)` ms window); `tests/contract/` holds a golden response and
  `tools/gen_fixtures.py` generates fixtures in that shape (`fixtures_current` fails if
  they drift). The watch defines "today"; the client buckets events into local days
  (`pkjs/calendar.js`). Never do calendar logic on the service side, and test any
  calendar change under real timezones including DST.

## Reviewing the running UI (agents)

The agent sandbox cannot start an emulator but can drive one the user already started
(`pebble install|screenshot --emulator emery` and `tools/push_fixture.js`). Judge layout with
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
