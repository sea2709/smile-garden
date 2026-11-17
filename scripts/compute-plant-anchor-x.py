#!/usr/bin/env python3
"""Measure per-stage anchorX (horizontal soil-mound centre) for plant sprites.

Reads renderer/art.js plant dirs + base metadata, scans the bottom soil band in
each stage-{n}.png, and prints anchorX values. Run after art changes:

  python3 scripts/compute-plant-anchor-x.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "renderer" / "art.js"


def load_plants_from_art() -> dict:
    text = ART.read_text(encoding="utf-8")
    m = re.search(r"plants:\s*(\{.*?\}),\s*meters:", text, re.S)
    if not m:
        raise SystemExit("Could not parse plants block in art.js")
    return json.loads(m.group(1))


def measure_anchor(path: Path, base: float, w: int, h: int) -> float:
    a = np.array(Image.open(path).convert("RGBA"))[:, :, 3]
    y1 = min(h, int(base) + 1)
    y0 = max(0, int(base) - 52)
    total, cx = 0.0, 0.0
    for y in range(y0, y1):
        row = a[y]
        mask = row > 28
        if not mask.any():
            continue
        xs = np.arange(w)[mask]
        wg = 0.35 + 0.65 * ((y - y0) / max(1, y1 - y0))
        total += wg
        cx += float(xs.mean()) * wg
    if total < 1e-6:
        band = a[max(0, int(base) - 80):y1, :]
        if band.any():
            _, xs = np.where(band > 28)
            cx = float(xs.mean())
        else:
            cx = w / 2.0
    else:
        cx /= total
    # stem column refinement
    ystem0 = max(0, int(base) - 120)
    x0, x1 = max(0, int(cx) - 12), min(w, int(cx) + 12)
    col = a[ystem0:y1, x0:x1]
    if col.any():
        _, xs = np.where(col > 40)
        cx = 0.7 * cx + 0.3 * float(xs.mean() + x0)
    return round(cx, 1)


def main() -> None:
    plants = load_plants_from_art()
    out: dict[str, list[float]] = {}
    for pid, info in plants.items():
        d = info["dir"]
        stage_ax: list[float] = []
        for i, st in enumerate(info["stages"], start=1):
            p = ROOT / "assets" / "plants" / d / f"stage-{i}.png"
            ax = measure_anchor(p, st["base"], st["w"], st["h"])
            stage_ax.append(ax)
        picked = ROOT / "assets" / "plants" / d / "picked.png"
        if picked.exists():
            st5 = info["stages"][4]
            stage_ax[4] = measure_anchor(picked, st5["base"], st5["w"], st5["h"])
        out[pid] = stage_ax
        print(f"{pid}: " + ", ".join(str(x) for x in stage_ax))
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()