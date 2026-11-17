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

| Plant | File | Canvas | Anchor (`picked` in `art.js`) |
|-------|------|--------|-------------------------------|
| tomato | `plants/tomato/picked.png` | 312×484 | base 475, top 16 |
| mint | `plants/mint/picked.png` | 312×484 | base 475, top 35 |
| cucumber | `plants/cucumber/picked.png` | 312×484 | base 475, top 16 |
| apple | `plants/apple-tree/picked.png` | 312×484 | base 475, top 16 |

Lettuce / sunflower are **pull** crops (no picked sprite; bed clears at harvest frame 5).

**Alignment note:** Mature **apple-tree** stage-5 art is **356×538** (base ~511) while `picked.png` is **312×484** (base 475). The stub may read slightly smaller on the bed until a size-matched picked asset ships.

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