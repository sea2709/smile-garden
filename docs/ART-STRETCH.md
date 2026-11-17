# Neck-stretch step — art spec for Heily

All source art **2×**; game displays at **1×** unless noted.

## Guide sunflower (split head + stem)

| Asset | Path |
|-------|------|
| Head (tilts with player) | `assets/ui/stretch/guide-sunflower-head.png` |
| Stem (static) | `assets/ui/stretch/guide-sunflower-stem.png` |
| Combined fallback | `assets/ui/stretch/guide-sunflower.png` |

- **Source:** 192×192 px (2×) per layer, aligned so stem base meets head disk.
- **Display:** 96×96 CSS px total composition.
- **Pivot (`guidePivot` in `art.js`):** normalized **(0.5, 0.75)** — stem base / rotation axis; only the **head** layer rotates ±30° in code.
- Register stem and head anchors on the same frame so the pivot sits on the stem base center.

## Vine progress rings

- `assets/ui/stretch/vine-ring-empty.png` — 120×120 px hollow vine circle (2×).
- `assets/ui/stretch/vine-ring-full.png` — same size, filled leafy arc for progress overlay (or single ring + code draws arc).
- **Display:** 60×60 px each; left ring = tilt left shoulder, right ring = tilt right.
- **Labels in UI:** “Left” / “Right” under rings.

## Bamboo stake + twine (day / night)

| Asset | Path |
|-------|------|
| Day stake | `assets/plants/stake-day.png` |
| Night stake | `assets/plants/stake-night.png` |

- **Source:** 80×200 px (2×), thin bamboo stake with twine loop near top.
- **Display:** 20×50 backdrop px per bed.
- **Placement:** offset **14 px right**, **8 px above** soil line from bed anchor (`stakeOffset` in `art.js`).
- **Stake anchor (`stakeAnchor`):** **(0.5, 1)** — bottom-center of sprite sits on soil offset point.
- Shown only for **staked** beds whose plant `needs.stake` is true (tomato, cucumber, sunflower, apple).

### Stake effect strips (hooks; optional animation later)

| Effect | Day | Night |
|--------|-----|-------|
| Loop | `assets/effects/stake-loop-day-strip.png` | `assets/effects/stake-loop-night-strip.png` |
| Absorb | `assets/effects/stake-absorb-day-strip.png` | `assets/effects/stake-absorb-night-strip.png` |

Horizontal strips like harvest ready loops; referenced in `art.js` (`plantStakeLoopSrc` / `plantStakeAbsorbSrc`) with code fallbacks until wired.

## Fallbacks (until art lands)

Code draws a 🌻 emoji, SVG vine arcs, and a brown rectangle stake — no blocking.