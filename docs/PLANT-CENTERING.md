# Plant centering (mound-free sprites)

Heily repainted plant stages **2–5** and **picked** without the painted soil mound / pale rim (stage **1** still shows the seed mound). Sprites are **recentered on the canvas**; the renderer anchors at **`-w/2`** on the plot soil point (no per-stage `anchorX`).

## Metadata

- `assets/plants/plant-meta.json` is the source of truth for `base` (stem foot y) and `top` per stage.
- Sync into `renderer/art.js`: `node scripts/sync-plants-art-from-meta.js`
- Handoff zip (sprites + meta): `./scripts/apply-plants-handoff.sh /path/to/plants-centered.zip`

## Plot anchors

`ART.plots[].x/y` are soil-line anchors on the 1280×720 backdrop. Stage-1 art draws the dirt mound **above** `meta.base`, so anchors sit **low in each bed** (near the front edge) so the mound centres in the soil: back row **y ≈ 392–395**, front row **y ≈ 530–539**. X tracks each bed’s box centre. Selection rings stay on painted bed offsets; plants use plot anchors.

## Before / after

![Before centering fix](plant-center-before.png)

![After mound-free art + soil anchors (midday)](plant-center-after.png)

![Night spot-check (back row, stage 2)](plant-center-night.png)

Handoff (final): `./scripts/apply-plants-handoff.sh /path/to/plants-centered.zip`