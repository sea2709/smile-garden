# Per-plant needs & neck stretch — art spec (Heily)

Authoritative layout: **`assets/tags-manifest.json`** (tags, needs card, care icons, damp soil) and **`assets/stake-manifest.json`** (stake meter, stretch guide, plant stakes, stake FX). Code fallbacks remain until every asset is loaded. UI art is **2×** (draw at half PNG size); soil overlays are **1×** backdrop (1280×720).

## Unit lengths (game logic)

| Need | Real-time per dot |
|------|-------------------|
| Sun | ~10 s smiling |
| Water | ~10 s talking |
| Fertilizer | ~15 s guided breath |
| Stake | one completed neck stretch (persists until harvest) |

---

## Wooden plant tag

| Asset | Path |
|-------|------|
| Day | `assets/ui/tag/plant-tag-day.png` |
| Night | `assets/ui/tag/plant-tag-night.png` |

- **Source:** 224×227 px (2×).
- **Display:** 112×113.5 px at scale 1 (× row scale: back beds **0.5** → 56×57, front **0.62** → ~69×70).
- **Anchor:** bottom-centre **(112, 227)** in PNG px — stake foot on the ground.
- **`faceBox`:** `[14, 13, 209, 116]` — code-drawn icons (48 px @ 0.75× icon), dots (16 px), bloom, or resting leaf.
- **Placement:** per-bed anchors in manifest `tag.beds.bed1..bed8` (backdrop px); draw after plants with depth order (back plants → back tags → front plants → front tags; selected bed tag on top).

---

## Needs card

| Asset | Path |
|-------|------|
| Card (day) | `assets/ui/tag/needs-card.png` |
| Card (night) | `assets/ui/tag/needs-card-night.png` |

- **Source:** 720×560 px (2×) each; identical layout boxes (`card.nightNote` in manifest).
- **Display:** 360×280 CSS px (`#needs-card`).
- **Lighting:** dawn and midday use the **day** card; **night** uses `needs-card-night.png` (same rule as in-garden tags). Title and row ink **`#3E2A1A`**.
- **On the card (day and night):** always draw **day** care icons, dots, check, bloom stamp, and resting leaf. `-night` care sprites are for **plant tags in the garden only** (they are too low-contrast on the dimmed night card art).
- **Rows (PNG px, halve for CSS):** sun y=190–276, water 276–362, fertilizer 362–448, stake 448–534 (86 px tall each). **Omit stake row** for lettuce/mint.
- **Bloom stamp region:** `[584, 72, 712, 200]` on the card art.

---

## Care icons & dots (`assets/ui/care/`)

| Item | Size (2×) | Display |
|------|-----------|---------|
| `icon-{sun,water,fertilizer,stake}` (+ `-night`) | 64×64 | 32×32 |
| `need-dot-{empty,filled}` (+ `-night`) | 28×28 | 14×14 |
| `need-done` (+ `-night`) | 28×28 | row check |
| `bloom-stamp` (+ `-night`) | 128×128 | 64×64 |
| `resting-leaf` (+ `-night`) | 64×64 | 32×32 |

Stake meter still uses `ui/care/stake-icon*.png` at 128 px (64 px display) from the staking set.

---

## Tended soil (damp bed)

When a bed’s needs are **all met** for the day (`soilTended`), show painted damp soil. **Clears each morning.** Fade in **~1.2 s** when the tag completes.

| Asset | Path pattern |
|-------|----------------|
| Per bed | `assets/scene/soil/soil-{day\|night}-bed{N}.png` |
| Full frame (alt.) | `assets/scene/soil/soil-{day\|night}-all.png` |

- **Draw:** `drawImage(img, pos[0], pos[1])` at manifest `soil.beds.bedN.pos` — **no scaling**.
- **Order:** after backdrop, **before** plants; day/night crossfade matches backdrop weights.

---

## Resting leaf

Shown on tag face when `plot.tagResting` (did not grow overnight). Cleared when all needs met that day or recomputed at bedtime. Not wilted / red.

---

## Neck stretch (stake need)

See **`assets/stake-manifest.json`** and staking section in `renderer/art.js` (`stretch`). Guide stem/head, vine rings, plant stakes, stake FX strips.

---

## Tests & captures

- `npm test` — `tags art matches assets/tags-manifest.json`
- `npm run screenshots:tags` — tag/card/soil doc shots (`needs-card-tomato-partial-day.png`, `needs-card-tomato-partial-night.png`, complete + soil, resting leaf, night tag)