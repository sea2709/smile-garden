# Neck-stretch step — art spec for Heily

All source art **2×**; game displays at **1×** unless noted.

## Guide sunflower (`assets/ui/stretch/guide-sunflower.png`)

- **Source:** 192×192 px (2×), upright sunflower head on short stem.
- **Display:** 96×96 CSS px, anchored at **50% / 75%** (stem base); code rotates ±30° with head roll.
- **Anchor:** pivot at stem base center bottom quarter of frame.

## Vine progress rings

- `assets/ui/stretch/vine-ring-empty.png` — 120×120 px hollow vine circle (2×).
- `assets/ui/stretch/vine-ring-full.png` — same size, filled leafy arc for progress overlay (or single ring + code draws arc).
- **Display:** 60×60 px each; left ring = tilt left shoulder, right ring = tilt right.
- **Labels in UI:** “Left” / “Right” under rings.

## Bamboo stake + twine (`assets/plants/stake.png`)

- **Source:** 80×200 px (2×), thin bamboo stake with twine loop near top.
- **Display:** 20×50 backdrop px per bed, placed **14 px right** of plant soil anchor, **8 px above** soil line (`stakeOffset` in `art.js`).
- Drawn beside every plant with `staked: true` until harvest.

## Fallbacks (until art lands)

Code draws a 🌻 emoji, SVG vine arcs, and a brown rectangle stake — no blocking.