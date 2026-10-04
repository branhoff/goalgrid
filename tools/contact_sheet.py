#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Push every fixture into a RUNNING emulator and save a contact sheet.

Usage: tools/contact_sheet.py [platform]      (default: emery)
Needs the watchface installed and the emulator already running (starting an
emulator needs network access the agent sandbox blocks). Each fixture is sent as the
same AppMessage the phone would send (tools/push_fixture.js), then screenshotted.
Writes shots/contact.png (2x nearest-neighbour) and shots/f<N>.png.
"""

import pathlib
import subprocess
import sys
import time

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIXTURES = sorted(p.stem for p in (ROOT / "src" / "pkjs" / "fixtures").glob("*.json"))
platform = sys.argv[1] if len(sys.argv) > 1 else "emery"
out = ROOT / "shots"
out.mkdir(exist_ok=True)


def run(*command):
    """Run quietly, but fail loudly: a silent failure once gave seven identical screenshots."""
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        sys.exit(f"failed: {' '.join(command)}\n{result.stdout}{result.stderr}")


files = []
for index, name in enumerate(FIXTURES):
    run("node", str(ROOT / "tools" / "push_fixture.js"), name, "--emulator", platform)
    time.sleep(2)
    shot = out / f"f{index}.png"
    run("pebble", "screenshot", "--no-open", "--emulator", platform, str(shot))
    files.append(shot)

count = len(files)
ims = [Image.open(f).convert("RGB") for f in files]
w, h = ims[0].size
cols = 4
rows = (count + cols - 1) // cols
sheet = Image.new("RGB", (cols * (w + 10) - 10, rows * (h + 10) - 10), (60, 60, 60))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * (w + 10), (i // cols) * (h + 10)))
sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(out / "contact.png")
print("wrote", out / "contact.png")
