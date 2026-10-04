#!/usr/bin/env python3
"""Point the emulator's watchface at a named config profile.

Writes the chosen profile (baseUrl + token) straight into the emulator's PebbleKit JS
localStorage, so a reinstall makes the watch fetch from that service -- no clicking through
the hand-written config page. Profiles live in config/profiles.json (gitignored); copy
config/profiles.example.json to create it.

    python3 tools/set_config.py <profile> [--emulator emery] [--show]
"""

import argparse
import dbm.dumb
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROFILES = os.path.join(ROOT, "config", "profiles.json")
SDK_ROOT = os.path.expanduser("~/Library/Application Support/Pebble SDK")
STORAGE_KEY = "goalgridConfig"  # must match STORAGE_KEY in src/pkjs/config.js


def app_uuid():
    with open(os.path.join(ROOT, "package.json")) as f:
        return json.load(f)["pebble"]["uuid"]


def sdk_version_key(dir_path):
    # dir_path = <SDK_ROOT>/<version>/<emulator>/localstorage/<uuid>.dir. Sort by the numeric
    # version, not lexically, so 4.33.1 ranks above 4.9.0.
    version = dir_path.split(os.sep)[-4]
    try:
        return tuple(int(part) for part in version.split("."))
    except ValueError:
        return (0,)


def localstorage_stem(emulator):
    # One localStorage dbm per app, under the SDK version dir; take the newest if several.
    pattern = os.path.join(SDK_ROOT, "*", emulator, "localstorage", app_uuid() + ".dir")
    hits = sorted(glob.glob(pattern), key=sdk_version_key)
    if not hits:
        sys.exit(f"no {emulator} localStorage yet: run `pebble install --emulator {emulator}` once")
    return hits[-1][:-4]  # strip ".dir" -> dbm stem


def load_profile(name):
    if not os.path.exists(PROFILES):
        sys.exit("missing config/profiles.json: copy config/profiles.example.json and fill it in")
    with open(PROFILES) as f:
        profiles = json.load(f)
    if name not in profiles:
        sys.exit(f"unknown profile {name!r}; have: {', '.join(sorted(profiles))}")
    return profiles[name]


def write_config(stem, profile):
    value = json.dumps({"baseUrl": profile["baseUrl"], "token": profile["token"]})
    with dbm.dumb.open(stem, "c") as db:  # "c" preserves other keys (e.g. fixtureIndex)
        db[STORAGE_KEY] = value
    with dbm.dumb.open(stem, "r") as db:
        return db[STORAGE_KEY].decode() == value  # read back to confirm it stuck


def main(argv):
    ap = argparse.ArgumentParser(description="Point the emulator at a named config profile.")
    ap.add_argument("profile", help="a key in config/profiles.json (e.g. local, prod)")
    ap.add_argument("--emulator", default="emery")
    ap.add_argument("--show", action="store_true", help="print the token too (default hides it)")
    args = ap.parse_args(argv)

    profile = load_profile(args.profile)
    stem = localstorage_stem(args.emulator)
    ok = write_config(stem, profile)
    where = json.dumps(profile) if args.show else profile["baseUrl"]
    print(f"profile {args.profile!r} -> {where} ({'confirmed' if ok else 'NOT confirmed'})")
    print("reinstall to apply: pebble install --emulator " + args.emulator)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
