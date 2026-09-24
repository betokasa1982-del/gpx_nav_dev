# Synthetic Cycle mode (v63) — SYNTH tab

Trapezoid drive cycles for back-to-back energy comparison of two buses on a
test track. Both buses drive the same cycle; the tablet guides the driver and
proves afterwards that they did.

## Cycle definition
Each segment = launch → accelerate at **a** → hold **v** for **cruise m** →
brake at **d** to a full stop → wait **dwell s**.

- Segment length is fixed: `L = v²/2a + cruise + v²/2d`. The stop mark is
  always `L` metres after the previous stop, whatever the driver did.
- Cycle defaults: accel, decel, stop wait, laps, start countdown. Blank
  wait / a / d in a segment row = default.
- **Cycle ID** (e.g. `149A-3A37`) is a fingerprint of everything that is
  driven (speeds, distances, rates, waits, laps). Name and countdown are not
  part of it. Same ID on both tablets = same cycle.
- Share / import a cycle as JSON to put it on the second tablet.

## Guidance
- Launch: target ramps at `a` from the moment the bus actually moves
  (> 1 km/h), so reaction time does not distort the accel target.
- Cruise: `HOLD v`, with `BRAKE IN x m` — the braking point follows the
  actual speed (`L − v²/2d`), cue given 0.8 s early for GPS + reaction lag.
- Brake: target follows `√(2·d·remaining)`; `STOP IN x m`.
- Stop: registered after 1 s below 1 km/h (also when Android stops sending
  fixes to a parked tablet). Dwell countdown with 3-2-1 beeps and GO.
- Speed tape: green band ± (default 2 km/h), amber to ±5, red beyond.
- Unplanned stop mid-segment → `GO AGAIN`, ramp re-anchors, flagged.
- Moving off during a wait → early start, next segment starts there, flagged.

## Verdict per segment (OK / CHECK)
RMSE ≤ 3 km/h · |stop error| ≤ 10 m · accel within 20 % · decel within 25 %
· no unplanned stop · no early start. Rates are measured 10 %→90 % of v
(1 Hz GPS: expect ±5–10 % on short launches). Thresholds: `SYNTH_CFG.valid`.

## Export (per run)
- `_samples.csv` — 1 Hz: UTC, epoch ms, phase, target, speed, error, accel,
  segment / total distance, lat, lon, GPS accuracy.
- `_events.csv` — GO, LAUNCH, CRUISE_REACHED, BRAKE_CUE, STOP (stop error),
  EARLY_START, UNPLANNED_STOP, MARK, RUN_END with UTC timestamps.
- `_segments.csv` — one row per stop: planned/actual distance, stop error,
  a/d target vs measured, cruise mean/std, RMSE, in-band %, dwell, verdict.
- `_run.json` — metadata, cycle definition, summary.

Times are tablet UTC. For sample-exact alignment with MF4, cross-correlate
`speed_kmh` with the CAN vehicle speed.

## Isolation
Uses the app's single GPS watch (`startWatch`); `onGPS` hands fixes to Synth
only while a synthetic run owns it. Refuses to start during navigation,
recording or route simulation. Navigation engine untouched.
Full run data is kept in IndexedDB (`gpx-synth`), summaries in localStorage.

## Bench test
`▶ Simulate on bench` runs a simulated driver at 1–20× speed.

## Verification
`node runner.js` → **1066 passed / 0 failed** (51 new in "Synthetic cycle tests").
