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

## Day clock, seasons, bedtime (v5 — Heily art)

**Authoritative manifest:** `assets/time-manifest.json` (paths in `renderer/art.js`). Missing PNGs keep procedural fallbacks in `scene.js`.

### HUD garden clock (canvas draw order: frame → token → front)

| Path | Size (@2x) | Display | Anchor |
|------|------------|---------|--------|
| `ui/clock/clock-frame-day.png` | **320×128** | 160×64 | backdrop centre **(640, 40)** |
| `ui/clock/clock-frame-night.png` | **320×128** | 160×64 | same |
| `ui/clock/sun-token.png` | **64×64** | 32×32 | arc 147° → 33° (6:00–18:00) |
| `ui/clock/moon-token.png` | **64×64** | 32×32 | rests at right end after 18:00 |
| `ui/clock/clock-front-day.png` | **320×128** | 160×64 | after token (hill mask) |
| `ui/clock/clock-front-night.png` | **320×128** | 160×64 | same |
| `ui/clock/season-ribbon.png` | **280×61** | 140×30 | centre **(640, 88)** |
| `ui/clock/season-ribbon-night.png` | **280×61** | 140×30 | same |

Arc centre **(160.6, 183.1)**, radius **150.6** in frame pixels (@2x).

### Season overlays (above backdrop, below plants/decor)

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