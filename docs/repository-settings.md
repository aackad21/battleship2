# Repository settings

Settings on the GitHub repository itself that cannot be changed from a pull
request. The automation account used by Devin has no admin rights on
`aackad21/battleship2`; every write to the repository settings API returns
`403 Resource not accessible by integration`. The values below must therefore
be applied by the repository owner, either through the GitHub UI or with the
`gh api` commands given.

## Repository metadata (About box)

### Current state (checked 2026-09-03)

| Field         | Current value                             |
| ------------- | ----------------------------------------- |
| `description` | empty                                     |
| `homepage`    | `https://battleship2-gray.vercel.app`     |
| `topics`      | none                                      |
| Wiki          | enabled                                   |
| Issues        | enabled                                   |

The current homepage points at an older Vercel deployment. The production
deployment that tracks the default branch is
`https://battleship2-xne9.vercel.app/`.

### Recommended values

Description (118 characters):

```
Dependency-free browser Battleship: two modes, seven variants, five AI commanders, powers, daily challenge, replays, local stats.
```

Homepage:

```
https://battleship2-xne9.vercel.app/
```

Topics:

```
battleship game browser-game javascript vanilla-js es-modules no-dependencies html5 css
```

### Why this description

The owner proposed:

> Feature-rich, dependency-free browser Battleship with multiple game modes,
> AI commanders, tactical powers, daily challenges, replays, and local career
> statistics.

Every claim in it is accurate, but at 162 characters it is truncated in
repository listings and search results. The recommended version keeps the same
facts in 118 characters and replaces the vague "multiple" with the actual
counts. Each claim was checked against the source:

| Claim                       | Source                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| dependency-free             | `package.json` has no `dependencies` or `devDependencies`; `index.html` loads `js/main.js` directly |
| two modes                   | `BASE_MODES` in `js/constants.js` (Classic, Power)                                              |
| seven variants              | `GAME_VARIANTS` in `js/constants.js` (Standard, Salvo, Rapid fire, One-shot, Compact 8x8, Armada, Limited ammo) |
| five AI commanders          | `RandomAI`, `HuntTargetAI`, `ProbabilityAI`, `AggressiveAI`, `DeceptiveAI` in `js/ai.js`         |
| powers                      | `SHIP_ABILITIES` (five) and `POWERUPS` (five) in `js/powers.js`                                 |
| daily challenge             | `dailyKey` and the daily button handling in `js/main.js`                                        |
| replays                     | replay overlay and grids in `js/main.js`                                                        |
| local stats                 | `js/profile.js` stores career stats and achievements in `localStorage`                          |

"Feature-rich" was dropped as marketing wording. "Career statistics" became
"local stats" for length; the profile is browser-local and never leaves the
device.

### Why these topics

| Topic             | Justification                                                     |
| ----------------- | ----------------------------------------------------------------- |
| `battleship`      | The game.                                                         |
| `game`            | Generic discovery topic.                                          |
| `browser-game`    | Runs entirely in the browser.                                     |
| `javascript`      | All logic is in `js/*.js`.                                        |
| `vanilla-js`      | No framework or library.                                          |
| `es-modules`      | `"type": "module"` and native `import`/`export` throughout.       |
| `no-dependencies` | No runtime or development dependencies, no build step.            |
| `html5`           | `index.html` with semantic markup and the drag-and-drop API.      |
| `css`             | Styling lives in `css/`.                                          |

`canvas` was considered and rejected: the code contains no `<canvas>` element
and no `getContext` call. Boards are rendered as DOM grids.

### Applying through the GitHub UI

1. Open https://github.com/aackad21/battleship2.
2. In the right-hand **About** box, click the gear icon.
3. **Description**: paste the recommended description above.
4. **Website**: paste `https://battleship2-xne9.vercel.app/`.
   Leave **Use your GitHub Pages website** unchecked.
5. **Topics**: enter each topic from the list above, pressing Enter after
   each one.
6. Leave **Releases**, **Packages**, and **Deployments** as they are.
7. Click **Save changes**.

### Applying with `gh api`

Run as a user with admin rights on the repository:

```bash
gh api --method PATCH repos/aackad21/battleship2 \
  -f description="Dependency-free browser Battleship: two modes, seven variants, five AI commanders, powers, daily challenge, replays, local stats." \
  -f homepage="https://battleship2-xne9.vercel.app/"

gh api --method PUT repos/aackad21/battleship2/topics \
  -f 'names[]=battleship' \
  -f 'names[]=game' \
  -f 'names[]=browser-game' \
  -f 'names[]=javascript' \
  -f 'names[]=vanilla-js' \
  -f 'names[]=es-modules' \
  -f 'names[]=no-dependencies' \
  -f 'names[]=html5' \
  -f 'names[]=css'
```

Verify:

```bash
gh api repos/aackad21/battleship2 --jq '{description,homepage,topics}'
```

### Attempt log

Both commands above were run by the automation account on 2026-09-03 and
failed with:

```
gh: Resource not accessible by integration (HTTP 403)
{"message":"Resource not accessible by integration","documentation_url":"https://docs.github.com/rest/repos/repos#update-a-repository","status":"403"}
```

```
gh: Resource not accessible by integration (HTTP 403)
{"message":"Resource not accessible by integration","documentation_url":"https://docs.github.com/rest/repos/repos#replace-all-repository-topics","status":"403"}
```

No settings were changed.
