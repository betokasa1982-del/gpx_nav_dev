# Driver UX v6 — Navigation Cockpit

Presentation layer only. The Navigation Engine, Playback Engine, Voice
Scheduler and Lap Manager are untouched (30 functions byte-compared).

## Layout
- Map is full-bleed; the legacy top bar, summary bar, progress strip, live
  metrics and compass are hidden while navigating.
- **Manoeuvre card** (top-left): distance 56 px, 104 px arrow, action line in
  blue caps, optional road badge + street, footer with a thin progress bar,
  distance left and time remaining.
- **Speed dial** (top-right): round, 38 px value, average-pace chip below.
- **Next stop dock** (bottom-right): title, name, photo, distance, arrival
  clock, and the three events as colour-coded icons — door green, kneeling
  blue, hand brake red.
- **Orientation button** (bottom-centre): HEADING UP / NORTH UP.
- **Status pill** (top-left): clock and a GPS quality dot (good/weak/bad).
- Night and tunnel dimming apply to the tile pane only; cards stay bright.

## Modes
`setCockpit(false)` returns to Developer Mode with all legacy bars and the
Navigation Debug overlay. Driver Mode is the default when navigation starts.

## Language
Every new driver-facing string is in `DRIVER_LABELS`; switching the cockpit
to PT-BR is editing that one object.

## Verification
`node runner.js` → **455 passed / 0 failed / exit=0**
