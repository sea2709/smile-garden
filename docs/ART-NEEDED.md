# Smile Garden — art inventory (harvests milestone)

Paths are relative to `assets/`. The renderer loads from `renderer/art.js`.

## Shipped (designer deliverables)

### Harvest effect strips — `assets/harvest/`

| File | Frames | Loop | Notes |
|------|--------|------|--------|
| `ready-day-loop-strip.png` | 12 | yes | Ready-bed cue; 200×320/frame, soil y=282, 12 fps |
| `ready-night-loop-strip.png` | 12 | yes | Night variant |
| `harvest-<plant>-day-strip.png` | **16** | no | One-shot per plant |
| `harvest-<plant>-night-strip.png` | **16** | no | `<plant>`: lettuce, mint, cucumber, tomato, sunflower, apple |

Manifest: `docs/harvest-manifest.json` (from design handoff). Basket is drawn in-frame at **(150, 286)** in strip space. Sprite swap at **frame 5** (pull → empty soil; regrow → `picked.png`).

### Produce & basket — `assets/produce/`

| File | Size | Use |
|------|------|-----|
| `<plant>.png` | 160px | Pantry tab, unlock popups |
| `<plant>-64.png` | 64px | HUD / compact UI (reserved) |
| `basket.png` | — | Top-bar harvest basket chip + canvas HUD fallback |

### Picked sprites — `assets/plants/<dir>/picked.png`

| Plant | File | Canvas | Anchor (`picked` in `art.js`) |
|-------|------|--------|-------------------------------|
| tomato | `plants/tomato/picked.png` | 312×484 | base 475, top 16 (alpha bbox) |
| mint | `plants/mint/picked.png` | 312×484 | base 475, top 35 |
| cucumber | `plants/cucumber/picked.png` | 312×484 | base 475, top 16 |
| apple | `plants/apple-tree/picked.png` | 312×484 | base 475, top 16 |

Lettuce / sunflower are **pull** crops (no picked sprite; bed clears at harvest frame 5).

**Alignment note:** Mature **apple-tree** stage-5 art is **356×538** (base ~511) while `picked.png` is **312×484** (base 475). The stub may read slightly smaller on the bed until a size-matched picked asset ships.

## Still placeholder (designer)

### UI
| Path | Purpose |
|------|---------|
| `ui/pantry-shelf.png` | Pantry journal background |
| `ui/unlock-seed-card.png` | Seed unlock reveal (fallback: `ui/card-blank.png`) |

### Decorations — `assets/decor/<id>-{day|night}.png`

lantern, birdbath, bench, scarecrow, fairy-lights — night glow for lantern & fairy-lights.

### Decoration spots (backdrop 1280×720, bottom-centre)

| Spot id | x | y |
|---------|---|---|
| `nw-path` | 168 | 298 |
| `ne-hedge` | 1110 | 310 |
| `sw-corner` | 145 | 580 |
| `se-path` | 1155 | 575 |
| `mid-left` | 218 | 460 |

Defined in `renderer/art.js` → `decorSpots`.