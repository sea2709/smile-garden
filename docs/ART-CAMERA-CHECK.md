# Camera check — potting-shed window (Heily)

Pre-game **Camera check** (`#screen-camera-check`). Full-screen stage **1280×720 display px** (all painted assets @2×). Code positions from `renderer/art.js` → `cameraCheck.layout` with CSS fallbacks.

## Theme

Potting-shed interior: wooden **window** looking out at the live camera, **sill** with four **seed packets** (mini-tests), shed **backdrop** on the wall.

## Asset list

| Asset | Path | Design px (1×) | @2× export |
|-------|------|----------------|------------|
| Shed backdrop | `assets/ui/camera-check/backdrop.png` | 1280 × 720 | 2560 × 1440 |
| Window frame | `assets/ui/camera-check/window-frame.png` | 640 × 500 | 1280 × 1000 |
| Sill | `assets/ui/camera-check/sill.png` | 1280 × 80 | 2560 × 160 |
| Packet smile closed | `assets/ui/camera-check/packet-smile-closed.png` | 110 × 150 | 220 × 300 |
| Packet smile sprouted | `assets/ui/camera-check/packet-smile-sprouted.png` | 110 × 150 | 220 × 300 |
| Packet talk closed | `assets/ui/camera-check/packet-talk-closed.png` | 110 × 150 | 220 × 300 |
| Packet talk sprouted | `assets/ui/camera-check/packet-talk-sprouted.png` | 110 × 150 | 220 × 300 |
| Packet breathe closed | `assets/ui/camera-check/packet-breathe-closed.png` | 110 × 150 | 220 × 300 |
| Packet breathe sprouted | `assets/ui/camera-check/packet-breathe-sprouted.png` | 110 × 150 | 220 × 300 |
| Packet stretch closed | `assets/ui/camera-check/packet-stretch-closed.png` | 110 × 150 | 220 × 300 |
| Packet stretch sprouted | `assets/ui/camera-check/packet-stretch-sprouted.png` | 110 × 150 | 220 × 300 |

**Sprouted** = that check **passed** (not merely skipped). **Closed** = default. Code swaps on `passed[key]`; skipped packets stay closed (label shows “Skipped”).

Face outline: faint oval in the frame art and/or CSS `.cc-face-oval`.

## Layout (display px on 1280×720 stage)

Coordinates are **backdrop / stage space**, origin top-left.

| Element | Position |
|---------|----------|
| **Camera preview** | 4:3, **560 × 420**; horizontal center **x = 640**; **top y = 56** (left edge **x = 360**) |
| **Window frame** | **640 × 500**, centered on preview center (**cx = 640**, **cy = 266** → left **320**, top **16**); transparent opening for video |
| **Sill** | Vertical span **y = 520 … 600** (80px band, full stage width in art) |
| **Seed packets** (smile, talk, breathe, neck stretch) | Each **110 × 150**; horizontal centers **x = 400, 560, 720, 880**; **bottom y = 600** (top **y = 450**) |
| **Packet labels** (live meter / hint) | Under each packet, **y = 610 … 650** (40px tall strip, centered on packet **cx**) |
| **“Start my garden”** | Primary button, **bottom-right**, baseline near **y ≈ 680** |
| **“Skip for now”** | Text link, **bottom-left**, baseline near **y ≈ 680** |

Status lines (**Face found**, **Lighting OK**, camera errors): code places a compact row just below the preview opening (~**y = 480**, centered).

## Live UI / stretch & breath

- Active **smile** or **talk**: label shows hold **meter** (0–100%).
- Active **breathe**: label mirrors breath pill text (warming → settling → stable); center **breath guide** still used when active.
- Active **neck stretch**: label + existing **sunflower stretch guide** when active.

## Code fallbacks

Missing PNGs: painted shed colors in CSS, emoji packet tiles (☀ 💬 🍃 🌻), CSS face oval.

## Screenshots (capture)

- `camera-check-initial.png`
- `camera-check-midway.png`
- `camera-check-all-passed.png`
- `camera-check-denied.png`