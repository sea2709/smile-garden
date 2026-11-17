# Camera check screen — art spec (Heily)

Pre-game **Camera check** overlay (`#screen-camera-check`). Code supplies fallbacks (emoji, CSS oval, stretch guide reuse). All paths are relative to repo root; manifest in `renderer/art.js` → `cameraCheck`.

## Frame & preview

| Asset | Path | Design px (1×) | Export @2× |
|-------|------|----------------|------------|
| Preview frame | `assets/ui/camera-check/frame.png` | 640 × 480 | 1280 × 960 |

Soft parchment / vine corners around the live preview; centre is **transparent** so video shows through. Face oval may be painted faintly inside the frame or left to CSS `.cc-face-oval`.

## Test icons (tile buttons)

| Key | Path | Design px | @2× |
|-----|------|-----------|-----|
| smile | `assets/ui/camera-check/icon-smile.png` | 64 × 64 | 128 × 128 |
| talk | `assets/ui/camera-check/icon-talk.png` | 64 × 64 | 128 × 128 |
| breath | `assets/ui/camera-check/icon-breath.png` | 64 × 64 | 128 × 128 |
| stretch | `assets/ui/camera-check/icon-stretch.png` | 64 × 64 | 128 × 128 |

Friendly line icons matching needs-meter palette (sun yellow, water blue, leaf green, sunflower gold). Fallback emoji in UI: ☀ 💬 🍃 🌻.

## Pass check mark

| Asset | Path | Design px | @2× |
|-------|------|-----------|-----|
| check | `assets/ui/camera-check/check-pass.png` | 44 × 44 | 88 × 88 |

Soft green vine tick; fallback: ✓ in CSS.

## Stretch mini-test

Reuses existing stretch guide art (`ART.stretch.guideSunflower*`); no new sunflower required unless a smaller variant is desired (`guideDisplay` 96px).

## Screenshots (capture)

- `camera-check-initial.png` — first open, no tests passed  
- `camera-check-midway.png` — smile + talk passed, breath warming  
- `camera-check-all-passed.png` — all four checks (or skips) marked  
- `camera-check-denied.png` — permission / no-face error state  