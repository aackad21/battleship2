# Testing and debugging report

This document is the single debug report for the repository. It records the
automated coverage, the defect register in one standard format, the validation
state of every fix, and the browser runs that produced the evidence. The
detailed manual procedure lives in
[`docs/acceptance-test-plan.md`](docs/acceptance-test-plan.md).

Browser results are recorded only after executing the build named in the run.

## Validated fixes at a glance

Every defect ever raised against this build, with the state of its validation.
"Browser-validated" means the fixed behaviour was retested through the UI on the
listed commit; "statically guarded" means only a Node/source assertion protects
it today.

| ID | Priority | Defect | Fix landed | Validation |
|---|---|---|---|---|
| [P-01](#p-01--p3-clipped-scans-reported-the-nominal-sector-size) | P3 | Clipped Radar/Sonar scans reported the nominal sector size | [#2](https://github.com/aackad21/battleship2/pull/2) (`c5d2fdb`) | **Browser-validated** on `0c10f4f`, plus `tests/powers.mjs` |
| [D-01](#d-01--p2-the-first-board-click-after-a-drop-was-discarded) | P2 | First board click after a drag drop was swallowed | [#3](https://github.com/aackad21/battleship2/pull/3) (`3aa72b5`) | **Browser-validated** on `3aa72b5` at 1280×800 and 390×844, plus `tests/simulate.mjs` |
| [H-01](#h-01--p1-hitmiss-markers-and-effects-painted-below-ship-sprites) | P1 | Hit/miss markers painted below ship sprites | Classic baseline | **Browser-validated** on the Classic baseline; layer order statically guarded |
| [H-02](#h-02--p2-missing-favicon-produced-an-asset-404) | P2 | Missing favicon produced a `/favicon.ico` 404 | Classic baseline | **Browser-validated**; every later browser run re-asserts zero asset 404s |
| [H-03](#h-03--not-a-defect-rapid-multi-cell-clicking-suspected-to-allow-two-turns) | — | Rapid clicking suspected to grant two turns | No change needed | **Not a defect**; the phase/busy guard rejects a click burst |
| [F-01](#f-01--p1-delayed-result-overlay-could-appear-after-restart) | P1 | Delayed result overlay could appear after Restart | Power-mode build (`99ca797`) | **Browser-validated** on `99ca797` |
| [F-02](#f-02--p1-ship-selection-was-not-keyboard-accessible) | P1 | Ship selection was not keyboard-accessible | Power-mode build (`99ca797`) | **Browser-validated** on `99ca797` (keyboard-only deployment); semantics statically guarded |
| [F-03](#f-03--p1-320-px-layout-overflowed-horizontally) | P1 | 320 px layout overflowed horizontally | Power-mode build (`99ca797`) | **Browser-validated** on `99ca797` (`scrollWidth === clientWidth` at 320/390/768/1024 px) |
| [F-04](#f-04--p2-enemy-cells-were-focusable-during-setup) | P2 | Enemy cells were focusable during setup | Power-mode build (`99ca797`) | **Statically guarded** by the accessibility assertions in `tests/simulate.mjs`; focus order not re-enumerated since |

No defect in the register is currently open.

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
| `tests/simulate.mjs` | Fleet placement and boundaries; shot/sink resolution; 500 complete standard games; win/loss and event semantics; deterministic seeded fleets; all seven variants; all five AI implementations and aliases; turn quotas; 32-shot ammunition loss; Power-mode engine gates; repair/AI consistency including Hunter-family target reset; render layers; accessibility semantics; touch-target and Airstrike-order integration invariants; the cell-scoped one-shot click-after-drop guard; the heads-up card markup, transparency, lifetime, and new-game teardown. |
| `tests/powers.mjs` | Ability charges; earned power-up inventory; bounded scan/cross areas; contact scans; clipped versus nominal scan labels; repair; Limited-ammo extra-shot capacity; per-impact Airstrike chronology and One-shot quota safety; Decoy and Stealth interception before a loss commits; One-shot affected cells; Rapid/Salvo defensive duration and quota consistency. |
| `tests/profile.mjs` | Local persistence and fallback memory storage; career totals; all six achievements; 20-match history bound; daily best records; deterministic PRNG; replay shot/action frames, multi-cell hits, per-cell results, and repaired cells. |

These suites test model, source-level, and persistence behaviour without a DOM.
They do not prove layout, pointer/keyboard interaction, browser audio, focus
management, asset loading, or console cleanliness.

## Defect register

Every entry uses the same fields: reproduction, expected, actual at discovery,
root cause, fix, regression, and validation.

### P-01 — P3: clipped scans reported the nominal sector size

- **Reproduction:** Power mode, Classic rules, any commander. Randomize, start
  the battle, arm **Cruiser Radar**, and select a corner cell such as A1 or J10.
- **Expected:** the log describes the area actually scanned, since a corner scan
  can only cover nine cells.
- **Actual at discovery:** the log read `3 unhit contacts in 5×5 sector` while
  only the nine-cell corner block highlighted. **Destroyer Sonar** reported
  `3×3 sector` for a four-cell corner scan. Contact counts were correct in every
  case, verified at 7/25 (F6), 3/9 (J10), 0/9 (A1), and 0/4 (Sonar at A1).
- **Root cause:** `scanResult` derived the label from the radius after
  `cellsInArea` had already clipped the cell list, so the label could never
  reflect clipping.
- **Fix:** the label keeps its nominal span only when the scan covers the full
  square, and otherwise reports the scanned cell count
  ([#2](https://github.com/aackad21/battleship2/pull/2)).
- **Regression:** `tests/powers.mjs` asserts the nominal label for interior scans
  and the clipped label for corner scans of both radii.
- **Validation:** browser-validated on `0c10f4f` — corner and edge scans report
  the clipped cell count with counts still matching the fleet oracle.

Carrier Recon (`row N`) and the Radar Scan power-up (`in the sector`) make no size
claim and were unaffected.

### D-01 — P2: the first board click after a drop was discarded

- **Reproduction:** with a cleared board, drag the Carrier from the tray onto the
  board and release. The Battleship becomes selected. Click once on a legal empty
  cell.
- **Expected:** the click places the selected ship, since click-to-place remains
  a supported path.
- **Actual at discovery:** nothing happened and a second click was required. The
  oracle read `{"ships":1,"battleshipPlaced":false}` after the first click. A
  capture-phase listener confirmed the event reached a valid cell, so the app
  discarded it. Reproduced at 390×844 as well.
- **Root cause:** `endDrag` latched a boolean expecting the compatibility `click`
  that follows `pointerup`, but the pointer handlers call `preventDefault()`, so
  that click never arrives. The flag was never consumed and swallowed the next
  genuine click.
- **Fix:** the guard records the drop time and the dropped-on cell, and the click
  handler discards a click only when it lands on that same cell inside
  `CLICK_AFTER_DROP_MS`, consuming the guard on first use
  ([#3](https://github.com/aackad21/battleship2/pull/3)).
- **Regression:** `tests/simulate.mjs` asserts the guard is cell-scoped,
  one-shot, and that the latching boolean is gone. Because that assertion is a
  source check, the acceptance gate also requires drag-then-single-click in the
  browser.
- **Validation:** browser-validated on `3aa72b5` — drag-then-single-click places
  the next ship on the first click at both 1280×800 and 390×844.

### H-01 — P1: hit/miss markers and effects painted below ship sprites

- **Reproduction:** let the AI hit a player ship and inspect the marker over the
  sprite.
- **Expected:** the hit marker and blast/smoke effects appear above the ship.
- **Actual at discovery:** markers were visible only on unobstructed water.
- **Root cause:** cell pseudo-elements painted below the later sibling ship layer.
- **Fix:** dedicated marker layers follow the ship layers.
- **Regression:** the engine suite statically checks layer order and marker
  selectors.
- **Validation:** browser-validated on the Classic baseline; every later run
  observed markers over hulls.

### H-02 — P2: missing favicon produced an asset 404

- **Reproduction:** load the page with DevTools Network/Console open.
- **Expected:** no failed requests.
- **Actual at discovery:** the browser requested `/favicon.ico` and received 404.
- **Root cause:** no declared icon.
- **Fix:** `assets/img/favicon.svg` plus a document link.
- **Regression:** a static headless invariant, and every browser run asserts zero
  asset 404s.
- **Validation:** browser-validated; the 2026-09-02 runs recorded no 404s.

### H-03 — not a defect: rapid multi-cell clicking suspected to allow two turns

- **Observation:** real clicks separated by more than the AI response delay could
  look like a burst registering extra player shots.
- **Investigation result:** a synchronous click burst was rejected by the
  phase/busy guard; spaced clicks represented legal alternating turns.
- **Regression:** burst distinct cells faster than the AI delay and assert one
  player shot, then repeat with controlled spacing and assert legal alternation.
- **Validation:** no code change was warranted.

### F-01 — P1: delayed result overlay could appear after Restart

- **Reproduction:** fire the match-ending shot, then activate **Restart** during
  the short delay before the result dialog appears.
- **Expected:** the new setup remains visible with no stale result dialog.
- **Actual at discovery:** the completed match's dialog could open over the reset
  game.
- **Root cause:** a pending result timer survived reset.
- **Fix:** landed with the Power-mode build (`99ca797`).
- **Regression:** Restart at several points around the final-shot delay,
  confirming no later overlay, state change, or focus theft.
- **Validation:** browser-validated on `99ca797`.

### F-02 — P1: ship selection was not keyboard-accessible

- **Reproduction:** load setup and attempt to select, place, move, and rotate
  every ship using only <kbd>Tab</kbd>, <kbd>Enter</kbd>/<kbd>Space</kbd>, arrows
  or documented grid navigation, and <kbd>R</kbd>.
- **Expected:** the full setup path is operable with visible focus and announced
  state.
- **Actual at discovery:** pointer interaction was required to select ships.
- **Root cause:** tray items lacked complete interactive keyboard semantics.
- **Fix:** landed with the Power-mode build (`99ca797`).
- **Regression:** the accessibility assertions in `tests/simulate.mjs`, plus
  completing deployment and starting a match without a pointer.
- **Validation:** browser-validated on `99ca797` via keyboard-only deployment and
  battle.

### F-03 — P1: 320 px layout overflowed horizontally

- **Reproduction:** open at a 320 CSS-pixel viewport and inspect the entire page
  from top to bottom.
- **Expected:** `scrollWidth <= clientWidth`; all controls, boards, profile cards,
  and dialogs remain reachable.
- **Actual at discovery:** approximately 39 px of horizontal clipping/overflow.
- **Root cause:** narrow-layout minimum widths and padding exceeded the viewport.
- **Fix:** landed with the Power-mode build (`99ca797`).
- **Regression:** measure overflow at 320 px and inspect board/replay cell
  alignment.
- **Validation:** browser-validated on `99ca797` — `scrollWidth === clientWidth`
  at 1024, 768, 390, and 320 px, with Compact rendering 64 cells at 320 px.

### F-04 — P2: enemy cells were focusable during setup

- **Reproduction:** load a fresh setup and tab through the page before starting.
- **Expected:** inactive enemy cells are disabled or removed from sequential
  focus.
- **Actual at discovery:** they remained enabled/focusable despite having no valid
  action.
- **Root cause:** visual inactivity was not mirrored in native/ARIA interaction
  state.
- **Fix:** landed with the Power-mode build (`99ca797`).
- **Regression:** enumerate focus order in setup, player turn, AI turn, and
  game-over phases.
- **Validation:** statically guarded only. The disabled enemy-grid state has been
  observed, but focus order has not been re-enumerated across all four phases
  since `99ca797`.

## Execution record

| Date | Build | Environment | Result | Scope and evidence |
|---|---|---|---|---|
| 2026-09-01 | `codex/power-mode` pre-release | Bundled Node, macOS | Pass | Syntax check plus all three suites; 500 simulated complete games; `git diff --check` clean. `npm` was unavailable, so the scripts were run directly. |
| 2026-09-01 | `codex/power-mode` pre-release | Chromium, 1280 px | Pass | Classic victory/defeat and Power happy paths; abilities, earned power-ups, Daily determinism, One-shot, Restart during the result delay, replay, history, cosmetics, keyboard-only play, clean console. A completed Airstrike replay showed the action at step 35 before its impact at step 36. Validated F-01, F-02. |
| 2026-09-01 | `codex/power-mode` pre-release | Same browser, 1024/768/390/320 px | Pass | `scrollWidth === clientWidth` at every width; boards stayed square and reflowed to one column; Compact rendered 64 cells at 320 px; replay targets are 44 px. Validated F-03. |
| 2026-09-02 | `99ca797` | Chrome 1280×800, 390×844 spot check | Pass, one P3 | [Power-mode acceptance run](#power-mode-browser-acceptance-run-99ca797) that raised P-01. |
| 2026-09-02 | `3d732b4` → `3aa72b5` | Chrome 1280×800, 390×844 | Pass, one P2 | [Drag deployment acceptance run](#drag-deployment-browser-acceptance-run-3d732b4) that raised and re-verified D-01. |
| 2026-09-02 | `1a5abc9` | Chrome 1280×800, 390×844 | Pass, no defects | [Heads-up card acceptance run](#heads-up-card-browser-acceptance-run-1a5abc9). |
| 2026-09-03 | `955f460`, live deployment | Chrome 1600 px, 390×844 | Pass, no defects | [Release readiness run](#release-readiness-run-955f460) across Classic, Power, variants, Daily, replays, and persistence. |

### Power-mode browser acceptance run (`99ca797`)

Chrome at 1280×800 with a 390×844 spot check, local storage starting empty,
serving the repository with `python3 -m http.server 8000`. All actions were
driven through the UI; `window.battleship.game` and `window.battleship.powerState`
were read only as a ground-truth oracle.

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

Raised: P-01.

Not covered: the six non-Classic rule variants, the commanders other than Random,
Hunter, and Aggressive, the Daily challenge, replays, and profile persistence.

### Drag deployment browser acceptance run (`3d732b4`)

Chrome at 1280×800 and 390×844, serving the repository with
`python3 -m http.server 8000`. Every drag was a genuinely held pointer drag —
press, several moves, an observation while still held, then release — because a
synthesized click cannot exercise pointer dragging. `window.battleship` was read
only as a ground-truth oracle.

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

Raised: D-01, fixed and re-verified on `3aa72b5` within the same branch.

Not covered: right-click rotation mid-drag (the `R` key was used instead),
desktop rows 7–10, which sat below the fold, and every non-placement feature
beyond the Power smoke test.

### Heads-up card browser acceptance run (`1a5abc9`)

Chrome at 1280×800 and 390×844, serving the repository with
`python3 -m http.server 8000`. Cards were triggered only through real gameplay
except where noted below.

Passed: all five ship abilities and all five power-ups each raising a card whose
text matches the combat-log entry and the fleet oracle, including clipped scan
counts; the card being visibly translucent with the board readable through it;
clicks passing through the card to the grid beneath; auto-dismissal without
interaction; at most three cards alive at once with no layout shift; earned
power-ups rendering as gold reward cards with their award reason; Restart and
**Play again** clearing all cards; the victory dialog drawing above the feed; the
feed anchored to the bottom of the viewport at 390×844; zero console
errors/warnings; and no asset 404s.

Raised: nothing.

Not covered: the replay dialog coexisting with a card generated by gameplay.
Replay is disabled during a battle and the feed is cleared on returning to setup,
so the two cannot legitimately overlap through the UI; the stacking and
hit-testing contract was instead confirmed with a card injected into the DOM.
This run did not revisit non-Classic variants, other commanders, the Daily
challenge, profile persistence, or audio.

### Release readiness run (`955f460`)

Run against the deployed build at https://battleship2-xne9.vercel.app/ rather
than a local server, after confirming that all eleven web-served files are
byte-identical to `955f460`, so the deployment is provably the default branch.
Every drag was a genuinely held pointer drag and every shot and ability a real
click; `window.battleship` was read only as an oracle, and each scan count was
recomputed independently from `enemyBoard.ships` geometry before comparison.

Passed: Classic placement by held drag, click, rotate, and randomize, including
an `Escape` cancellation released over a legal cell placing nothing, and a
single click placing a ship immediately after a drop; a battle to victory with
every overlay statistic populated; career statistics and achievements surviving
a hard reload; replay stepping forward and back with both the label and the
grids advancing; Power abilities and earned power-ups raising cards that match
the combat log, staying translucent, passing clicks through, leaving the DOM at
3.86 s, capping at three, and sitting below the victory overlay; a corner
Cruiser Radar reporting `9-cell sector` while an interior Destroyer Sonar
reports `3×3 sector`, both matching predicted geometry; Compact 8×8, the
Aggressive commander, and the Daily challenge lock and restore; the full mobile
path at 390×844 with no horizontal overflow and the feed pinned to the bottom;
and zero console errors, warnings, or unhandled rejections and zero responses
of 400 or worse across the whole run.

Raised: nothing. One cosmetic observation, not a defect: controls locked during
a battle are dimmed to `opacity: 0.46`, an effective contrast of about 4.06:1
for select text and 3.12:1 for the gold Daily label. Disabled controls are
exempt from WCAG 1.4.3, so this is recorded as polish.

Not covered: the replay dialog coexisting with a card raised by gameplay, which
remains unreachable through the UI for the reason given in the previous run;
audio was verified by counting resolved `play()` promises rather than by
listening.

## Browser acceptance coverage to execute

A full release run should cover at least:

- Classic and Power happy paths;
- Standard, Salvo, Rapid fire, One-shot, Compact, Armada, and Limited ammo;
- Random, Hunter, Probability, Aggressive, and Deceptive commanders;
- player victory, fleet-destroyed loss, and ammunition-exhausted loss;
- placement edges, invalid overlap/overflow, repeated targets, and board corners;
- held pointer drags, including illegal drops, cancellation, and mid-drag rotation;
- rapid clicks, repeated keyboard input, restarting during an AI delay, and
  double activation of result/replay controls;
- deterministic same-day Daily operation and locally retained best score;
- Power abilities, earned power-ups, repair, and defensive interception;
- heads-up card content, transparency, click-through, lifetime, and teardown;
- match history, stats, every replay step, achievements, and cosmetic
  persistence;
- repeated playthroughs and reload/reset boundaries;
- keyboard-only operation, dialog focus, and disabled enemy-grid state;
- wide desktop, tablet, 390 px mobile, and 320 px narrow-mobile layouts; and
- browser console errors/warnings, unhandled promise rejections, and asset 404s.

Record the browser, version, viewport, date/time zone, commit, and whether local
storage began empty. Do not treat an earlier Classic-only run as evidence for the
expanded build.

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
8. After the fix, the validation line: the command or browser procedure rerun,
   the commit it ran against, and the actual result. Original failure evidence is
   never replaced.
