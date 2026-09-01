# Battleship: Fleet Command — black-box acceptance-test plan

## Purpose and scope

Test the current application at `http://localhost:8000/index.html`, served from
the repository root with `npm start`. Interact through the visible UI as a player
would. Developer tools may observe console, network, accessibility, focus, and DOM
state, but must not call game internals, reveal hidden ships, or mutate state to
make a scenario pass.

This plan covers the single-player product: Classic and Power modes, all seven
variants, all five AI choices, Daily operation, local profile data, achievements,
customization, stats, and replay. Ranked play, ELO/MMR, seasons, online/global
leaderboards, private games, invitations, friends, asynchronous multiplayer,
chat, and social reactions are intentionally out of scope.

Do not modify code while executing the discovery run. Report and prioritize every
failure first, then obtain agreement on the fix set, implement, and rerun the
failed case plus related regressions.

## Rules under test

| ID | Rule |
|---|---|
| R01 | The player chooses one of two base modes: Classic or Power. |
| R02 | Classic mode contains no usable ship abilities or power-ups. |
| R03 | Power mode gives one charge to each ship ability while that ship survives and awards consumable power-ups during battle. |
| R04 | Standard play uses a 10×10 board and Carrier 5, Battleship 4, Cruiser 3, Submarine 3, and Destroyer 2: five ships and 17 occupied cells. |
| R05 | Ships are horizontal or vertical, may touch, cannot overlap, and cannot leave the board. Invalid previews are visibly rejected. |
| R06 | Battle cannot start until the active variant's complete player fleet is validly deployed. |
| R07 | The enemy fleet is hidden until individual ships sink or the match ends. |
| R08 | Standard turns allow one shot per side. A hit does not grant another shot unless a variant or Power action changes the quota. |
| R09 | A resolved cell cannot be fired at again. A hit negated by Decoy/Stealth becomes a miss and may become targetable again under the implemented defense rules. |
| R10 | A ship sinks when all its sections are hit. Destroying the last enemy ship wins; destroying the last player ship loses. No input changes a completed game. |
| R11 | Salvo grants one shot per surviving ship; Rapid grants three shots; One-shot sinks a whole ship on its first hit; Compact uses 8×8; Armada adds a size-2 Patrol Boat; Limited provides 32 player shots. |
| R12 | Limited ends in defeat with reason ammunition exhausted if shot 32 does not destroy the enemy fleet. Extra shots cannot exceed remaining ammunition. |
| R13 | The selectable commanders are Random, Hunter, Probability, Aggressive, and Deceptive; each stays in bounds and does not repeat a currently resolved cell. |
| R14 | Daily operation fixes Classic + Limited + Probability, uses a deterministic enemy fleet and AI sequence for the local date, and records the lowest completed shot count locally. |
| R15 | Live and final stats accurately report shots, hits, accuracy, and ships sunk. Completed matches retain result, settings, event timeline, and analytics. |
| R16 | Replay begins at opening positions and advances/reverses one recorded event per step, including multi-cell One-shot outcomes and Repair removing a restored hit. |
| R17 | The local profile retains career totals, win/best streak, up to 20 match records, and six achievements across reloads. |
| R18 | The six achievements are: first win; 50%+ accuracy win; win without losing a ship; three-win streak; 10 games; and use every ship ability. Each unlocks once. |
| R19 | Ocean theme, hit effect, fleet flag, victory signal, and sound preference persist locally and affect only presentation/audio. |
| R20 | Restart/Play again cancels pending timers and resets boards, phase, current stats, log, Power inventory, and replay/result dialogs without clearing the profile. |
| R21 | Setup, battle, profile, and dialogs are keyboard-operable with meaningful focus/disabled state. Layout remains usable from 320 px mobile through desktop. |
| R22 | No uncaught errors, warnings caused by the app, unhandled rejections, or asset 404s occur through the tested flows. |

## Mode, variant, and AI matrix

Run the complete happy path in both base modes. Exercise every variant at least
once in Classic, then run Power with Standard plus at least Salvo, Rapid,
One-shot, and Limited to expose quota/ability interactions.

| Dimension | Required values |
|---|---|
| Base mode | Classic, Power |
| Variant | Classic rules/Standard, Salvo, Rapid fire, One-shot, Compact 8×8, Armada fleet, Limited ammo |
| Commander | Random, Hunter, Probability, Aggressive, Deceptive |
| End state | Player fleet victory, enemy fleet victory, ammunition-exhausted defeat |
| Input | Pointer, keyboard-only, rapid/repeated activation |
| Viewport | 1280×800, 1024×768, ~820×1100, 390×844, 320×700 or closest available height |

Distribute the five commanders across variant runs so each completes at least one
battle. Record any observed strategy evidence, but accept/reject primarily on
valid targeting and selected-strategy continuity rather than requiring a
particular random shot.

## Test preparation

1. Record commit, browser/version, operating system, viewport, device pixel ratio,
   local date/time zone, and server command.
2. Capture console and network logs with preservation enabled; clear both before
   each major suite.
3. Run once with a clean origin storage profile. Export or screenshot profile
   state before any later storage-clearing scenario.
4. Keep a shot/turn tally independent of the app for quota, accuracy, Daily, and
   replay comparisons.
5. For stochastic cases, repeat at least three times. Include the random seed only
   for automated reproduction; a black-box report should describe visible state.

## S1 — Classic happy path

- **S1.1 Initial state:** load with clean storage. Confirm Classic and Classic
  rules are selected, two 10×10 labelled grids render, five correct tray ships
  appear, enemy cells are not focusable/actionable, and **Start battle** is
  disabled. (R01, R02, R04, R06, R21)
- **S1.2 Deployment inputs:** place at least one ship by selecting it then choosing
  a cell, one by drag, reposition a placed ship, and rotate through the button,
  <kbd>R</kbd>, and right-click. Complete the same sequence keyboard-only in a
  separate run. (R05, R21)
- **S1.3 Setup actions:** **Randomize** produces exactly five ships/17 distinct
  cells; **Clear** removes them and disables Start; randomize again and start.
  (R04, R06)
- **S1.4 Battle start:** setup choices lock, player fleet remains visible, enemy
  fleet remains hidden, enemy grid becomes operable, and Power controls remain
  absent/inactive. (R02, R07)
- **S1.5 Alternation:** fire a known miss and later a hit. Verify marker, effect,
  sound/log, one stat increment, one AI response, no extra turn on hit, and no
  accepted input during the AI turn. (R08, R15, R19)
- **S1.6 Completion:** play to either fleet-destroyed result. Verify banner/dialog,
  final stats, complete enemy reveal, profile update, history entry, and enabled
  replay control. (R10, R15, R17)

## S2 — Power happy path and tactical systems

- **S2.1 Isolation:** select Power before deployment. Confirm the same core fleet
  and placement rules plus a tactical panel. Switch back to Classic and confirm
  the panel/actions disappear and do not alter Classic state. (R01–R03)
- **S2.2 Ability charges:** start Power/Standard. Confirm Carrier, Battleship,
  Cruiser, Submarine, and Destroyer each show one charge; using a charge disables
  a second use. Sink a player ship before its charge is used and confirm its
  ability is unavailable. (R03)
- **S2.3 Recon:** target a row; confirm a bounded highlight and contact count, no
  exact cells revealed, no shot consumed, and the charge is spent. (R03)
- **S2.4 Battleship Salvo:** activate it with ammunition available; exactly two
  shots are added to the current turn. Verify turn transition only after the
  augmented quota. (R03)
- **S2.5 Cruiser Radar / Destroyer Sonar:** target center and corner sectors.
  Confirm 5×5 and 3×3 scans clip to board bounds, return plausible unhit-contact
  counts, do not reveal cells, and expire visually. (R03)
- **S2.6 Submarine Stealth:** activate before an enemy turn, observe two complete
  enemy turns, and confirm submarine hits are negated during both but not after.
  Under Rapid/Salvo, all shots in a volley consume only one protected turn. (R03)
- **S2.7 Earning:** land hits through at least six confirmed-hit thresholds and
  sink ships. Verify one rotating power-up per three hits and another per sink,
  with inventory counts and log messages matching. (R03)
- **S2.8 Radar Scan / Airstrike:** verify Radar scans a bounded 3×3 area. Launch an
  Airstrike at center and corner; it attacks only unresolved cells in the
  orthogonal cross, records separate shot outcomes, and does not exceed turn or
  ammunition constraints. (R03, R09, R12)
- **S2.9 Repair:** damage but do not sink a player ship, then repair. Exactly one
  damaged section becomes unresolved/healthy, relevant stats and later AI
  targeting remain consistent, and a sunk ship cannot be repaired. (R03, R15)
- **S2.10 Decoy / Extra Shot:** Decoy converts the next enemy hit into a miss
  before a loss is committed and then disarms; Extra Shot adds exactly one legal
  shot and fails cleanly when Limited ammo has no spare shot. (R03, R10, R12)

## S3 — Variant rules

- **S3.1 Standard:** verify one shot each per turn on 10×10 with five ships/17
  cells. (R04, R08)
- **S3.2 Salvo:** at full fleets, each side receives five shots. After one ship
  sinks, that side's next quota is four; the opponent retains its own surviving
  count. A volley completes before control changes. (R11)
- **S3.3 Rapid fire:** each side receives exactly three shots per turn; duplicate
  targets do not consume quota. (R09, R11)
- **S3.4 One-shot:** hit any unhurt multi-cell ship once. Every section receives a
  hit marker in that event, the ship sinks immediately, sunk count increments
  once, and replay shows all affected cells in one step. (R10, R11, R16)
- **S3.5 Compact:** both boards and labels are 8×8; all five standard ships fit;
  placement, scanning, AI targeting, replay, and corners use 0–7 bounds. (R11)
- **S3.6 Armada:** tray and both boards use the standard fleet plus a size-2 Patrol
  Boat: six ships/19 cells. Start remains disabled at five ships, and victory
  requires all six. Patrol art and status remain aligned. (R06, R10, R11)
- **S3.7 Limited:** ammunition begins at 32, decrements only for accepted player
  shots, and reaches an ammunition-exhausted defeat immediately after a
  non-winning shot 32. A winning shot 32 is a victory. (R12)
- **S3.8 Cross-mode:** repeat Salvo, Rapid, One-shot, and Limited in Power. Verify
  ability/power-up changes compose with rather than bypass variant quotas, sink
  semantics, or ammunition limits. (R03, R11, R12)

## S4 — AI commanders and Daily operation

- **S4.1 Choices:** for each commander, select it, start, confirm the visible
  setting remains selected/locked for the match, and complete enough turns to
  show no out-of-bounds or duplicate resolved-cell shots. (R13)
- **S4.2 Strategy signatures:** across complete games, Random should lack a fixed
  hunt pattern; Hunter should follow hits and align; Probability should target
  plausible density; Aggressive should favor central lanes; Deceptive should
  alternate perimeter/diagonal pressure. Treat statistical variation as expected
  and report only persistent mismatch. (R13)
- **S4.3 Daily configuration:** activate Daily and confirm Classic, Limited, and
  Probability are fixed/locked with a 32-shot objective. Exit Daily and confirm
  ordinary controls return. (R14)
- **S4.4 Daily determinism:** on the same local date, record the enemy layout by
  completing/replaying one run, restart Daily, randomize the player fleet a
  different number of times, and complete/replay again. Enemy placement and AI
  sequence for equivalent player actions must match. (R14)
- **S4.5 Daily local record:** lose one attempt, then complete two victories with
  different shot totals. Attempts increment; incomplete runs do not become best;
  only the lower completed total remains after reload. (R14, R17)

## S5 — Win/loss and stat boundaries

- **S5.1 Fleet victory:** destroy the final enemy section in Standard and the
  final enemy ship in One-shot. One Victory result appears, no AI reply occurs,
  and no later input changes stats. (R10)
- **S5.2 Fleet defeat:** continue legal turns until the final player section is
  destroyed. One Defeat result appears, computer sunk count equals the active
  fleet count, and input is blocked. (R10, R15)
- **S5.3 Ammo defeat:** exhaust Limited without sinking the fleet. Result text and
  stored reason distinguish ammunition exhaustion from fleet loss. (R12, R15)
- **S5.4 Accuracy:** at 0 shots and several hit/miss checkpoints, independently
  calculate hits ÷ shots rounded as displayed for each side. Verify live, result,
  profile career, and stored match totals. (R15, R17)
- **S5.5 Final-shot races:** activate Restart repeatedly at offsets before/during
  the result delay. A reset cancels the old result and focus transfer; without a
  reset exactly one result appears. (R20)

## S6 — Placement and targeting boundaries

- **S6.1 Flush placement:** place every ship horizontally and vertically flush to
  each board edge and at all four corners; valid positions are accepted. (R05)
- **S6.2 Overflow:** attempt each edge overflow, including a dragged ship grabbed
  from a non-leading segment. Preview is invalid and the prior ship state remains
  unchanged. (R05)
- **S6.3 Overlap/touch:** overlap is rejected; orthogonal and diagonal touching is
  accepted. (R05)
- **S6.4 Rotation failure:** rotate at a boundary or into another ship. The action
  is rejected without moving, losing, or duplicating either ship. (R05)
- **S6.5 Target edges:** fire and use each targeted scan/airstrike at four corners
  and representative edges. No generated coordinate leaves the active board.
  (R03, R09)
- **S6.6 Duplicate target:** click a resolved hit and miss. No quota, ammo, stat,
  log, marker, sound, or phase changes. (R09)

## S7 — Rapid input and concurrency

- **S7.1 Same-cell burst:** double/triple-click one enemy cell in every quota type.
  Exactly one resolution and one quota decrement occur. (R09)
- **S7.2 Distinct-cell burst:** click several cells faster than the AI delay.
  Standard accepts one; Rapid accepts no more than three; Salvo accepts no more
  than its current quota. No input lands during the AI turn. (R08, R11)
- **S7.3 Setup spam:** alternate **Randomize**, **Clear**, Rotate, held <kbd>R</kbd>,
  and ship selection rapidly. Fleet count, occupied cells, sprites, Start state,
  and focus remain consistent. (R05, R06)
- **S7.4 Power spam:** double-activate one-charge abilities and single-inventory
  power-ups; rapidly select/deselect targeted actions; click a target twice. Each
  resource is consumed once and actions do not leak into later turns. (R03)
- **S7.5 Dialog spam:** double-click **Play again**, replay open/close, Previous,
  and Next at endpoints. No duplicate reset, skipped/out-of-range frame, stacked
  dialog, or exception occurs. (R16, R20)

## S8 — Restart, reload, and repeated play

- **S8.1 Setup restart:** restart with a partial/randomized fleet. Active setup is
  clean, settings remain selected, and Start is disabled. (R20)
- **S8.2 AI-delay restart:** fire and immediately restart before the AI timer.
  Wait at least twice the delay; no shot, log entry, marker, or stat appears on
  the new board. (R20)
- **S8.3 Power restart:** restart with selected actions, inventory, armed Decoy or
  Stealth, scan highlight, and a damaged ship. All match-scoped Power state and
  timers clear. (R20)
- **S8.4 Result/replay restart:** restart from result and after opening/advancing
  replay. Dialogs close, background inert state clears, and focus returns to a
  valid setup control. (R20, R21)
- **S8.5 Profile boundary:** after Restart, Play again, and reload, career/history,
  achievements, Daily best, customization, and sound persist; active board,
  match stats, log, and selections do not. (R17, R19, R20)
- **S8.6 Repeated games:** complete at least three back-to-back matches spanning
  both modes and different variants. Confirm no stale markers, ships, effects,
  timers, logs, dialog content, quotas, or Power resources. History order and
  career arithmetic remain correct. (R17, R20)

## S9 — Profile, achievements, replay, and customization

- **S9.1 History bound:** complete enough controlled short matches to verify newest
  first ordering, correct win/loss/mode/variant/shot summaries, replay selection,
  and retention of at most 20 records after reload. (R17)
- **S9.2 Achievement unlocks:** meet each of the six conditions independently.
  Confirm it remains locked before the threshold, unlocks exactly once at match
  completion, is announced when appropriate, and persists. (R18)
- **S9.3 Replay fidelity:** compare an independent event log to every Previous/Next
  frame. Test normal hit/miss, multi-cell One-shot, Power action, Decoy/Stealth
  blocked shot and later retry, Repair removing the restored coordinate, sink,
  and final result. No event creates extra/missing frames. (R16)
- **S9.4 Replay navigation:** opening state has no shots; endpoints disable the
  relevant button; close restores focus; reopening the same and an older match
  starts at frame zero with correct board size/fleet. (R16, R21)
- **S9.5 Customization:** exercise every ocean, effect, flag, and victory option.
  Confirm immediate visual change, cosmetic-only game state, persistence through
  restart/reload, and valid fallback if saved data is unavailable. (R19)
- **S9.6 Storage unavailable:** where the browser permits a storage-disabled test,
  confirm the current session remains playable without uncaught errors; label
  loss after closing that session as expected memory-fallback behaviour. (R17)

## S10 — Responsive layout and accessibility

- **S10.1 Desktop:** at 1280×800 and 1024×768, confirm no clipping/overlap,
  readable controls/profile, square aligned boards, and usable result/replay
  dialogs. (R21)
- **S10.2 Tablet/mobile:** at ~820×1100 and 390×844, confirm expected reflow,
  reachable controls, no horizontal scroll, square boards, aligned labels/ships,
  legible stats/actions, and tap targets. Complete one match at 390 px. (R21)
- **S10.3 Narrow mobile:** at 320 px, measure `document.documentElement.scrollWidth`
  against `clientWidth` and visually inspect the entire page and both dialogs.
  There must be no horizontal clipping, including long Power/profile content.
  (R21)
- **S10.4 Zoom/reflow:** test 200% browser zoom or equivalent 320 CSS-pixel
  reflow. Content remains operable without two-dimensional scrolling. (R21)
- **S10.5 Keyboard setup/battle:** from a fresh load, deploy, rotate, start, fire,
  select/use a targeted Power action, restart, and open history/replay without a
  pointer. Focus is visible; disabled controls are skipped; Enter/Space does not
  double-fire. (R21)
- **S10.6 Focus/dialogs:** initial dialog focus is logical, Tab/Shift+Tab remain
  within each modal, Escape closes replay but not silently corrupt result state,
  and close/reset returns focus sensibly. Background content is inert. (R21)
- **S10.7 Semantics:** inspect accessible names, pressed/selected state, live turn
  announcements, grid dimensions, row/column indices, and status changes. Enemy
  cells are absent from setup/AI-turn focus and available on player turn. (R21)

## S11 — Console, network, and robustness

- **S11.1 Console:** preserve logs across the full matrix. There are no uncaught
  exceptions, app-caused warnings, CSP issues, unhandled promise rejections, or
  accessibility errors emitted by the app. (R22)
- **S11.2 Network:** all HTML, CSS, modules, SVGs, favicon, and requested audio
  assets return successful responses; no `favicon.ico` or other 404 occurs. (R22)
- **S11.3 Audio policy:** with sound on and off, perform the first hit/miss/sink and
  reload. Autoplay restrictions produce no unhandled rejection; mute state
  persists. Verify behaviour, not audible fidelity, when capture is unavailable.
  (R19, R22)
- **S11.4 Corrupt local data:** if permitted, replace the profile storage entry
  with malformed JSON before reload. The app falls back safely without blocking
  play or repeatedly throwing. Preserve the malformed payload as evidence. (R17,
  R22)
- **S11.5 Long session:** during repeated matches inspect DOM node counts for ship,
  marker/effect, log, and dialog content. Transient nodes do not grow without
  bound, and input latency does not materially degrade. (R20, R22)

## Failure reporting and prioritization

Stop before changing code. For each failure, provide all fields below:

```text
ID / priority:
Environment: commit, browser/version, OS, viewport, local date/time zone
Configuration: storage state, mode, variant, AI, Daily on/off
Reproduction:
  1.
  2.
  3.
Expected:
Actual:
Frequency: n/n attempts
Evidence: screenshot/video path, console/network text, DOM/focus measurement
Likely root cause: hypothesis and implicated component; do not state as fact yet
Regression test: automated layer plus exact black-box rerun
```

Use these priorities:

- **P0 — blocker:** data loss/security issue, app cannot load, or primary gameplay
  cannot complete.
- **P1 — high:** wrong winner/rules, inaccessible primary flow, stale asynchronous
  state, severe mobile clipping, replay/profile corruption, or uncaught exception.
- **P2 — medium:** a secondary ability/control/stat is wrong but the match can
  complete, or a significant presentation/accessibility defect has a workaround.
- **P3 — low:** cosmetic inconsistency or minor wording with no gameplay impact.

After findings are reported and prioritized, fix in priority order. Rerun the
smallest failing case, its automated regression, the related suite, and a Classic
happy-path smoke test to ensure expanded features did not alter the pure mode.
