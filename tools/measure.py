#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Report the bounding rows/columns of non-black content in a watch screenshot.

Usage: tools/measure.py screenshot.png
Prints each horizontal band of content with its left/right margins so layout
centering can be checked numerically instead of by eye.
"""

import sys

from PIL import Image

im = Image.open(sys.argv[1]).convert("RGB")
W, H = im.size
px = im.load()


def lit(x, y):
    return sum(px[x, y]) > 30


rows = [y for y in range(H) if any(lit(x, y) for x in range(W))]
print(f"screen {W}x{H}")
if not rows:
    sys.exit("blank screen")
bands, start, prev = [], rows[0], rows[0]
for y in rows[1:]:
    if y != prev + 1:
        bands.append((start, prev))
        start = y
    prev = y
bands.append((start, prev))
print(f"top margin {bands[0][0]}, bottom margin {H - 1 - bands[-1][1]}")
for a, b in bands:
    xs = [x for x in range(W) if any(lit(x, y) for y in range(a, b + 1))]
    print(f"rows {a:3}-{b:3} (h={b - a + 1:2})  left {xs[0]:3}  right {W - 1 - xs[-1]:3}")
