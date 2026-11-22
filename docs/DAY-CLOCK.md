# Day clock, bedtime, and seasons (v5)

Smile Garden replaces the one-off “visit” loop with an in-game day that runs **only while the app is open**.

## Loop

1. **Daytime (6:00 → ~23:00 garden time)** — clock ticks in real time (default: 1 real minute ≈ 1 garden hour; ~18 real minutes to late evening). Backdrop lighting **crossfades** dawn → midday → night. Critters appear in daylight only.
2. **Tend** — per bed, once per day: smile (water), talk (fertilizer), stretch (stake when needed); sun dots fill automatically in daylight. Harvest anytime when mature. Growth is **deferred until bed**.
3. **Go to bed** — always available; from evening (~18:00) the UI gently suggests it. Clock does not force the day to end. Bedtime dims to night, then **morning reveal** lists overnight growth and crops ready to pick. New day starts at 6:00.
4. **Seasons** — 7 garden days per season (spring → summer → autumn → winter, loop). Seeds declare allowed seasons in `game/day.js` (`PLANT_SEASONS`). Out-of-season plants pause growth; they never die.

## Save migration

- State version **5**. v3/v4 saves keep plant stages; garden resets to **Day 1, spring, 6:00** with empty daily tends.
- Calendar keys for growth/harvest on v5: `garden-1`, `garden-2`, …

## Art hooks

Authoritative file list: **`assets/time-manifest.json`** (wired in `renderer/art.js`; procedural fallbacks if a PNG is missing).

- **Clock (ribbon only)** — `assets/ui/clock/season-ribbon.png` and `season-ribbon-night.png` (**584×96** @2x → **292×48** display) centred at **(640, 36)** in the top bar. Label in **Lora 600 16px**, ink **#3E2A1A** day and night. The sun/moon arc frame and tokens are **not drawn** (assets may remain on disk for history).
- **Seasons** — `assets/seasons/{season}-{day|night}.png`; particles under `assets/seasons/particles/` (25 sprites; summer night uses fireflies).
- **Bedtime** — `assets/bedtime/window-glow.png` (+ optional `window-dark.png`); **morning** — `assets/bedtime/morning-card.png`; bed control icon `assets/ui/bed-button-icon.png`.

## Screenshots

```bash
xvfb-run -a npm run screenshots
```

`SMILE_GARDEN_TIME_SHOTS=1` also writes `clock-ribbon-day.png`, `clock-ribbon-night.png`, and `clock-ribbon-crops.png` (longest label, layout widths). Legacy `clock-*.png` and `topbar-*` captures may still run in the time-shot harness.