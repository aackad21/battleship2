# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | Yes |
| < 1.0 | No |

Only the latest release and the current `master` receive fixes.

## Reporting a vulnerability

Do not open a public issue for a security problem.

Report it privately through GitHub's
[private vulnerability reporting](https://github.com/aackad21/battleship2/security/advisories/new)
form. If that is unavailable, email the repository owner at
<aackad21@gmail.com> with `SECURITY` in the subject.

Please include the affected URL or commit, reproduction steps, and the impact
you believe it has. Expect an acknowledgement within 7 days and a decision on
a fix within 30 days. Please give us a chance to ship a fix before disclosing
publicly.

## Scope

This is a static, dependency-free browser game. It has no backend, no
accounts, and no network calls of its own: all state (profile, statistics,
achievements, replays, mute preference) is written to the visitor's own
`localStorage` and never leaves the browser.

In scope:

- Cross-site scripting or other injection reachable through the game UI or
  through stored profile/replay data.
- Anything that lets one origin read or tamper with another visitor's data.
- Content that could execute unexpectedly from the shipped assets.

Out of scope:

- A visitor editing their own `localStorage` to alter their own statistics,
  unlocks, or replays. There is no server-side authority and no anti-cheat
  claim.
- Findings that only apply to the hosting platform's configuration rather than
  this repository.
- Missing hardening headers on a third-party static host.
- Automated scanner output with no demonstrated impact.
