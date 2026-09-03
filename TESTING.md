# Testing and debugging guide

This document separates automated engine coverage from black-box browser
acceptance. Browser results must be recorded only after executing the current
build; the detailed manual procedure is in
[`docs/acceptance-test-plan.md`](docs/acceptance-test-plan.md).

## Test commands

From the repository root:

```bash
npm test
```

The aggregate command runs all three dependency-free Node suites in order:

```bash
npm run test:engine
npm run test:powers
npm run test:profile
```

To exercise the UI, start a local server and open the displayed URL in a browser:

```bash
npm start
# http://localhost:8000/index.html
```

## Automated coverage

| Suite | Coverage |
|---|---|
| `tests/simulate.mjs` | Fleet placement and boundaries; shot/sink resolution; 500 complete standard games; win/loss and event semantics; deterministic seeded fleets; all seven variants; all five AI implementations and aliases; turn quotas; 32-shot ammunition loss; Power-mode engine gates; repair/AI consistency including Hunter-family target reset; render layers; accessibility semantics; touch-target and Airstrike-order integration invariants. |
| `tests/powers.mjs` | Ability charges; earned power-up inventory; bounded scan/cross areas; contact scans; repair; Limited-ammo extra-shot capacity; per-impact Airstrike chronology and One-shot quota safety; Decoy and Stealth interception before a loss commits; One-shot affected cells; Rapid/Salvo defensive duration and quota consistency. |
| `tests/profile.mjs` | Local persistence and fallback memory storage; career totals; all six achievements; 20-match history bound; daily best records; deterministic PRNG; replay shot/action frames, multi-cell hits, per-cell results, and repaired cells. |

These suites test model and persistence behaviour without a DOM. They do not
prove layout, pointer/keyboard interaction, browser audio, focus management,
asset loading, or console cleanliness.

## Browser acceptance coverage to execute

The final run should cover at least:

- Classic and Power happy paths;
- Standard, Salvo, Rapid fire, One-shot, Compact, Armada, and Limited ammo;
- Random, Hunter, Probability, Aggressive, and Deceptive commanders;
- player victory, fleet-destroyed loss, and ammunition-exhausted loss;
- placement edges, invalid overlap/overflow, repeated targets, and board corners;
- rapid clicks, repeated keyboard input, restarting during an AI delay, and
  double activation of result/replay controls;
- deterministic same-day Daily operation and locally retained best score;
- Power abilities, earned power-ups, repair, and defensive interception;
- match history, stats, every replay step, achievements, and cosmetic
  persistence;
- repeated playthroughs and reload/reset boundaries;
- keyboard-only operation, dialog focus, and disabled enemy-grid state;
- wide desktop, tablet, 390 px mobile, and 320 px narrow-mobile layouts; and
- browser console errors/warnings, unhandled promise rejections, and asset 404s.

Record the browser, version, viewport, date/time zone, commit, and whether local
storage began empty. Do not treat an earlier Classic-only run as evidence for the
expanded build.

## Current execution record

The expanded build was verified on 2026-09-01 from `codex/power-mode` before its
release commit. The shell did not expose `npm`, so the three scripts referenced
by `npm test` were executed directly with the bundled Node runtime. Each command
completed successfully.

| Run | Environment | Result | Evidence / notes |
|---|---|---|---|
| Headless aggregate | Bundled Node, macOS | Pass | Syntax check plus `tests/simulate.mjs`, `tests/powers.mjs`, and `tests/profile.mjs`; 500 simulated complete games and all deterministic assertions passed. `git diff --check` also passed. |
| Desktop browser | Codex in-app Chromium, 1280 px | Pass | Completed Classic victory/defeat and Power happy paths; verified abilities, earned power-ups, Daily determinism, One-shot, Restart during the result delay, replay, history, cosmetics, keyboard-only deployment/battle, and clean fresh-page console capture. A completed Airstrike replay showed the action at step 35 before its impact at step 36. |
| Tablet/mobile browser | Same browser, 1024/768/390/320 px | Pass | At each width `scrollWidth === clientWidth`; boards stayed square and changed from two columns to one as space narrowed. Compact rendered 64 cells/eight columns at 320 px; history replay targets are 44 px. |

## Pre-implementation findings requiring regression coverage

The expanded work began only after these findings were reported and prioritized.
Their presence here defines mandatory regressions; it is not a claim that the
current browser build has passed them.

### F-01 — P1: delayed result overlay could appear after Restart

- Reproduction: fire the match-ending shot, then activate **Restart** during the
  short delay before the result dialog appears.
- Expected: the new setup remains visible with no stale result dialog.
- Previously observed: the completed match's dialog could open over the reset
  game.
- Likely cause: a pending result timer survived reset.
- Regression: test Restart at several points around the final-shot delay and
  confirm no later overlay, state change, or focus theft.

### F-02 — P1: ship selection was not keyboard-accessible

- Reproduction: load setup and attempt to select, place, move, and rotate every
  ship using only <kbd>Tab</kbd>, <kbd>Enter</kbd>/<kbd>Space</kbd>, arrows or
  documented grid navigation, and <kbd>R</kbd>.
- Expected: the full setup path is operable with visible focus and announced
  state.
- Previously observed: pointer interaction was required to select ships.
- Likely cause: tray items lacked complete interactive keyboard semantics.
- Regression: complete deployment and start a match without a pointer.

### F-03 — P1: 320 px layout overflowed horizontally

- Reproduction: open at a 320 CSS-pixel viewport and inspect the entire page from
  top to bottom.
- Expected: `scrollWidth <= clientWidth`; all controls, boards, profile cards, and
  dialogs remain reachable.
- Previously observed: approximately 39 px of horizontal clipping/overflow.
- Likely cause: narrow-layout minimum widths and padding exceeded the viewport.
- Regression: measure overflow at 320 px and visually inspect board/replay cell
  alignment.

### F-04 — P2: enemy cells were focusable during setup

- Reproduction: load a fresh setup and tab through the page before starting.
- Expected: inactive enemy cells are disabled or removed from sequential focus.
- Previously observed: they remained enabled/focusable despite having no valid
  action.
- Likely cause: visual inactivity was not mirrored in native/ARIA interaction
  state.
- Regression: enumerate focus order in setup, player turn, AI turn, and game-over
  phases.

## Power-mode browser acceptance run (2026-09-02)

Executed against `99ca797` on Chrome at 1280×800 with a 390×844 spot check, local
storage starting empty, serving the repository with `python3 -m http.server 8000`.
All actions were driven through the UI; `window.battleship.game` and
`window.battleship.powerState` were read only as a ground-truth oracle.

Passed: all five ship abilities (arming, single-charge consumption, report
accuracy against the fleet, and Salvo holding the turn across its extra shots);
ability gating once the owning ship sinks; the power-up earn rule
(`floor(hits / 3) + shipsSunk`, including a shot that both landed the third hit
and sank a ship and correctly granted two awards); the full award cycle through a
wrap; every power-up effect, including Airstrike clipping to three sectors at a
corner and four at an edge, Repair preferring a damaged unsunk ship over a more
damaged sunk one, Decoy converting the next enemy hit to a miss, and Stealth
expiring after exactly two enemy turns; Restart while an ability was armed and a
Salvo volley half-spent; Play again after victory; three consecutive matches
without state bleed; a clean console; no asset 404s; and no horizontal overflow at
390 px.

### P-01 — P3: clipped scans reported the nominal sector size

- Reproduction: Power mode, Classic rules, any commander. Randomize, start the
  battle, arm **Cruiser Radar**, and select a corner cell such as A1 or J10.
- Expected: the log describes the area actually scanned, since a corner scan can
  only cover nine cells.
- Actual at discovery: the log read `3 unhit contacts in 5×5 sector` while only
  the nine-cell corner block highlighted. **Destroyer Sonar** reported
  `3×3 sector` for a four-cell corner scan. Contact counts were correct in every
  case, verified at 7/25 (F6), 3/9 (J10), 0/9 (A1), and 0/4 (Sonar at A1).
- Root cause: `scanResult` derived the label from the radius after `cellsInArea`
  had already clipped the cell list, so the label could never reflect clipping.
- Implemented fix: the label keeps its nominal span only when the scan covers the
  full square, and otherwise reports the scanned cell count.
- Regression: `tests/powers.mjs` asserts the nominal label for interior scans and
  the clipped label for corner scans of both radii.

Carrier Recon (`row N`) and the Radar Scan power-up (`in the sector`) make no size
claim and were unaffected.

Not covered by this run: the six non-Classic rule variants, the commanders other
than Random, Hunter, and Aggressive, the Daily challenge, replays, and profile
persistence.

## Drag deployment browser acceptance run (2026-09-02)

Executed against `3d732b4` on Chrome at 1280×800 and 390×844, serving the
repository with `python3 -m http.server 8000`. Every drag was a genuinely held
pointer drag — press, several moves, an observation while still held, then
release — because a synthesized click cannot exercise pointer dragging.
`window.battleship` was read only as a ground-truth oracle.

Passed: the carried hull tracking the pointer with a valid preview at both
viewports; an illegal destination tinting the hull and refusing the drop; an
off-board release and an `Escape` cancellation both leaving the fleet untouched;
repositioning keeping the grabbed section under the pointer (grabbing the
Carrier's third section and releasing on C2 produced A2–E2); rotating mid-drag
flipping the hull and the preview; exactly one ship placed per drop with no stray
sprite or stale preview; Restart while a drag was held clearing all drag state;
Randomize and the **Start battle** gate; a Power-mode smoke test including
Cruiser Radar and the Radar Scan power-up matching the oracle; a clean console;
and no asset 404s.

### D-01 — P2: the first board click after a drop was discarded

- Reproduction before the fix: with a cleared board, drag the Carrier from the
  tray onto the board and release. The Battleship becomes selected. Click once on
  a legal empty cell.
- Expected: the click places the selected ship, since click-to-place remains a
  supported path.
- Actual at discovery: nothing happened and a second click was required. The
  oracle read `{"ships":1,"battleshipPlaced":false}` after the first click. A
  capture-phase listener confirmed the event reached a valid cell, so the app
  discarded it. Reproduced at 390×844 as well.
- Root cause: `endDrag` latched a boolean expecting the compatibility `click`
  that follows `pointerup`, but the pointer handlers call `preventDefault()`, so
  that click never arrives. The flag was never consumed and swallowed the next
  genuine click.
- Implemented fix: the guard records the drop time and the dropped-on cell, and
  the click handler discards a click only when it lands on that same cell inside
  `CLICK_AFTER_DROP_MS`, consuming the guard on first use.
- Regression: `tests/simulate.mjs` asserts the guard is cell-scoped, one-shot, and
  that the latching boolean is gone. Since that assertion is a source check, the
  acceptance gate also requires drag-then-single-click in the browser.

Not covered by this run: right-click rotation mid-drag (the `R` key was used
instead), desktop rows 7–10, which sat below the fold, and every non-placement
feature beyond the Power smoke test.

## Historical Classic-baseline defects

These earlier defects remain useful regression context.

### H-01 — Hit/miss markers and effects painted below ship sprites

- Reproduction before the fix: let the AI hit a player ship and inspect the
  marker over the sprite.
- Expected: hit marker and blast/smoke effects appear above the ship.
- Actual at discovery: markers were visible only on unobstructed water.
- Root cause: cell pseudo-elements painted below the later sibling ship layer.
- Implemented protection: dedicated marker layers follow ship layers; the engine
  suite statically checks layer order and marker selectors.

### H-02 — Missing favicon produced an asset 404

- Reproduction before the fix: load the page with DevTools Network/Console open.
- Expected: no failed requests.
- Actual at discovery: the browser requested `/favicon.ico` and received 404.
- Root cause: no declared icon.
- Implemented protection: `assets/img/favicon.svg`, a document link, and a static
  headless invariant. The browser run must still confirm all assets return 200.

### H-03 — Rapid multi-cell clicking was initially suspected to allow two turns

- Observation: real clicks separated by more than the AI response delay could
  look like a burst registering extra player shots.
- Investigation result: a synchronous click burst was rejected by the phase/busy
  guard; spaced clicks represented legal alternating turns.
- Regression: burst distinct cells faster than the AI delay and assert one player
  shot, then repeat with controlled spacing and assert legal alternation.

## Failure report format

Every failure must be reported before any corresponding code change:

1. ID and priority (`P0` release blocker through `P3` minor).
2. Exact numbered reproduction steps, including mode, variant, AI, viewport, and
   starting storage state.
3. Expected behaviour.
4. Actual behaviour.
5. Supporting evidence: screenshot/video path, console text, network request, DOM
   state, or repeat count.
6. Likely root cause, clearly labelled as a hypothesis until confirmed.
7. A regression test at the lowest useful layer plus a black-box retest.

After fixes, append the command or browser procedure rerun and its actual result;
do not replace the original failure evidence.
