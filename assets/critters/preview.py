#!/usr/bin/env python3
"""Heily reference: gentle critter loops at ~0.5 scale (see game/critters.js wander paths)."""
# pylint: skip-file
from __future__ import annotations

import math
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    raise SystemExit("pip install pillow")

ROOT = Path(__file__).resolve().parents[2]
STRIPS = ROOT / "assets" / "critters"
OUT = ROOT / "assets" / "critters" / "_preview.png"
W, H = 1280, 720
SCALE = 0.5


def pos(entry: dict, t: float) -> tuple[float, float]:
    ax, ay = entry["anchor"]
    amp_x = entry.get("ampX", 80)
    amp_y = entry.get("ampY", 22)
    sp = entry.get("pathSpeed", 0.22)
    ts = entry.get("timeScale", 1)
    ph = entry.get("phase", 0)
    tt = t * ts + ph
    x = ax + math.sin(tt * sp) * amp_x + math.sin(tt * sp * 0.37 + ph * 1.7) * (amp_x * 0.22)
    y = ay + math.cos(tt * sp * 0.83 + 1.2) * amp_y + math.sin(tt * 0.91 + ph * 2.3) * 5
    return x, y


ROSTER = [
    {"id": "monarch", "anchor": (420, 280), "phase": 0.2, "color": (220, 120, 40)},
    {"id": "white", "anchor": (820, 320), "phase": 2.1, "color": (240, 240, 230)},
    {"id": "bee", "anchor": (640, 240), "phase": 4.7, "color": (240, 200, 60)},
]


def main() -> None:
    img = Image.new("RGBA", (W, H), (40, 80, 40, 255))
    draw = ImageDraw.Draw(img)
    t = 12.0
    for e in ROSTER:
        x, y = pos(e, t)
        r = 8 * SCALE * 40
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(*e["color"], 200))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print("wrote", OUT)


if __name__ == "__main__":
    main()