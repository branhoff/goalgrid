# Goal Grid

A Pebble watchface that shows the time and a GitHub-style 3-week calendar of goal
completion: previous week, current week, and next week, with each past day shaded by
how many of its goals were met. Targets every Pebble platform including the Pebble
Time 2 (`emery`).

> Status: UI-first phase. The calendar is fed by fixture data; a separate service will
> later emit the same schema-v1 data.

## Quick start

Prerequisite: a container runtime (`docker`, `podman`, or Apple's `container`).

```bash
make setup      # build the dev image, enable git hooks
make verify     # the full quality gate (must be green before any change is "done")
make help       # all verbs
```

Every verb runs inside the standard Linux dev container (`Dockerfile`), so results match
CI. Rules for contributors, human or AI, are in [`AGENTS.md`](AGENTS.md).

### Running it on the emulator (on the host Mac)

The interactive emulator runs natively, which is faster than VNC inside the container.
Install the tool once (`uv tool install pebble-tool --python 3.13`, then
`pebble sdk install latest`), then:

```bash
pebble build
pebble install --emulator emery        # then pick "Goal Grid" from the watch's watchface menu
pebble emu-tap --emulator emery --direction z+   # cycle fixture scenarios
```

Watchfaces cannot read buttons, so a wrist tap cycles the fixtures.

## How it works

```
tools/gen_fixtures.py ──► src/pkjs/fixtures/*.json        (schema v1 test scenarios)
                               │
src/pkjs/index.js  ── reads a fixture, sends it over AppMessage on startup / tap
src/pkjs/grid_data.js  pure conversion: schema v1 ─► [completed,total] byte pairs
                               │  Bluetooth
src/c/main.c       ── receives it, loads the model, draws time + date + calendar
src/c/model/       ── pure C: calendar math, intensity levels, wire decoding (host-tested)
src/c/ui/          ── MatrixLayer: draws the 3-week grid
```

### Data contract (schema v1)

```json
{
  "version": 1,
  "goals": [{"id": "read", "name": "Read 20 min"}],
  "days": [{"date": "2026-10-02", "completed": ["read"]}]
}
```

The newest day is treated as "today", so fixtures never go stale. Days with nothing
completed may be omitted. Unknown or duplicate goal ids are ignored.

## Design decisions

- **Pure model, thin firmware.** The watch UI can't run on a host, so all logic worth
  testing lives in `src/c/model/` with no Pebble dependency.
- **Reject bad input, never half-apply it.** `goalgrid_load` returns an error on a
  malformed payload and leaves the grid untouched; a missing grid draws as empty.
- **Idempotent sync.** The phone always sends the whole grid, so a retry is harmless.
- **Future days are outlined, not filled**, so they are never mistaken for "nothing done".

## Known limitations

- The container runs linux/amd64 (emulated on Apple Silicon) because Pebble's tooling
  has no Linux arm64 build.
- Emulator UI review is manual (or agent-assisted via `tools/measure.py`); it is not
  part of the automated gate.
- Only `emery` has been visually checked; round (`chalk`) and small screens
  (`aplite`, `diorite`) have not.
