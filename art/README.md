# Smile Garden source art

Painterly source assets used to build the shipped sprites in `assets/`. The game reads
from `assets/` only; this tree is for authors and regeneration scripts.

| Folder | Contents |
|---|---|
| `backgrounds/` | Full-scene backdrops (`dawn.png`, `midday.png`, `golden-hour.png`, `night.png`). `originals/` keeps pre-edit masters (e.g. night before firefly cleanup). |
| `plants/<id>/` | Per-plant growth sprites `stage-1.png` … `stage-5.png` (transparent PNG). |
| `ui/` | Meter cards and blank plot cards (source before `scripts/cutout-cards.py` and live meter dots). |
| `effects/` | Procedural effect generator, `manifest.json`, horizontal **strip** PNGs, and (when regenerated) per-frame `*-loop/` and `*-absorb/` folders. |

## Blending in the app

In `renderer/scene.js`, **sun** effect strips are drawn with **additive** blending so light
pools and motes glow on the soil. **Water** and **fertilizer** strips use **normal** alpha
compositing.

## Regenerate effect frames

Per-frame folders are gitignored; strips in `effects/` are the portable snapshots the app
uses via `assets/effects/`. To rebuild frames locally:

```bash
cd art/effects
python3 -m pip install pillow numpy   # once
python3 make_effects.py
```

This writes `sun|water|fertilizer-{day|night}-{loop|absorb}/00..11.png`, refreshes
`*-strip.png`, and updates `manifest.json`. Paths are relative to the script directory.

Optional preview contact sheet and GIF (run from `art/effects/`; expects the frame folders
above):

```bash
python3 preview.py
```

## Plant sprites → `assets/plants/`

```bash
python3 scripts/defringe-sprites.py
```

Reads `art/plants/` by default (`ART_SRC` overrides).