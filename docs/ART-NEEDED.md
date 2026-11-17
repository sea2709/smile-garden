# Smile Garden — art drop-in list (harvests milestone)

Paths are relative to `assets/`. The renderer loads each path from `renderer/art.js` and falls back to code-drawn placeholders when a file is missing.

## Produce icons (pantry)

| Path | Size | Notes |
|------|------|--------|
| `produce/lettuce.png` | 128×128, transparent | Circle icon on pantry shelf |
| `produce/mint.png` | 128×128 | |
| `produce/cucumber.png` | 128×128 | |
| `produce/tomato.png` | 128×128 | |
| `produce/sunflower.png` | 128×128 | |
| `produce/apple.png` | 128×128 | |

Manifest: `SmileArt.produce.src(id)`.

## Picked plant sprites (regrow state)

| Path | Notes |
|------|--------|
| `plants/lettuce/picked.png` | Same anchor scheme as `stage-*.png` (soil base in `art.js` stages) |
| `plants/mint/picked.png` | Fallback: stage-4 sprite |
| `plants/cucumber/picked.png` | |
| `plants/tomato/picked.png` | |
| `plants/apple-tree/picked.png` | |
| `plants/sunflower/picked.png` | |

Manifest: `SmileArt.plantPickedSrc(id)`.

## Harvest effect strip

| Path | Format |
|------|--------|
| `effects/harvest-day-strip.png` | 12 frames × 200×320 px, soil line y=282, 12 fps, bottom-centre on bed |
| `effects/harvest-night-strip.png` | Same layout as other effect strips |

Manifest: `SmileArt.harvestFx` + `harvestFxSrc('day'|'night')`. Until present: particle pop + fly to basket.

## UI

| Path | Notes |
|------|--------|
| `ui/pantry-shelf.png` | Background for pantry journal tab (wide shelf) |
| `ui/unlock-seed-card.png` | “New seed” reveal card (fallback: `ui/card-blank.png`) |

## Decorations (day + night)

Each decoration: bottom-centre anchor at spot coordinates below. Night variants for `lantern` and `fairy-lights` should read as glowing (renderer adds soft additive glow at night).

| Path | Pair |
|------|------|
| `decor/lantern-day.png` / `decor/lantern-night.png` | night glow |
| `decor/birdbath-day.png` / `decor/birdbath-night.png` | |
| `decor/bench-day.png` / `decor/bench-night.png` | |
| `decor/scarecrow-day.png` / `decor/scarecrow-night.png` | |
| `decor/fairy-lights-day.png` / `decor/fairy-lights-night.png` | night glow |

Manifest: `SmileArt.decor.src(id, 'day'|'night')`.

## Decoration spots (backdrop 1280×720 px)

Chosen to avoid the eight bed boxes in `SmileArt.plots`. Anchor: **bottom-centre** at `(x, y)`.

| Spot id | Label | x | y |
|---------|--------|---|---|
| `nw-path` | Northwest path | 168 | 298 |
| `ne-hedge` | Northeast hedge | 1110 | 310 |
| `sw-corner` | Southwest corner | 145 | 580 |
| `se-path` | Southeast path | 1155 | 575 |
| `mid-left` | Mid-left lawn | 218 | 460 |

Defined in `renderer/art.js` → `decorSpots`.

## Basket HUD

Canvas-drawn basket at `SmileArt.basketHud` **(1195, 68)** until optional art is added.