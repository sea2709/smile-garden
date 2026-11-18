# Camera check — potting-shed window (Heily)

Pre-game **Camera check** (`#screen-camera-check`). Full-screen stage **1280×720 display px**. **Authoritative layout:** `assets/ui/camera-check/camera-check-manifest.json`. Registered in `renderer/art.js` → `cameraCheck`. CSS: `renderer/camera-check-ui.css` (`.cc-*`).

## Layer order

1. `backdrop.png` (1× 1280×720, opaque planks)
2. Live **video** — **360, 56**, **560×420**, `object-fit: cover`, **`scaleX(-1)`** mirror
3. **Overlays** — `face-outline.png`, `tilt-left/right.png` (behind frame; outline → **40%** opacity once face found; pulse active tilt arrow during stretch test)
4. `window-frame.png` — **300, 0**, display **680×520** (2× source 1360×1040); visible picture **370, 66, 540×400**
5. `sill.png` — **280, 520**, **720×80**
6. Seed **packets** — **110×150** display (220×300 @2×), centres **x = 400 / 560 / 720 / 880**, **top y = 450** (feet ~**y = 600**)
7. **Labels** — code text **y = 610–650**: `ready`, `listening…`, `next`
8. **Buttons** — 9-slice pills, **exactly 44 px** tall (`border-image-slice: 40 44 fill`; `border-image-width: 20px 22px`)

## Packets (smile / talk / breathe / stretch)

| State | Art | When |
|-------|-----|------|
| closed | `packet-{kind}-closed.png` | Default |
| listening | `packet-{kind}-listening.png` | Active check |
| sprouted | `packet-{kind}-sprouted.png` | Passed |

Game key `breath` → filename stem **`breathe`**.

## Buttons

| Button | Position (display px) | Asset |
|--------|----------------------|--------|
| Skip for now | **40, 658**, min width ~200 | `btn-secondary.png` + hover |
| Start my garden | **right 40, top 658**, min width ~200 | `btn-primary.png` + hover |

Text colours: primary **#3f5a2a**, secondary **#7a6652**.

## Care UI during check

- **Howto card** (left of window): explains each packet action and its garden purpose (sunlight / water / fertilizer / stake).
- **Prompt pill** (lower window): idle tip, or a live how-to for the active check.
- **Packet labels:** title + purpose (`for sunlight` …) + status (`ready` / `listening…` / `next`).
- **Smile / talk:** meter under `listening…` on the active packet label.
- **Breathe:** centre breath guide + pill text when active.
- **Stretch:** stretch HUD + tilt hints; packet label `next` until selected.

## Code fallbacks

Missing PNGs: gradient backdrop, emoji packet tiles, CSS face oval, plain rounded buttons.

## Screenshots

Reference: **`docs/camera-check-mockup.png`**.

Capture (`npm run screenshots` after wellness):

- `camera-check-initial.png`
- `camera-check-mockup-states.png` (smile+talk sprouted, breathe listening, stretch next)
- `camera-check-all-passed.png`
- `camera-check-denied.png`