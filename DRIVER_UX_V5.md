# GPX Navigator Driver UX v5

## Direct UX iteration

This iteration is presentation-only and keeps the Navigation/Playback engine frozen.

### Changes
- Recomposed the Driver Mode around a single, compact guidance card.
- Guidance distance and arrow are substantially larger and easier to scan.
- Playback wording now uses `Continue on route` / `Follow the road` for non-turn geometry instead of `Follow left/right`.
- Larger on-map guidance marker.
- Larger bus marker in Driver Mode.
- Tighter visual treatment of the map tiles for better road/label contrast.
- Rebuilt Next Stop as a compact bottom-right driver dock with photo and event chips visible at the same time.
- Route Stops is hidden in normal Driver Mode and becomes a dedicated sheet only when explicitly opened.
- Progress bar is compact and no longer competes with the stop card.
- Responsive rules target the portrait tablet layout shown in field screenshots.
- Service-worker cache bumped to `gpx-nav-v36-driver-ux5`.

### Frozen components
No Navigation Engine, matcher, stop matching, timestamp anchoring, Playback state machine, Lap Manager, or Voice Scheduler thresholds were changed.

### Verification
`node runner.js`

**422 passed / 0 failed / exit=0**
