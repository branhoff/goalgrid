#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Cycle every fixture on a RUNNING emulator and save a contact sheet.

Usage: tools/contact_sheet.py [platform] [count]      (default: emery 7)
Needs the watchface installed and the emulator already running (starting an
emulator needs network access the agent sandbox blocks). Fixtures advance with
a simulated wrist tap, since watchfaces can't receive button presses.
Writes shots/contact.png (2x nearest-neighbour) and shots/f<N>.png.
"""

import pathlib
import subprocess
import sys
import time

from PIL import Image

platform = sys.argv[1] if len(sys.argv) > 1 else "emery"
count = int(sys.argv[2]) if len(sys.argv) > 2 else 7
out = pathlib.Path(__file__).resolve().parent.parent / "shots"
out.mkdir(exist_ok=True)


def pebble(*args):
    subprocess.run(
        ["pebble", *args, "--emulator", platform],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


files = []
for i in range(count):
    f = out / f"f{i}.png"
    pebble("screenshot", "--no-open", str(f))
    files.append(f)
    pebble("emu-tap", "--direction", "z+")
    time.sleep(3)

ims = [Image.open(f).convert("RGB") for f in files]
w, h = ims[0].size
cols = 4
rows = (count + cols - 1) // cols
sheet = Image.new("RGB", (cols * (w + 10) - 10, rows * (h + 10) - 10), (60, 60, 60))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * (w + 10), (i // cols) * (h + 10)))
sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(out / "contact.png")
print("wrote", out / "contact.png")
