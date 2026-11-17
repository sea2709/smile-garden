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

Full contract in `docs/ART-NEEDED.md` (paths registered in `renderer/art.js`):

- **Clock** — `assets/ui/clock-frame-{day|night}.png` (320×128 @2x → 160×64 at backdrop 640,40), `clock-sun.png` / `clock-moon.png` on the arc.
- **Seasons** — `assets/seasons/{season}-{day|night}.png` full-frame overlays; `particle-{petal|leaf|snow}.png` drift above plants.
- **Bedtime** — `ui/bedtime-window-glow.png`; **morning** — `ui/morning-card.png` (~700×600) for the overnight reveal.

## Screenshots

Capture with demo mode after planting:

```bash
npm start
# Demo tools: advance time / go to bed; or use window.__smileGarden
```

Suggested frames: midday tend, golden hour, late night, morning reveal (`docs/day-*.png` when captured).