#!/usr/bin/env python3
"""Generate deterministic fixtures in ring-capture's GET /grid shape (schema 2).

Shape, owned by the ring-capture service (raw UTC events; the client owns the calendar):
{
  "schema": 2, "from": <epoch ms>, "to": <epoch ms>,            # half-open [from, to)
  "goals": [{"id": 1, "number": 1, "name": "running", "type": "binary"}, ...],
  "series": {"1": [{"at": <epoch ms>, "value": 1}, ...]}        # raw events, time-sorted
}
A binary goal is done on a local day if any event falls in it; a count goal sums its
events. Fixture events sit at 12:00 UTC so they land on the same calendar date in every
timezone from UTC-12 to UTC+11. Demo mode rebases them by whole days so the last day
is "today".

Each scenario lists how many of the five goals were done on each of the last 13 days,
oldest first; the last entry is "today". The counts were written for a Friday (previous
week Sun..Sat, then this week Sun..Fri), and demo mode rebases the dates, so on other
weekdays the same pattern lands shifted within the calendar grid.
"""

import datetime
import json
import pathlib
import random
import sys

OUT = pathlib.Path(__file__).resolve().parent.parent / "src" / "pkjs" / "fixtures"
END = datetime.date(2026, 10, 2)
HISTORY_DAYS = 28
GOALS = [
    {"id": 1, "number": 1, "name": "running", "type": "binary"},
    {"id": 2, "number": 2, "name": "reading", "type": "binary"},
    {"id": 3, "number": 3, "name": "writing", "type": "binary"},
    {"id": 4, "number": 4, "name": "bed by 11", "type": "binary"},
    {"id": 5, "number": 5, "name": "pushups", "type": "count"},
]

SCENARIOS = {
    "mixed": [5, 2, 0, 3, 1, 5, 0, 2, 0, 3, 5, 1, 2],
    "weekdays_only": [0, 5, 5, 3, 5, 5, 0, 0, 5, 3, 5, 5, 5],
    "streak_broken": [5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0],
    "ramp_up": [0, 0, 1, 0, 1, 1, 2, 2, 3, 3, 5, 5, 5],
    "sparse": [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2, 0],
    "perfect": [5] * 13,
    "empty": [0] * 13,
}


NOON_MS = 12 * 3_600_000
DAY_MS = 86_400_000


def day_ms(day):
    return (day - datetime.date(1970, 1, 1)).days * DAY_MS


def events_for(goal, day, rng):
    """One event for a binary goal; two that add up to a total for a count goal."""
    at = day_ms(day) + NOON_MS
    if goal["type"] == "binary":
        return [{"at": at, "value": 1}]
    total = rng.randint(6, 40)
    first = rng.randint(1, total - 1)
    return [{"at": at, "value": first}, {"at": at + 60_000, "value": total - first}]


def build(name, counts):
    rng = random.Random(name)
    series = {str(goal["id"]): [] for goal in GOALS}
    for back in range(HISTORY_DAYS - 1, -1, -1):
        index = len(counts) - 1 - back
        count = counts[index] if index >= 0 else rng.randint(0, len(GOALS))
        day = END - datetime.timedelta(days=back)
        for goal in sorted(rng.sample(GOALS, count), key=lambda g: g["id"]):
            series[str(goal["id"])].extend(events_for(goal, day, rng))
    first_day = END - datetime.timedelta(days=HISTORY_DAYS - 1)
    return {
        "schema": 2,
        "from": day_ms(first_day),
        "to": day_ms(END) + DAY_MS,
        "goals": GOALS,
        "series": series,
    }


def render(name, counts):
    return json.dumps(build(name, counts), indent=1) + "\n"


def stale_fixtures():
    missing = [n for n, c in SCENARIOS.items() if not (OUT / f"{n}.json").exists()]
    changed = [
        n
        for n, c in SCENARIOS.items()
        if n not in missing and (OUT / f"{n}.json").read_text() != render(n, c)
    ]
    extra = [p.stem for p in OUT.glob("*.json") if p.stem not in SCENARIOS]
    return sorted(missing + changed + extra)


def main(argv):
    """Write fixtures, or with --check verify the committed ones are current."""
    assert all(len(counts) == 13 for counts in SCENARIOS.values())
    if "--check" in argv:
        if stale := stale_fixtures():
            sys.exit(f"stale fixtures (run tools/gen_fixtures.py): {', '.join(stale)}")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    for name, counts in SCENARIOS.items():
        (OUT / f"{name}.json").write_text(render(name, counts))
    print("wrote", len(SCENARIOS), "fixtures to", OUT)


if __name__ == "__main__":
    main(sys.argv[1:])
