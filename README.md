# Goal Grid

A Pebble watchface that shows the time and a GitHub-style 3-week calendar of goal
completion: previous week, current week, and next week, with each past day shaded by
how many of its goals were met. Targets every Pebble platform including the Pebble
Time 2 (`emery`).

> Status: the watch fetches real data from a ring-capture service (or shows demo data when
> none is configured). Live end-to-end against a running service is still to be verified.

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
pebble install --emulator emery          # then pick "Goal Grid" from the watchface menu
```

With no service configured it shows demo data. To review every fixture scenario:

```bash
node tools/push_fixture.js perfect --emulator emery     # one scenario
uv run tools/contact_sheet.py emery                     # all scenarios -> shots/contact.png
```

These send the same AppMessage the phone would, so the watch's real handler runs.

### Pointing it at your ring-capture service

The watch's service URL and bearer token live in the phone's `localStorage` (never in the
repo or on the watch). For a given deployment you can enter them by hand in the Pebble
app's settings (or `pebble emu-app-config --emulator emery`) — but that page is a
hand-written `data:` URL whose acceptance is **unverified**, and clicking through it to
switch environments is slow.

For development, keep named **profiles** in `config/profiles.json` (gitignored — copy
`config/profiles.example.json` and fill in your URLs and tokens) and swap between them in
one command:

```bash
make config PROFILE=prod     # write the "prod" profile, then reinstall so the watch refetches
make config-local            # shorthand for PROFILE=local
make config-prod             # shorthand for PROFILE=prod
```

`make config` writes the chosen profile straight into the emulator's `localStorage` with
`tools/set_config.py` (stdlib only), then reinstalls so PebbleKit JS restarts, fires
`READY`, and fetches from the newly-pointed service. It runs on the host (needs the host
emulator). Secrets stay out of git; only `profiles.example.json` is committed.

To check a deployed service end to end without changing the watch's config, `make live`
builds the same `GET /grid` request the phone would, fetches it with the token, and pushes
the result to a running emulator through the real wire pipeline (writes the response to
`shots/live_response.json`):

```bash
AUTH_TOKEN=... GOALGRID_URL=https://your-service.example make live   # [EMULATOR=emery]
```

It runs on the host (not in the dev container) because it needs the host network and the
running emulator.

## How it works

```
watch                                          phone (PebbleKit JS)              service
main.c  <-- READY ---------------------------- index.js (on start)               ring-capture
        -- REQUEST_GRID + its own local day --> service.js  GET /grid?from=&to= ->  /grid
        <-- GRID_EPOCH_DAY/TYPES/NAMES/VALUES -- wire.js buckets raw events   <--  raw UTC events
model/  goalgrid.c  pure C: per-goal series, calendar math, strict payload loading
ui/     matrix_layer.c  draws the 3-week calendar;  model/layout.c  screen geometry
```

- The **watch defines "today"**: it sends its local calendar day with every request. The
  phone turns the 21 local days ending then into a half-open UTC instant window
  `[from, to)` and asks the service for exactly that. It re-requests every 30 minutes.
- The **client owns the calendar**: the service stores raw UTC events and knows no
  timezone, so `wire.js` buckets each event into the phone's local day (`calendar.js`,
  DST-aware). A `count` goal sums its events in a day; a `binary` goal is done if any
  event falls in it.
- With **no service configured**, the phone sends rebased demo data (`fixtures/mixed`).
  If the service is unreachable the watch keeps showing its last saved grid.

### Data contract

The authority is ring-capture's `GET /grid` (schema 2, currently uncommitted in that
repo). Fixtures are generated in that shape by `tools/gen_fixtures.py`, and
`tests/contract/grid-response.json` mirrors the service's own test (same values).

```json
{"schema": 2, "from": 1717200000000, "to": 1719792000000,
 "goals": [{"id": 1, "number": 1, "name": "running", "type": "binary"}],
 "series": {"1": [{"at": 1717243800000, "value": 1}]}}
```

`from`/`to` are epoch milliseconds, inclusive/exclusive. Events are raw, append-only and
time-sorted; two events may share an instant. The watch keeps at most 5 goals, ordered
by `number`, with names cut to 15 characters. Count totals are clamped to 0-255.

## Design decisions

- **Pure model, thin firmware.** The watch UI can't run on a host, so all logic worth
  testing lives in `src/c/model/` with no Pebble dependency.
- **Reject bad input, never half-apply it.** `goalgrid_load` returns an error on a
  malformed payload and leaves the grid untouched; a missing grid draws as empty.
- **Idempotent sync.** The phone always sends the whole grid, so a retry is harmless.
- **Total view first.** Each day currently shades by how many goals had any progress;
  the per-goal views are the next step and the stored per-goal series already supports them.
- **Future days are outlined, not filled**, so they are never mistaken for "nothing done".

## Known limitations

- The container runs linux/amd64 (emulated on Apple Silicon) because Pebble's tooling
  has no Linux arm64 build.
- Emulator UI review is manual (or agent-assisted via `tools/measure.py`); it is not
  part of the automated gate.
- Visually checked on `emery`, `chalk` (round), `aplite`, and `diorite`. Not yet seen:
  `basalt`, `flint`, `gabbro`.
- One-bit screens (`aplite`, `diorite`) show four states, not five shades: outline
  (nothing done), double outline (some done), solid (all done), plain number (future).
