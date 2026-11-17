# Day clock, bedtime, and seasons (v5)

Smile Garden replaces the one-off “visit” loop with an in-game day that runs **only while the app is open**.

## Loop

1. **Daytime (6:00 → ~23:00 garden time)** — clock ticks in real time (default: 1 real minute ≈ 1 garden hour; ~18 real minutes to late evening). Backdrop lighting **crossfades** dawn → midday → golden hour → night. Critters appear in daylight only.
2. **Tend** — per bed, once per day: smile (sun), talk (water), optional breathe (fertilizer). Harvest anytime when mature. Growth is **deferred until bed**.
3. **Go to bed** — always available; from golden hour the UI gently suggests it. Clock does not force the day to end. Bedtime dims to night, then **morning reveal** lists overnight growth and crops ready to pick. New day starts at 6:00.
4. **Seasons** — 7 garden days per season (spring → summer → autumn → winter, loop). Seeds declare allowed seasons in `game/day.js` (`PLANT_SEASONS`). Out-of-season plants pause growth; they never die.

## Save migration

- State version **5**. v3/v4 saves keep plant stages; garden resets to **Day 1, spring, 6:00** with empty daily tends.
- Calendar keys for growth/harvest on v5: `garden-1`, `garden-2`, …

## Art hooks

Authoritative file list: **`assets/time-manifest.json`** (wired in `renderer/art.js`; procedural fallbacks if a PNG is missing).

- **Clock** — `assets/ui/clock/clock-frame-{day|night}.png`, `sun-token.png`, `moon-token.png`, `clock-front-{day|night}.png` (drawn **after** tokens). Arc in frame @2x: centre **(160.6, 183.1)**, radius **150.6**, **147° → 33°** (6:00 → 18:00); moon rests at the right end after 18:00. Season ribbon + label at **(640, 88)**.
- **Seasons** — `assets/seasons/{season}-{day|night}.png`; particles under `assets/seasons/particles/` (25 sprites; summer night uses fireflies).
- **Bedtime** — `assets/bedtime/window-glow.png` (+ optional `window-dark.png`); **morning** — `assets/bedtime/morning-card.png`; bed control icon `assets/ui/bed-button-icon.png`.

## Screenshots

```bash
xvfb-run -a npm run screenshots
```

Captures include `clock-{dawn,noon,dusk,night}.png`, `season-*.png`, `bedtime-window-glow.png`, `morning-card.png`, and `logo-{day,night}-full.png` under `docs/`.