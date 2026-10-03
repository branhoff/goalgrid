#!/usr/bin/env python3
"""Generate deterministic goal-history fixtures into src/pkjs/fixtures/.

Schema (version 1), the contract the future service should emit:
{
  "version": 1,
  "name": "mixed",
  "goals": [{"id": "read", "name": "Read 20 min"}, ...],
  "days": [{"date": "YYYY-MM-DD", "completed": ["read", ...]}, ...]
}
Days with nothing completed may be omitted. The newest day in the file is
treated as "today" by the phone script, so fixtures never go stale.

END is a Friday, so with Sunday-first weeks the calendar shows: previous week
(13 days back to Sunday), this week Sun..Fri, and Saturday + next week empty.
Each scenario lists completed-goal COUNTS for the last 13 days, oldest first:
  [prev Sun..Sat (7)] + [this Sun..Fri (6)]  -> last entry is today.
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
    {"id": "read", "name": "Read 20 min"},
    {"id": "move", "name": "Move 30 min"},
    {"id": "write", "name": "Write"},
    {"id": "sleep", "name": "In bed by 11"},
]
IDS = [g["id"] for g in GOALS]

SCENARIOS = {
    # Every level 0-4 appears, several empty days, today partly done.
    "mixed": [4, 2, 0, 3, 1, 4, 0, 2, 0, 3, 4, 1, 2],
    # Busy weekdays, nothing on weekends.
    "weekdays_only": [0, 4, 4, 3, 4, 4, 0, 0, 4, 3, 4, 4, 4],
    # Perfect week, then it falls apart; today still untouched.
    "streak_broken": [4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0, 0, 0],
    # Slow start, improving; today complete.
    "ramp_up": [0, 0, 1, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
    # Mostly nothing, the odd effort.
    "sparse": [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2, 0],
    "perfect": [4] * 13,
    "empty": [0] * 13,
}


def completed_for(rng, count):
    return sorted(rng.sample(IDS, count))


def build(name, counts):
    rng = random.Random(name)
    days = []
    for back in range(HISTORY_DAYS - 1, -1, -1):
        date = END - datetime.timedelta(days=back)
        idx = len(counts) - 1 - back
        count = counts[idx] if idx >= 0 else rng.choice([0, 1, 2, 3, 4])
        if count:
            days.append({"date": date.isoformat(), "completed": completed_for(rng, count)})
    # Always include the newest day so "today" is defined even for empty data.
    if not days or days[-1]["date"] != END.isoformat():
        days.append({"date": END.isoformat(), "completed": []})
    return {"version": 1, "name": name, "goals": GOALS, "days": days}


def render(name, counts):
    return json.dumps(build(name, counts), indent=1) + "\n"


def main(argv):
    """Write fixtures, or with --check verify the committed ones are current."""
    assert all(len(counts) == 13 for counts in SCENARIOS.values())
    if "--check" in argv:
        stale = [
            n
            for n, c in SCENARIOS.items()
            if not (OUT / f"{n}.json").exists() or (OUT / f"{n}.json").read_text() != render(n, c)
        ]
        stale += [p.stem for p in OUT.glob("*.json") if p.stem not in SCENARIOS]
        if stale:
            sys.exit(f"stale fixtures (run tools/gen_fixtures.py): {', '.join(sorted(stale))}")
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    for name, counts in SCENARIOS.items():
        (OUT / f"{name}.json").write_text(render(name, counts))
    print("wrote", len(SCENARIOS), "fixtures to", OUT)


if __name__ == "__main__":
    main(sys.argv[1:])
