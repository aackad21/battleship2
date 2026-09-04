# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Defect IDs (P-01, D-01, H-01..H-03, F-01..F-04) refer to the defect register in
[`TESTING.md`](TESTING.md).

## [Unreleased]

## [1.0.1] - 2026-09-03

Documentation and repository release: no gameplay change, so the deployed game
is unaffected. This tag exists so the downloadable archive contains the
community health documents and the verified settings record, which merged after
`v1.0.0` was tagged.

### Added

- Community health documents: `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`,
  `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `.github/CODEOWNERS`, a pull
  request template, and structured bug/feature issue forms.

### Changed

- CI now triggers only on `master`; the legacy `devin/1788265893-testing-fixes`
  branch has been deleted.
- `docs/repository-settings.md` now records the settings as they are configured
  rather than as recommendations to apply.
- `TESTING.md` records the release readiness run against the deployed build.

## [1.0.0] - 2026-09-03

First tagged release. `package.json` has carried `1.0.0` since the first
commit; this entry makes that version meaningful: the game is feature-complete,
every defect in the register is closed, and the default branch is deployed at
https://battleship2-xne9.vercel.app/.

### Added

- Classic Battleship against a hunt/target AI on a 10×10 board, with pointer
  based ship dragging instead of HTML5 drag-and-drop (initial commits,
  2026-09-01).
- Power base mode alongside Classic, selectable separately from the rule
  variant ([#1](https://github.com/aackad21/battleship2/pull/1), merged
  2026-09-01).
- Seven rule variants: Standard, Salvo, Rapid fire, One-shot, Compact 8×8,
  Armada, and Limited ammo (#1).
- Five AI commanders: Random, Hunter, Probability, Aggressive, and Deceptive
  (#1).
- Five one-use ship abilities: Carrier Recon, Battleship Salvo, Cruiser Radar,
  Submarine Stealth, and Destroyer Sonar (#1).
- Five earned power-ups: Radar Scan, Airstrike, Repair, Decoy, and Extra Shot
  (#1).
- Deterministic daily challenge with a locally retained best score (#1).
- Tactical replays of completed matches (#1).
- Browser-local profile with career statistics, 20-match history, six
  achievements, and cosmetics (#1).
- Keyboard-operable fleet deployment and battle, responsive layout down to a
  320 px viewport (#1).
- Real pointer drag deployment: the hull follows the pointer or finger, keeps
  the grabbed section under it, tints over an illegal drop, rotates mid-drag,
  and cancels with <kbd>Esc</kbd> or an off-board release
  ([#3](https://github.com/aackad21/battleship2/pull/3), merged 2026-09-02).
- Translucent heads-up cards announcing ability and power-up results, with
  click-through to the board, a three-card limit, and teardown on Restart or
  Play again ([#5](https://github.com/aackad21/battleship2/pull/5), merged
  2026-09-03).
- Three dependency-free Node test suites (`npm test`): engine simulation,
  abilities and power-ups, and profile persistence (#1).
- `TESTING.md` consolidated into a single debug report with a standard defect
  register and validated-fix table
  ([#4](https://github.com/aackad21/battleship2/pull/4),
  [#6](https://github.com/aackad21/battleship2/pull/6), merged 2026-09-03);
  manual procedure in `docs/acceptance-test-plan.md`.

### Fixed

- H-01 (P1): hit/miss markers and effects painted below ship sprites. Dedicated
  marker layers now follow the ship layers (Classic baseline, 2026-09-01).
- H-02 (P2): missing favicon produced a `/favicon.ico` 404. Added
  `assets/img/favicon.svg` and a document link (Classic baseline, 2026-09-01).
- H-03: rapid multi-cell clicking suspected to grant two turns. Investigated
  and closed as not a defect; the phase/busy guard rejects a click burst.
- F-01 (P1): a delayed result overlay could appear after Restart. The pending
  result timer is cleared on reset (#1).
- F-02 (P1): ship selection was not keyboard-accessible. Tray items carry full
  interactive keyboard semantics (#1).
- F-03 (P1): the 320 px layout overflowed horizontally (#1).
- F-04 (P2): enemy cells were focusable during setup. Inactive enemy cells are
  disabled (#1).
- P-01 (P3): clipped Radar and Sonar scans reported the nominal sector size
  instead of the scanned area
  ([#2](https://github.com/aackad21/battleship2/pull/2), merged 2026-09-02).
- D-01 (P2): the first board click after a drag drop was discarded. The
  one-shot click guard is now scoped to the dropped cell (#3, 2026-09-02).

[Unreleased]: https://github.com/aackad21/battleship2/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/aackad21/battleship2/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/aackad21/battleship2/releases/tag/v1.0.0
