---
name: ready
description: Enterprise-readiness audit and documentation refresh for this repo. Use when asked whether the repo is "ready", presentation/share/review ready, to run the readiness checklist, or to update/refresh all the .md docs (README, TESTING, CHANGELOG, CONTRIBUTING, SECURITY, SUPPORT, CREDITS, docs/, wiki) so they are consistent with master, the release, and the live deployment.
---

# Readiness audit and doc refresh

Two modes, both driven from this file:

- **Audit** ("is this ready to share/present?") — verify every item below and report
  pass/fail with evidence. Do not claim an item passes without the command output.
- **Refresh** ("update all the .md" / "make the docs consistent") — run part B, fix every
  drift, land it as one PR, and push the wiki separately.

Never report an item as done from memory or from a previous session. Re-run the check.

## Canonical facts

| Thing | Value |
|---|---|
| Repo | `aackad21/battleship2`, default branch `master` |
| Play URL (canonical everywhere) | `https://battleship2-xne9.vercel.app/` |
| Duplicate Vercel project | `battleship2-gray.vercel.app` — same build, different project; never cite it in docs |
| Unrelated | `battleship2.vercel.app` is somebody's "React App", not this game |
| CI | workflow `CI`, **check name is the job, `test`** — a ruleset requiring context `CI` never reports |
| Tests | `npm test` (engine, powers, profile). No dependencies, no lockfile, no `npm ci` |
| Owner contact | `aackad21@gmail.com` |

Devin's GitHub app has **no admin rights** here: rulesets, description, homepage, topics,
default branch, and code-scanning reads all return `403 Resource not accessible by
integration`. Those are owner actions — hand over exact values, never claim they were
applied. Also, with pull-requests-required on `master`, `master` can no longer be
fast-forwarded directly; changes land as PRs the owner merges.

## A. Enterprise-readiness checklist

Run these and record output.

```bash
gh api repos/aackad21/battleship2 --jq '{default_branch,description,homepage,topics,license:.license.spdx_id,visibility,archived,has_issues,has_wiki}'
gh api repos/aackad21/battleship2/community/profile --jq '{health_percentage,files:(.files|map_values(.!=null))}'
gh api repos/aackad21/battleship2/rulesets --jq '.[].id'
gh api repos/aackad21/battleship2/rulesets/<id> | python3 -m json.tool
gh api repos/aackad21/battleship2/releases --jq '.[]|{tag_name,draft,prerelease,target_commitish}'
gh api "repos/aackad21/battleship2/actions/runs?branch=master&per_page=3" --jq '.workflow_runs[]|{name,head_sha,conclusion}'
git ls-remote --heads origin
```

1. **Metadata** — `description`, `homepage` (canonical Play URL), and non-empty `topics`.
   A `null` description or `[]` topics is the most common miss.
2. **Licence** — `LICENSE` present and detected as MIT by the API; `license: MIT` in
   `package.json`; third-party assets (CC0 sounds) credited in `CREDITS.md`.
3. **Community health = 100%** — `README`, `LICENSE`, `CONTRIBUTING.md`,
   `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue templates, PR template. Plus
   `SUPPORT.md` and `.github/CODEOWNERS`.
4. **CI green on the current `master` tip**, and the workflow's trigger branches must all
   still exist (a deleted branch left in `on: push:` is stale config).
5. **Branch protection** — an *active* ruleset whose `conditions.ref_name.include` is
   non-empty (`~DEFAULT_BRANCH`). "targeting 0 branches" means it protects nothing.
   Required: restrict deletions, block force pushes, require a PR, require status check
   **`test`**. Reject rules with no tooling behind them — CodeQL/code-scanning, code
   coverage, code quality, Copilot review, required signatures — they leave PRs
   permanently pending. Reject restrict-creations, restrict-updates, and
   require-linear-history: they block ordinary pushes and merge commits.
6. **Release** — published (not draft) `v1.0.0`, and the tag must contain the current
   docs/CI/licence. Verify by downloading the tag archive and listing it, not by
   trusting the tag name.
7. **Branches** — only `master` should remain; delete merged feature branches.
8. **One deployment story** — every doc cites the canonical Play URL, and the duplicate
   Vercel project is retired or at least never referenced.
9. **Debug evidence** — `TESTING.md` register has no open defect, and its per-fix
   validation column distinguishes browser-validated from statically guarded.

## B. Documentation refresh

Files that must agree with each other and with reality: `README.md`, `TESTING.md`,
`CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`,
`CREDITS.md`, `docs/acceptance-test-plan.md`, `docs/release-notes-*.md`,
`docs/repository-settings.md`, and the wiki (`Home`, `Getting-Started`,
`Abilities-and-Power-Ups`, `Development-and-Testing`, `FAQ-and-Troubleshooting`).

Do all of this:

1. **Branch and commit references.** No document may name a deleted branch or a
   superseded commit. Replace `blob/<old-branch>/` with `blob/master/`, and update
   "latest release commit" lines to the actual tip.
2. **Deployment URLs.** Exactly one Play URL across every file and the wiki.
3. **Feature drift.** Any behaviour added this session (modes, variants, commanders,
   abilities, power-ups, drag deployment, HUD cards, controls) must appear in README's
   feature/controls sections and in the wiki, not just in the changelog.
4. **Changelog.** Player-visible changes go under `## [Unreleased]` in Keep a Changelog
   form; move them under a version heading only when a release is cut.
5. **Defect register.** Every fixed defect keeps its ID (`P-01`, `D-01`, `H-01..H-03`,
   `F-01..F-04`) and the full schema: repro, expected vs actual, evidence, root cause,
   fix + PR/commit, regression test, validation state. Add new browser acceptance runs
   with the commit they ran against. State residual risk instead of implying full
   coverage.
6. **Relative links.** Repo docs link to files relatively; the wiki must use absolute
   `blob/master` URLs because relative links do not resolve there.
7. **Link check every URL** before claiming consistency:

```bash
grep -rhoE 'https?://[^ )>"]+' README.md TESTING.md CHANGELOG.md CONTRIBUTING.md SECURITY.md SUPPORT.md CREDITS.md docs/ ../bs2wiki/*.md \
  | sed 's/[.,]$//' | sort -u \
  | while read -r u; do printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 "$u")" "$u"; done | sort
```

8. **Verify the live build actually matches** `master` before saying the deployment is
   current — fetch a served asset and diff it against the repo file, or compare ETags
   across the two Vercel hosts.

### Wiki

The wiki is a separate git repo and is **not** part of the PR:

```bash
git clone https://github.com/aackad21/battleship2.wiki.git ~/bs2wiki
# edit, then
cd ~/bs2wiki && git add -A && git commit -m "..." && git push
```

## C. Reporting

- Repo file changes → one PR against `master` using the repo PR template; run `npm test`,
  `python3 -c "import yaml,glob; [yaml.safe_load(open(f)) for f in glob.glob('.github/**/*.yml',recursive=True)]"`,
  and `git diff --check` first.
- Wiki changes → pushed directly; report the commit SHA.
- Split the report into **done** versus **owner-only**, and give owner items as exact
  values or `gh api` commands. Keep the current owner-only list in
  `docs/repository-settings.md` and update it as items are completed.
- UI verification is delegated to the testing agent; attach its recording and cite the
  commit it tested. If code moved after that run, say whether the intervening diff
  touched `index.html`, `css/`, `js/`, or `assets/` — if it did not, the verification
  still stands for the game code.
