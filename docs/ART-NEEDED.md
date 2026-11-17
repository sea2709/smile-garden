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

### Decorations — `assets/decor/<id>-{day|night}.png`

lantern, birdbath, bench, scarecrow, fairy-lights — natural sizes ~161–249px wide; night additive glow for lantern & fairy-lights in code.

### Decoration spots (backdrop 1280×720, bottom-centre anchor + scale)

| Spot id | x | y | scale |
|---------|---|---|-------|
| `nw-path` | 168 | 298 | 0.58 |
| `ne-hedge` | 1110 | 310 | 0.55 |
| `sw-corner` | 145 | 580 | 0.48 |
| `se-path` | 1155 | 575 | 0.62 |
| `mid-left` | 218 | 460 | 0.62 |

Defined in `renderer/art.js` → `decorSpots`. Scale chosen so ~160–250px source art reads beside the beds (~100–120px on backdrop).

## Day clock, seasons, bedtime (v5 — Heily placeholders)

Registered in `renderer/art.js`. Missing files use code fallbacks in `scene.js` / `app.js`.

### HUD garden clock (drawn on garden canvas)

| Path | Size (@2x) | Display | Anchor |
|------|------------|---------|--------|
| `ui/clock-frame-day.png` | **320×128** | 160×64 | backdrop centre **(640, 40)** |
| `ui/clock-frame-night.png` | **320×128** | 160×64 | same |
| `ui/clock-sun.png` | **64×64** | 32×32 | moves on arc (`ART.clock.arc`) |
| `ui/clock-moon.png` | **64×64** | 32×32 | same (after ~72% of day) |

### Season overlays (above backdrop, below plants/decor)

| Path | Size | Notes |
|------|------|--------|
| `seasons/{spring\|summer\|autumn\|winter}-day.png` | **1280×720** | transparent; aligned to backdrop |
| `seasons/{spring\|summer\|autumn\|winter}-night.png` | **1280×720** | blended with day using lighting night weight |

### Season particles (above plants, below HTML UI)

| Path | Size (@2x) | Display | Season |
|------|------------|---------|--------|
| `seasons/particle-petal.png` | **48×48** | 24×24 | spring drift |
| `seasons/particle-leaf.png` | **48×48** | 24×24 | autumn drift |
| `seasons/particle-snow.png` | **48×48** | 24×24 | winter drift |

Summer uses overlay only (no particle sprite).

### Bedtime & morning reveal

| Path | Size | Use |
|------|------|-----|
| `ui/bedtime-window-glow.png` | **1280×720** | cottage window glow; faded in during Go to bed |
| `ui/morning-card.png` | **~700×600** | morning summary (like unlock card); title/body in top ~42% |