# Battleship: Fleet Command

A dependency-free browser Battleship game with two base modes, seven rule
variants, five AI commanders, a deterministic daily challenge, tactical replays,
and a profile stored locally in the browser.

## Play

There is no build step and no package installation. Serve the repository so the
browser can load its JavaScript modules:

```bash
python3 -m http.server 8000
# open http://localhost:8000/index.html
```

## Core rules

- Deploy the Carrier (5), Battleship (4), Cruiser (3), Submarine (3), and
  Destroyer (2) horizontally or vertically. Ships may touch, but cannot overlap
  or leave the board.
- Drag a ship from the tray or reposition one already on the grid: the hull
  follows the pointer or finger, keeps the section you grabbed under it, and
  tints red over an illegal drop. Release to place, or press <kbd>Esc</kbd> to
  abandon the drag. Selecting a ship and clicking a cell also works.
- Press <kbd>R</kbd>, right-click, or use **Rotate** to change orientation, which
  also turns a ship mid-drag. **Randomize** places the complete fleet.
- Battle starts only after the required fleet is deployed. Enemy ships remain
  hidden until sunk or the match ends.
- A normal turn permits the number of shots set by the chosen variant. A cell
  cannot be targeted again while it remains resolved. A ship sinks when all its
  sections are hit; destroying the enemy fleet wins.
- **Restart** or **Play again** resets the active match. Career data and cosmetic
  preferences are intentionally retained on that browser.

## Base modes

Base mode and rule variant are separate choices. Any of the seven variants can
be played in either base mode, except that the Daily operation fixes its own
configuration.

| Mode | Rules |
|---|---|
| **Classic** | Pure Battleship. No ship abilities or power-ups affect play. |
| **Power** | Adds one charge of each surviving ship's ability and power-ups earned during battle. Core placement, turn, and victory rules still apply. |

### Power mode systems

| Ship | One-use ability |
|---|---|
| Carrier | **Recon** reports remaining unhit sections in a selected row. |
| Battleship | **Salvo** adds two shots to the current turn, subject to an ammunition cap. |
| Cruiser | **Radar** reports contacts in a selected 5×5 sector. |
| Submarine | **Stealth** protects the submarine during the next two enemy turns. |
| Destroyer | **Sonar** reports contacts in a selected 3×3 sector. |

An ability is unavailable after its ship sinks. Power-ups cycle through Radar
Scan, Airstrike, Repair, Decoy, and Extra Shot. They are earned for each three
confirmed hits and for sinking an enemy ship. Scans report counts rather than
revealing exact ship cells; Repair cannot restore a sunk ship; Decoy converts the
next enemy hit to a miss.

## Rule variants

| Variant | Change from standard play |
|---|---|
| **Classic rules** (`standard`) | 10×10 board, five-ship fleet, one shot per side per turn. |
| **Salvo** | Each side receives one shot per surviving ship on its turn. |
| **Rapid fire** | Each side receives three shots per turn. |
| **One-shot** | A hit immediately sinks every section of that ship. |
| **Compact 8 × 8** | Uses an 8×8 board with the standard five-ship fleet. |
| **Armada fleet** | Adds a two-section Patrol Boat for six ships and 19 occupied cells. |
| **Limited ammo** | The player has 32 total shots; using the last shot without destroying the fleet is a loss. |

## Enemy commanders

| Choice | Behaviour |
|---|---|
| **Random · Easy** | Chooses uniformly from unresolved cells. |
| **Hunter · Medium** | Hunts on a parity grid, then follows and aligns around hits. |
| **Probability · Hard** | Scores cells from all still-plausible ship placements. |
| **Aggressive · Hard** | Uses hunt/target logic with extra pressure on central lanes. |
| **Deceptive · Hard** | Alternates perimeter and diagonal pressure before falling back to parity hunting. |

Every AI respects the active board size, fleet, turn quota, and previously
resolved cells.

## Daily operation

The Daily operation is a local-calendar challenge: destroy a deterministic enemy
fleet in no more than 32 shots. It fixes Classic mode, Limited ammo, and the
Probability commander. The date independently seeds the enemy layout and AI, so
randomizing the player's fleet does not alter that day's opponent. Attempts and
the lowest completed shot count are saved locally for each date; there is no
global or friend leaderboard.

## Records, replay, and customization

After each completed match, the browser stores:

- cumulative games, wins, losses, streaks, shots, hits, misses, and accuracy;
- up to 20 match summaries and event timelines (the dashboard shows the eight
  most recent), with step-by-step board replay;
- first-hit and shots-to-sink analytics used in the battle report;
- six achievements: first win, a 50%+ accuracy win, a win without losing a ship,
  a three-win streak, 10 completed games, and use of every ship ability; and
- ocean theme, hit effect, fleet flag, and victory signal preferences.

These records use browser-local storage with an in-memory fallback when storage
is unavailable. They are device/browser data, not an online account.

## Scope

Ranked matchmaking, ELO/MMR, seasons, global leaderboards, private games,
friends, invitations, asynchronous multiplayer, chat, and other social features
are intentionally out of scope. The game is single-player against the local AI.

## Project layout

```text
index.html                    UI structure and dialogs
css/styles.css                responsive layout, themes, effects, and animation
js/constants.js               modes, variants, fleets, and game configuration
js/board.js                   placement, shots, sinking, and repair
js/ai.js                      five AI strategies
js/game.js                    phases, quotas, outcomes, events, and stats
js/powers.js                  abilities, power-ups, and defensive interception
js/profile.js                 local records, achievements, daily data, and replay
js/audio.js                   sound pooling and mute persistence
js/main.js                    DOM wiring and presentation
tests/simulate.mjs            engine, variant, AI, and integration checks
tests/powers.mjs              Power-mode checks
tests/profile.mjs             persistence, daily, achievement, and replay checks
tools/generate_ships.py       ship SVG generator
```

## Checks

```bash
npm test                 # all headless suites
npm run test:engine      # core rules, variants, and AI
npm run test:powers      # abilities and defenses
npm run test:profile     # persistence, daily records, and replay
```

Headless checks do not replace browser acceptance testing. See [TESTING.md](TESTING.md)
for the verification guide and [docs/acceptance-test-plan.md](docs/acceptance-test-plan.md)
for the black-box test plan.

## Credits

Sound effects are CC0 (public domain) from OpenGameArt; see [CREDITS.md](CREDITS.md).
