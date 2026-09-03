# Battleship: Fleet Command v1.0.0

Release notes for tag `v1.0.0`. Copy the body below into the GitHub Release.

- Tag: `v1.0.0`
- Target branch: `master`, the only branch
- Title: `Battleship: Fleet Command v1.0.0`
- Published at: `c6cc42a`, which includes the CI workflow, the MIT license, the
  rewritten README, the changelog, and the settings documentation. Community
  health documents merged afterwards and are therefore not in the `v1.0.0`
  archive; they ship with the next tag.

---

Battleship: Fleet Command is a dependency-free browser Battleship game: plain
HTML, CSS, and native JavaScript ES modules, with no build step and no runtime
dependencies. Play it at https://battleship2-xne9.vercel.app/ or serve the
repository locally with `npm start`.

## Highlights

- Classic and Power base modes.
- Seven rule variants: Standard, Salvo, Rapid fire, One-shot, Compact 8×8,
  Armada, and Limited ammo.
- Five AI commanders: Random, Hunter, Probability, Aggressive, and Deceptive.
- Five one-use ship abilities: Carrier Recon, Battleship Salvo, Cruiser Radar,
  Submarine Stealth, and Destroyer Sonar.
- Five earned power-ups: Radar Scan, Airstrike, Repair, Decoy, and Extra Shot.
- Deterministic daily challenge and tactical replays.
- Browser-local profile with career statistics, achievements, and cosmetics.
- Drag-and-drop fleet deployment with full keyboard support.
- Translucent heads-up cards for ability and power-up results.
- Three Node test suites (`npm test`) covering the engine, powers, and profile.

## Fixed defects

All defects in the register are closed. IDs refer to `TESTING.md`.

| ID | Priority | Defect | Fix |
|---|---|---|---|
| H-01 | P1 | Hit/miss markers painted below ship sprites | Classic baseline |
| H-02 | P2 | Missing favicon produced a `/favicon.ico` 404 | Classic baseline |
| H-03 | — | Rapid clicking suspected to grant two turns | Not a defect |
| F-01 | P1 | Delayed result overlay could appear after Restart | #1 |
| F-02 | P1 | Ship selection was not keyboard-accessible | #1 |
| F-03 | P1 | 320 px layout overflowed horizontally | #1 |
| F-04 | P2 | Enemy cells were focusable during setup | #1 |
| P-01 | P3 | Clipped Radar/Sonar scans reported the nominal sector size | #2 |
| D-01 | P2 | First board click after a drag drop was discarded | #3 |

## Links

- Production deployment: https://battleship2-xne9.vercel.app/
- Debug report and defect register: https://github.com/aackad21/battleship2/blob/master/TESTING.md
- Changelog: https://github.com/aackad21/battleship2/blob/master/CHANGELOG.md
