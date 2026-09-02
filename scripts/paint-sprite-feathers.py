#!/usr/bin/env python3
"""Paint colorful pixel-art feather tufts on the gloves and boots of a sprite
(Option B: targeted PIL decoration — the model can't draw feathers at this
scale, so we paint them pixel-exact with the project palette).

Detects the red glove/boot clusters automatically, anchors tufts on the
wrist/cuff edge, paints gold/white feathers with dark navy outlines + red
veins, and saves the 768 raw plus a 96px downscale for comparison.

Usage:
  python3 scripts/paint-sprite-feathers.py \
      --base bloodbowl_designs/sprites-gemini/definitivos/amazonas-python-warrior-v1.png \
      --out bloodbowl_designs/sprites-gemini/feathers-B-768.png
"""

import argparse
import os
from collections import Counter

from PIL import Image

# Project palette (rulebook light).
NAVY = (18, 34, 90)        # #12225a
RED = (209, 25, 56)        # #d11938
SKIN = (232, 185, 138)     # #e8b98a
GOLD = (201, 162, 39)      # #c9a227
WHITE = (248, 250, 252)    # #f8fafc
OUTLINE = (13, 22, 51)     # #0d1633
NAVY_HL = (31, 58, 140)    # #1f3a8c
STEEL = (154, 164, 200)    # #9aa4c8


def is_red(c):
    r, g, b = c[:3]
    return r > 140 and r > g + 60 and r > b + 60


def cluster_bboxes(px, w, h, y0, y1, min_size=800):
    """Return (left, right) bounding boxes of red pixels in the y-band."""
    pts = [(x, y) for y in range(y0, y1) for x in range(w) if is_red(px[x, y])]
    if not pts:
        return None
    cx = w // 2
    out = []
    for side in (0, 1):
        side_pts = [p for p in pts if (p[0] < cx) == (side == 0)]
        if len(side_pts) < min_size:
            continue
        xs = [p[0] for p in side_pts]
        ys = [p[1] for p in side_pts]
        out.append((min(xs), min(ys), max(xs), max(ys)))
    return out or None


def paint_feather(px, w, h, ax, ay, dx, dy, length, width, body, tip, vein):
    """Paint one blocky pixel-art feather growing from anchor (ax, ay).

    The feather is a pointed leaf: each row shrinks by a step every few rows
    (NES-style staircase edges), with a central vein and a tip color.
    Returns nothing (mutates px).
    """
    half = width // 2
    for t in range(length):
        y = ay - int(dy * t)
        x = ax + int(dx * t)
        if not (0 <= y < h and 0 <= x < w):
            break
        frac = t / max(1, length - 1)
        cur_half = max(1, int(half * (1 - frac)))
        # Body rows (2px tall each -> chunky).
        for yy in (y, y + 1):
            if not (0 <= yy < h):
                continue
            row_colors = []
            for xx in range(x - cur_half, x + cur_half + 1):
                if 0 <= xx < w:
                    row_colors.append((xx, yy))
            # Tip segment uses the tip color, else body; vein at center.
            is_tip = frac > 0.78
            c = tip if is_tip else body
            # NOTE: PIL PixelAccess is px[col, row] — first arg is X (column).
            for xx, yy2 in row_colors:
                px[xx, yy2] = c + (255,)
            # Vein: darker center line (2px).
            for vx in range(x - 1, x + 2):
                if 0 <= vx < w and x - cur_half <= vx <= x + cur_half:
                    px[vx, y] = vein + (255,)
            # Left outline (leading edge) when the row is wide enough.
            if cur_half >= 3:
                lx = x - cur_half
                if 0 <= lx < w:
                    px[lx, y] = OUTLINE + (255,)
            if cur_half >= 4:
                rx = x + cur_half
                if 0 <= rx < w:
                    px[rx, y] = OUTLINE + (255,)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="source sprite PNG (768 raw)")
    ap.add_argument("--out", required=True, help="output PNG (768 raw with feathers)")
    ap.add_argument("--small", default=None, help="optional 96px downscale output")
    args = ap.parse_args()

    img = Image.open(args.base).convert("RGBA")
    w, h = img.size
    px = img.load()

    # Detect the red clusters. Bands are TIGHT so the red chest/skirt trims do
    # NOT contaminate: gloves live ~48-63% height (wrist top ~y380), boots
    # ~66-87% (cuff top ~y510).
    gloves = cluster_bboxes(px, w, h, int(h * 0.48), int(h * 0.63))
    boots = cluster_bboxes(px, w, h, int(h * 0.66), int(h * 0.87))
    if not gloves:
        raise SystemExit("no glove clusters detected")
    if not boots:
        raise SystemExit("no boot clusters detected")
    print("gloves:", gloves)
    print("boots:", boots)

    # Feather sizes relative to the 768 canvas.
    length = int(h * 0.050)      # ~38px
    width = int(h * 0.020)       # ~15px

    for i, (x0, y0, x1, y1) in enumerate(gloves):
        outer = 1 if i == 1 else -1   # right glove -> tufts lean right
        # Two tufts per glove at the wrist (top edge).
        anchors = [
            (x1 if outer == 1 else x0, y0, outer),          # outer edge
            ((x0 + x1) // 2 - outer * 8, y0 + 6, outer),    # inner-ish, offset down
        ]
        for j, (ax, ay, d) in enumerate(anchors):
            body = GOLD if j % 2 == 0 else WHITE
            tip = WHITE if j % 2 == 0 else GOLD
            paint_feather(px, w, h, ax, ay, d * 0.55, 1.0, length, width, body, tip, RED)

    for i, (x0, y0, x1, y1) in enumerate(boots):
        outer = 1 if i == 1 else -1
        for j, off in enumerate((int(width * 0.6), int(width * 1.6))):
            ax = x0 + off if outer == -1 else x1 - off
            body = WHITE if j % 2 == 0 else GOLD
            tip = GOLD if j % 2 == 0 else WHITE
            paint_feather(px, w, h, ax, y0 - 4, outer * 0.3, 1.0,
                          int(length * 0.8), int(width * 0.8), body, tip, RED)

    img.save(args.out)
    print("saved:", args.out)

    if args.small:
        small = img.resize((96, 96), Image.NEAREST)
        small.save(args.small)
        print("saved:", args.small)


if __name__ == "__main__":
    main()
