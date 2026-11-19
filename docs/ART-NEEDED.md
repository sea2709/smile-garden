# Smile Garden — art inventory (harvests milestone)

Paths are relative to `assets/`. The renderer loads from `renderer/art.js`.

## Shipped (designer deliverables)

### Harvest & ready effect strips — `assets/effects/`

| File | Frames | Loop | Notes |
|------|--------|------|--------|
| `ready-day-strip.png` | 12 | yes | Ready-bed cue; 200×320/frame, soil y=282, 12 fps |
| `ready-night-strip.png` | 12 | yes | Night variant |
| `harvest-<plant>-day-strip.png` | 12* | no | Preferred one-shot per plant (produce painted in strip) |
| `harvest-<plant>-night-strip.png` | 12* | no | `<plant>`: lettuce, mint, cucumber, tomato, sunflower, apple |
| `harvest-day-strip.png` | 12 | no | **Fallback:** sparkles + basket wobble; code flies `produce/<plant>.png` into basket |
| `harvest-night-strip.png` | 12 | no | Night generic fallback |

\*Current export is 12 frames (2400px wide); manifest may list 16 when a wider strip ships — frame count is derived from image width ÷ 200.

Basket is drawn in-frame at **(150, 286)** in strip space. Sprite swap at **frame 5** (pull → empty soil; regrow → `picked.png`).

### Produce & basket

| Path | Size | Use |
|------|------|-----|
| `produce/<plant>.png` | **128×128** | Pantry cubbies, generic-harvest fly, unlock thumb |
| `ui/basket.png` | 128×128 | Top-bar harvest basket chip + canvas HUD |

### Pantry & unlock UI

| Path | Size | Use |
|------|------|-----|
| `ui/pantry-shelf.png` | 1047×807 | Pantry journal — six cubbies; rects in `art.js` → `pantry.cubbies` |
| `ui/unlock-seed-card.png` | 700×991 | Unlock reveal; bottom ~48% reserved for title + body |

### Picked sprites — `assets/plants/<dir>/picked.png`

Regrow crops (tomato, mint, cucumber, apple): **same canvas and soil line as stage 5**. The renderer uses **stage-5 geometry** from `art.js` (`stages[4]`) for `picked.png` — no separate `picked` anchor block.

Lettuce / sunflower are **pull** crops (no picked sprite; bed clears at harvest frame 5).

## Day clock, seasons, bedtime (v5 — Heily art)

**Authoritative manifest:** `assets/time-manifest.json` (paths in `renderer/art.js`). Missing PNGs keep procedural fallbacks in `scene.js`.

### HUD garden clock (ribbon only — no arc)

| Path | Size (@2x) | Display | Anchor |
|------|------------|---------|--------|
| `ui/clock/season-ribbon.png` | **584×96** | 292×48 | backdrop centre **(640, 36)** |
| `ui/clock/season-ribbon-night.png` | **584×96** | 292×48 | same |

Label: **600 16px Lora**, **#3E2A1A** day and night; text-safe **216×32** inside the ribbon.  
Legacy arc assets (`clock-frame-*`, `clock-front-*`, `sun-token`, `moon-token`) stay in the tree but are **not painted**.

### Season overlays (above backdrop, below plants)

| Path | Size | Notes |
|------|------|--------|
| `seasons/{spring\|summer\|autumn\|winter}-day.png` | **1280×720** | transparent; aligned to backdrop |
| `seasons/{spring\|summer\|autumn\|winter}-night.png` | **1280×720** | blended with day using lighting night weight |

### Season particles (`assets/seasons/particles/*.png`, 25 sprites)

Pools in `ART.seasons.particlePools` (spring petals/blossoms, summer pollen/seed-fluff, summer night fireflies, autumn leaves, winter snowflakes).

### Bedtime & morning reveal

| Path | Size | Use |
|------|------|-----|
| `bedtime/window-glow.png` | **1280×720** | aligned to `night.jpg`; fade in on Go to bed |
| `bedtime/window-dark.png` | **1280×720** | optional lights-off overlay |
| `bedtime/morning-card.png` | **700×600** | morning summary; text in manifest `morningTextSafe` |
| `ui/bed-button-icon.png` | **56×56** (@2x) | Go to bed button |