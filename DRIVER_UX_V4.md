# Driver UX v4

## Implemented directly in the project

- Reworked Playback guidance HUD into a large, glanceable navigation card.
- Playback guidance is now driven by the existing presentation-layer `computeGuidance()` geometry.
- Generic turn voice remains suppressed during Playback; stop/event voice ownership is unchanged.
- Guidance arrow is now large SVG in the HUD and larger on-map.
- Vehicle marker is 56 px plus a visual scale-up for stronger presence, without changing the frozen test contract.
- Playback map zoom tightened: 18.5 / 18.1 / 17.8 / 17.4 by speed.
- Vehicle is kept low on screen with more road visible ahead.
- Next Stop card moved to lower-right and enlarged.
- Stop photo enlarged and event chips made larger.
- Live Cycle metrics are hidden in Driver Mode to reduce clutter.
- Route Stops drawer is closed automatically when navigation starts.
- Legacy stop photo overlay is hidden in Driver Mode so the Next Stop card is the single photo owner.
- Responsive rules added for the ~768 CSS-pixel portrait tablet viewport where the previous `min-width:900px` rules did not apply.
- Service-worker cache version bumped to `gpx-nav-v35-driver-ux4`.

## Frozen engine

No Navigation Engine functions or NAV tuning constants were intentionally changed.

## Verification

`node runner.js`

**422 passed / 0 failed / exit=0**

The existing fixture warning `STOP_TIMESTAMP_MISSING` is expected and is covered by the existing guardrail test.
