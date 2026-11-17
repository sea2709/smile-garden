# Per-plant needs & neck stretch — art spec for Heily

All source art **2×**; game displays at **1×** unless noted. Paths and anchors are registered in `renderer/art.js` (`needs` and `stretch` blocks) with code fallbacks until assets land.

## Unit lengths (game logic)

| Need | Real-time per dot |
|------|-------------------|
| Sun | ~10 s smiling |
| Water | ~10 s talking |
| Fertilizer | ~15 s guided breath |
| Stake | one completed neck stretch (persists until harvest) |

## Wooden plant tag

| Asset | Path |
|-------|------|
| Tag | `assets/ui/needs/plant-tag.png` |

- **Source:** 80×96 px (2×).
- **Display:** 40×48 CSS px beside the needs card and as a bed marker in the scene.
- **Anchor (`tagAnchor`):** **(0.5, 1)** — bottom-center on the soil-adjacent point.
- **Bed offset (`tagOffset`):** **(0, −42)** px from plot centre (1×).

## Needs card

| Asset | Path |
|-------|------|
| Card panel | `assets/ui/needs/needs-card-bg.png` |

- **Source:** 560×420 px (2×) parchment / wood trim panel.
- **Display:** ~280×210 CSS px (`#needs-card`).

## Need icons (tap to start care)

| Icon | Path |
|------|------|
| Sun | `assets/ui/needs/icon-sun.png` |
| Water | `assets/ui/needs/icon-water.png` |
| Fertilizer | `assets/ui/needs/icon-fertilizer.png` |
| Stake | `assets/ui/needs/icon-stake.png` |

- **Source:** 64×64 px (2×) each.
- **Display:** 32×32 CSS px on icon buttons; **dots** render in HTML (filled/empty) with optional sprites below.

## Dot sprites (optional; CSS dots are fallback)

| State | Paths |
|-------|-------|
| Empty | `assets/ui/needs/dot-empty.png` |
| Full sun / water / fert | `dot-full-sun.png`, `dot-full-water.png`, `dot-full-fert.png` |

- **Source:** 14×14 px (2×) per dot.

## Bloom stamp (all needs met today)

| Asset | Path |
|-------|------|
| Stamp | `assets/ui/needs/bloom-stamp.png` |

- **Source:** 72×72 px (2×).
- **Display:** 36×36 CSS px on tag header when `allMet`; scene draws a small wooden tag + ✿ fallback on the bed.

## Resting leaf (did not grow overnight)

| Asset | Path |
|-------|------|
| Resting icon | `assets/ui/needs/resting-leaf.png` |

- **Source:** 56×56 px (2×), soft green leaf — calm, **not** wilted or red.
- **Display:** 28×28 CSS px on the tag header when `plot.tagResting` (cleared when that day’s needs are all met, or at the next bedtime).
- **Scene fallback:** wooden tag micro-badge with 🌿 (same anchor as bloom stamp).
- **State:** `tagResting` on plot (save v6+); set after bedtime when an in-season, growing plant does not advance stage; cleared at start of bedtime then recomputed for the new morning.

---

## Guide sunflower (split head + stem)

| Asset | Path |
|-------|------|
| Head (tilts with player) | `assets/ui/stretch/guide-sunflower-head.png` |
| Stem (static) | `assets/ui/stretch/guide-sunflower-stem.png` |
| Combined fallback | `assets/ui/stretch/guide-sunflower.png` |

- **Source:** 192×192 px (2×) per layer, aligned so stem base meets head disk.
- **Display:** 96×96 CSS px total composition.
- **Pivot (`guidePivot` in `art.js`):** normalized **(0.5, 0.75)** — stem base / rotation axis; only the **head** layer rotates ±30° in code.

## Vine progress rings

- `assets/ui/stretch/vine-ring-empty.png` — 120×120 px (2×).
- `assets/ui/stretch/vine-ring-full.png` — same size.
- **Display:** 60×60 px; left / right shoulder progress.

## Bamboo stake + twine (day / night)

| Asset | Path |
|-------|------|
| Day stake | `assets/plants/stake-day.png` |
| Night stake | `assets/plants/stake-night.png` |

- **Source:** 80×200 px (2×).
- **Display:** 20×50 px per bed (`stakeDisplay`).
- **Placement:** offset **(14, −8)** from soil (`stakeOffset`); anchor **(0.5, 1)**.
- Visible when plant `needs.stake` and `plot.staked` after stretch.

### Stake effect strips

| Effect | Day | Night |
|--------|-----|-----|
| Loop | `assets/effects/stake-loop-day-strip.png` | `assets/effects/stake-loop-night-strip.png` |
| Absorb | `assets/effects/stake-absorb-day-strip.png` | `assets/effects/stake-absorb-night-strip.png` |

## Fallbacks (until art lands)

Emoji/icons, CSS dots, brown tag rect, 🌻 stake guide, SVG vine arcs, and rectangle stake — nothing blocks play or tests.