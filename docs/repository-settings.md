# Repository settings

The GitHub settings for `aackad21/battleship2`, as they are configured today,
with the reasoning behind each choice and how to verify it. Every setting here
is administrator-only: the GitHub app used by agents receives HTTP 403 on all
of these endpoints, so changes are made by the repository owner.

## 1. Current state (verified 2026-09-03, `master` at `955f460`)

```bash
gh api repos/aackad21/battleship2 \
  --jq '{default_branch,description,homepage,topics,license:.license.spdx_id,visibility,has_issues,has_wiki}'
gh api repos/aackad21/battleship2/community/profile --jq .health_percentage
gh api repos/aackad21/battleship2/rulesets --jq '.[]|{id,name,enforcement}'
git ls-remote --heads origin
```

| Setting | Value |
| --- | --- |
| Default branch | `master`, the only branch |
| Visibility | public, not archived |
| Description | `Dependency-free browser Battleship: two modes, seven variants, five AI commanders, powers, daily challenge, replays, local stats.` |
| Homepage | `https://battleship2-xne9.vercel.app/` |
| Topics | `battleship-game`, `browser-game`, `css`, `es-modules`, `html`, `javascript`, `no-dependencies`, `vanilla-js` |
| Licence | MIT, detected by GitHub |
| Issues, Wiki | enabled; Discussions deliberately off |
| Community health | 100% |
| Ruleset | `Protection` (id `22165568`), active, targeting `~DEFAULT_BRANCH` |

## 2. The `Protection` ruleset

| Rule | State | Reason |
| --- | --- | --- |
| Restrict deletions | on | The default branch cannot be deleted. |
| Block force pushes (`non_fast_forward`) | on | History and deployments stay reproducible. |
| Require status checks → `test` | on | `npm test` must pass before a merge. |
| Require a pull request | see below | Currently **not** part of the ruleset. |
| Require linear history, signed commits, restrict creations/updates | off | History uses merge commits, nothing is signed, and the two restrict rules block ordinary pushes to feature branches. |
| Code scanning, code coverage, code quality | off | No such tooling exists here; each one leaves pull requests permanently pending. |

Two things to know about the current configuration:

- **The required check is named `test`, not `CI`.** `CI` is the workflow name
  in `.github/workflows/ci.yml`; `test` is the job, and the job is what
  reports. A ruleset requiring `CI` waits forever for a check that never
  arrives.
- **`copilot_code_review` is enabled** (`review_on_push: true`). It requests a
  Copilot review on each push. Remove it if Copilot review is not part of the
  intended workflow, so pull requests are not gated on a service that may not
  respond.

To require pull requests as well (Settings → Rules → `Protection` → Require a
pull request before merging, approvals `0`):

```bash
gh api repos/aackad21/battleship2/rulesets/22165568 --jq '.rules'   # inspect first
```

Approvals stay at `0` on purpose: the repository has one human owner, an author
cannot approve their own pull request, and a non-zero count would block every
merge. The `test` check is the real gate.

## 3. Deployments

`https://battleship2-xne9.vercel.app/` is canonical and is what the README, the
docs, the wiki, and the repository homepage all cite. A second Vercel project
(`battleship2`, served at `battleship2-gray.vercel.app`) is wired to the same
repository and currently serves an identical build; it is a duplicate to
retire, not a stale deployment. `battleship2.vercel.app` is an unrelated
project. Before deleting the duplicate, confirm the surviving project's
Production Branch is `master`, then redeploy and re-check the canonical URL.

## 4. Effect on the agent workflow

Agents open pull requests against `master` and cannot merge them; the owner
merges. Agents cannot change any setting on this page — a 403 on a settings
endpoint is expected and is reported rather than worked around. Agent feature
branches (`devin/<timestamp>-<slug>`) are unaffected by the ruleset and are
deleted after merge.

## 5. Remaining owner-only items

- Retire the duplicate Vercel project (section 3).
- Enable private vulnerability reporting (Settings → Security) so the advisory
  link in `SECURITY.md` works instead of falling back to email.
- Decide on the two ruleset points in section 2: adding the pull-request rule,
  and keeping or dropping `copilot_code_review`.
