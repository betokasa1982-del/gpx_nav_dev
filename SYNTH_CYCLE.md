# SYNTH v2 — Drive-cycle execution, driver guidance and logging (v64)

Mode inside GPX Navigator DEV (rail tab **SYNTH**) for repeatable multi-vehicle
drive-cycle tests — e.g. energy comparison of buses on a test track. Built as a
PWA extension of the *Drive Cycle Test — Master Specification*; the parts that
need a native Android app are listed under **Not covered**.

## Workflow
1. **Cycle builder** — segment cards, speed-vs-time graph, cycle ID.
2. **Test setup** — vehicle, driver, test ID, track, comments, language
   (Svenska / English), audio, guidance tolerances.
3. **Pre-test check** — GNSS fix + accuracy, IMU, audio, logging/storage,
   language, cycle summary → **START TEST** → 5-4-3-2-1 → reference starts.
4. **Drive screen** — current / reference / error, one large command, actual vs
   target acceleration, next phase with countdown, 5 s history + 10 s ahead graph.
   Only controls: **⚑ SYNC** and **■ STOP** (press and hold 1 s to abort).
5. **Results** — %-in-tolerance, RMSE, max errors (speed and acceleration),
   reference-vs-actual plots, per-segment verdicts, export.
6. **Comparison** — tick two or more runs; same-cycle / sim-mix checks.

## Cycle model
A cycle is a sequence of segments. Each segment: **target speed**, a
**definition** (by rate m/s² *or* by time-to-target s — per segment), and a
**hold** (seconds, or metres when moving). The start speed is inherited from the
previous segment. Phase type is automatic: target > start → Acceleration,
target < start → Deceleration (Retardation), equal → Constant speed, 0 km/h
with hold → Pause / standstill. SI units internally; km/h in the UI.

Examples (verified in tests): 0→50 km/h at 0.50 m/s² = 27.8 s; 0→50 in 20 s =
+0.694 m/s²; 50→20 in 15 s = −0.556 m/s².

**Cycle ID** (e.g. `47DE-BDC2`) fingerprints everything that is driven
(reference mode, laps, every segment value). Name and countdown are excluded.
Same ID on every vehicle = same cycle. Share / import cycles as JSON.

**Validation** rejects (with a message per field): non-numbers, NaN, Infinity,
negative or zero durations, rates outside 0.05–3 m/s², transitions < 0.5 s or
> 600 s, speeds outside 0–120 km/h, holds in metres at 0 km/h, laps > 1 that do
not end at 0 km/h, cycles that never move or exceed 4 h. Invalid cycles cannot
start. Decimal comma accepted.

## Reference modes
- **Time-locked** (default, spec §2/§22): `v_ref(t)`, `a_ref(t)` run from GO and
  **never move or stretch** for the driver. A declared end hold is part of the
  cycle; after the reference ends, logging continues until the bus stands
  (max 120 s, command STOP).
- **Position-locked** (stop-to-stop, from v1): each section between standstills
  follows `v_ref(s)`; stops land on fixed marks; waits are timed from the
  actual stop. Stop error, unplanned stops and early starts are recorded.
  Consecutive standstills are merged into one wait.

## Driver guidance (spec §14–17)
`e_v = v_ref − v_actual`, `e_a = a_ref − a_actual` (positive = too slow / too
little acceleration). Each error is classified 0 / ±1 / ±2 against tolerances
(defaults: speed 1 / 2 km/h, acceleration 0.10 / 0.20 m/s²; configurable).
- **Hysteresis**: a level is entered above its threshold and left only below
  threshold × 0.75 (0.20 → 0.15 m/s²). Direction flips start fresh.
- **Stable period**: a new command must persist 400 ms before it is shown.
- **Settling window**: the first 600 ms of a phase show the phase's default
  command (the vehicle cannot follow a step in a_ref instantly).
- Combination: a large speed error always wins; otherwise acceleration error
  leads (guidance reacts before a speed error builds up); opposite signs →
  neutral; at constant speed within tolerance → HOLD.

| Phase | Result | Command (EN / SV) |
|---|---|---|
| Acceleration | on profile | ACCELERATE / GASA |
| | too little | ACCELERATE MORE / GASA MER |
| | far too much | RELEASE THROTTLE / SLÄPP GAS |
| Constant | within tolerance | HOLD / HÅLL |
| | below / far below | ACCELERATE / ACCELERATE MORE |
| | above / far above | RELEASE THROTTLE / BRAKE |
| Deceleration | on profile | BRAKE / BROMSA |
| | too weak | BRAKE MORE / BROMSA MER |
| | too strong | REDUCE BRAKING / MINSKA BROMS |
| Pause | stationary / moving | STANDSTILL / STOP |

Colour + glyph + text (never colour alone). Look-ahead: next phase with
countdown; beeps at 3-2-1 s before each transition; the phase command is spoken
at the transition (audio optional, sv-SE / en-US voices).

## Sensors
**GNSS** — the app's single geolocation watch (navigation engine untouched).
Doppler speed when reported; if not, speed is derived from position only when
the displacement exceeds the position noise (else unknown, never 0). Jumps are
judged against the last accepted position widened by both accuracies; 3
mutually consistent candidates (2 if far more accurate) re-anchor. Impossible
speed steps (> 5 m/s²) rejected. Stale > 2.5 s, lost > 5 s: speed and errors
become null, command NO GPS, reference continues. Raw fixes are always kept.

**IMU** — `devicemotion` accelerationIncludingGravity. Gravity is levelled only
while GPS reports standstill on two fixes *and* the IMU sees no horizontal
acceleration. The forward axis is found automatically by correlating the
horizontal IMU vector with GPS acceleration during the first accelerations
(any mounting yaw). Longitudinal acceleration filtered with a first-order low
pass, τ = 0.3 s (≈ 0.3 s delay). Checked continuously against GPS acceleration;
if they disagree (RMS > 0.35 m/s²) GPS acceleration is used. Between 1 Hz fixes
speed is carried forward with the IMU (or GPS) acceleration for ≤ 1.5 s.

Phone-IMU limits: road grade reads as acceleration (g·sinθ ≈ 0.1 m/s² per 1 %
grade — re-levelled at every stop); mounting must be rigid; vibration raises
noise. GPS-derived acceleration lags ≈ 0.5–1 s.

## Timebase and logging (spec §24–26)
Clock = UTC anchor taken at START (`Date.now`) + monotonic `performance.now`
delta. `Elapsed_Time_s` is zero at the START press. Wall-clock drift > 1 s is
logged as `CLOCK_DRIFT`; GNSS timestamps > 3 s off are replaced by receive time
and flagged `TS_REPLACED`. Main log **10 Hz nominal** (not 50 Hz — see below);
GNSS (~1 Hz) and IMU (~60 Hz) keep their own timestamps plus data age.

Log columns (stable English names): Elapsed_Time_s, UTC_Time_ms, GPS_Speed_kmh,
GPS_Latitude, GPS_Longitude, GPS_Accuracy_m, GPS_Measurement_UTC_ms,
GPS_Data_Age_s, IMU_Accel_X/Y/Z_Raw, IMU_Data_Age_s,
Longitudinal_Acceleration_Raw/_Filtered, Acceleration_Source,
Actual_Speed_kmh, Actual_Acceleration, Reference_Speed_kmh,
Reference_Acceleration, Speed_Error_kmh, Acceleration_Error, Reference_Time_s,
Reference_Distance_m, Actual_Distance_m, Distance_Error_m, Cycle_ID, Lap,
Segment_ID, Phase, Driver_Command, Next_Phase, Time_To_Next_Phase_s,
Within_Speed_Tolerance, Within_Acceleration_Tolerance, Quality_Flags, Simulated.

Quality flags: GPS_STALE, GPS_LOST, GPS_WEAK, NO_SPEED, SPEED_DERIVED,
SPEED_JUMP, POS_JUMP, REANCHOR, TS_REPLACED, STILL_BY_POSITION, IMU_CAL,
IMU_SUSPECT, SIM. Events: RUN_START, GO, PHASE, LAUNCH, STOP, UNPLANNED_STOP,
EARLY_START, STOP_INFERRED, EVENT_SYNC_nn, GPS_LOST/OK, GPS_REANCHOR,
IMU_CALIBRATED/SUSPECT, CLOCK_DRIFT, APP_HIDDEN/VISIBLE, RUN_END, ABORT.

**Storage**: run data in IndexedDB, appended in 5 s chunks (flushed also when
the app is hidden); summaries in localStorage. A run cut off by a crash shows as
INTERRUPTED and stays exportable up to the last chunk.

## Results and verdict (spec §28–29)
Speed / acceleration statistics use rows in Acceleration, Constant and
Deceleration phases (plus Pause in time mode). Acceleration statistics skip the
first 1 s of each phase (settling). Segment verdict **CHECK** when: speed
in-tolerance < 85 %, acceleration in-tolerance < 70 %, |stop error| > 10 m,
unplanned stop, early start, or too few valid samples (NO / LOW DATA). Run
verdict VALID only when complete and every segment is OK.

## Exports (spec §30–31)
- `_log.csv`, `_events.csv`, `_segments.csv`, `_gnss_raw.csv` — English columns.
- `.dtraw.json` — **DriveTest RAW v1**, lossless: log, raw GNSS, raw IMU,
  events, cycle, plan, settings, timebase, summary. Re-export and
  **📥 Import RAW** work from it.
- `.asc`, `.blf` + `DriveTest_signals.dbc` — application signals as CAN frames on
  channel 1, standard IDs 0x700–0x705, Intel, one set per log row + DT_Event per
  event (SYNC markers included):

| ID | Message | Signals |
|---|---|---|
| 0x700 | DT_Speed | ActualSpeed, ReferenceSpeed, SpeedError, GpsSpeed (0.01 km/h) |
| 0x701 | DT_Accel | ActualAccel, ReferenceAccel, AccelError, LongAccelFiltered (0.001 m/s²) |
| 0x702 | DT_State | SegmentID, Lap, Phase, Command, TimeToNextPhase (0.1 s), QualityFlags |
| 0x703 | DT_Distance | ActualDistance (0.01 m), DistanceError (0.1 m), GpsDataAge, GpsAccuracy |
| 0x704 | DT_Position | Latitude, Longitude (1e-7°) |
| 0x705 | DT_Event | EventCode, EventNumber, EventSegment, EventValue |

Missing values are **not available** (raw all-ones / most-negative), never 0.
BLF: CAN_MESSAGE objects in zlib log containers, same layout as python-can's
writer; header start time in UTC. ASC header date in tablet local time.
`tools/validate_drivetest.py` checks an export on the laptop (python-can,
cantools, pandas).

## Simulation (spec §38)
Seeded simulator feeding the same GNSS/IMU paths: Perfect following, Typical
driver, Constant 2 km/h low, Insufficient acceleration, Retardation too weak,
Retardation too strong, Noisy sensors + IMU bias (40° mounting yaw), GNSS
dropout 8 s every 40 s. Runs are flagged SIM everywhere (list, results, file
names, log column, CAN flag bit 7); the comparison warns when sim and real runs
are mixed.

## Verification
`node runner.js` → **1239 passed / 0 failed** (223 in "Synthetic cycle v2").

| Test | Spec | What | Status |
|---|---|---|---|
| SYN-REF-1 | §8, §22 | calculation examples, inheritance, continuity, END/PRE | PASS |
| SYN-VAL-1 | §9 | 18 invalid cases rejected with messages | PASS |
| SYN-FUZZ-1 | §40 | 500 random cycles: no crash / NaN / ∞, monotonic, continuous | PASS |
| SYN-ID-1 | §33 | cycle ID stable across share/import | PASS |
| SYN-GUIDE-1 | §14–16 | all commands incl. §14 and §16 examples | PASS |
| SYN-HYST-1 | §17, scen. F | 0.20/0.15 hysteresis, stable period, no flicker | PASS |
| SYN-SCN-A | §39 A | perfect following: 99.6 % in ±1 km/h, RMSE 0.15 | PASS |
| SYN-IMU-1 | §20 | 25° mounting yaw: axis found, IMU used 90 %, offset −0.03 m/s² | PASS |
| SYN-SCN-B | §39 B | 2 km/h low → ACCELERATE on 98 % of constant rows | PASS |
| SYN-SCN-C | §39 C | weak acceleration → ACCELERATE MORE at 1.7 km/h error | PASS |
| SYN-SCN-D/E | §39 D/E | BRAKE MORE / REDUCE BRAKING | PASS |
| SYN-SCN-G | §39 G | GNSS dropout: flagged, no fabricated speed, completes | PASS |
| SYN-SCN-N | §38 | noisy sensors + IMU bias | PASS |
| TIME-1, LOG-1, REF-2 | §2, §24–26 | monotonic elapsed = UTC, 10 Hz, reference never moves | PASS |
| SYN-POS-1/2 | — | stop-to-stop mode, stale fixes, unplanned stop, early start | PASS |
| SYN-GNSS-1 | §19 | null speed, jitter, jumps, re-anchor, start without fix | PASS |
| SYN-REG-1 | — | 17 regressions from the independent code review | PASS |
| SYN-EXP-1 | §27, §30–31 | CSV, RAW round trip, ASC, BLF, DBC, SYNC markers | PASS |
| Export validation | §30 | browser-made BLF/ASC read by python-can 4.6, decoded by cantools; CAN = CSV within 0.005 km/h | PASS |
| SYN-I18N-1 | §3, §32 | sv/en complete (196 strings), spec wording, no "Ramp" | PASS |
| SYN-ISO-1 | — | single GPS watch, navigation isolation | PASS |
| SYN-SAFE-1 | §35 | configuration locked, hold-to-abort | PASS |
| UI walk-through | §10–13 | headless Chromium 1280×800 and 800×1280, sv + en | PASS |
| Persistence | §33 | results reopened from IndexedDB after reload | PASS |
| On-bus test, Galaxy Tab S10 FE | — | real GNSS/IMU, audio, wake lock, long run | NOT EXECUTED |
| BLF/ASC in CANalyzer / CANoe | §30 | Vector tools | NOT EXECUTED |
| Filter latency on device | §21 | measured delay | NOT EXECUTED (design value τ = 0.3 s) |

## Not covered (native-app parts of the spec)
- Native Kotlin/Compose app, Room, DI, foreground service (§4, §34): the PWA
  keeps the screen awake but Android may pause sensors if the app is
  backgrounded — the log records APP_HIDDEN/APP_VISIBLE.
- 50 Hz synchronised main log (§26): 10 Hz nominal; raw IMU at device rate.
- IMU calibration UI (§20): automatic only.
- QA PDF, release build, Android lint (§42–47): not applicable to this PWA.
