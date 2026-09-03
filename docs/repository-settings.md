# Repository settings: default branch and branch protection

This document records the recommended GitHub settings for
`aackad21/battleship2` and the exact steps to apply them. Everything below is a
repository-settings change that only an administrator can make. The GitHub app
used by agents has no admin rights on this repository, so these steps must be
performed by the repository owner.

## 1. Starting point (observed 2026-09-03)

Inspected with the agent's GitHub app token (`gh api`):

| Call | Result |
| --- | --- |
| `GET repos/aackad21/battleship2` | `default_branch: "master"`; `permissions: admin=false, maintain=false, push=false` |
| `GET repos/aackad21/battleship2/branches/master` | `protected: false`, commit `318200e` |
| `GET repos/aackad21/battleship2/branches/devin%2F1788265893-testing-fixes` | `protected: false`, commit `318200e` (same commit as `master`) |
| `GET repos/aackad21/battleship2/branches/master/protection` | HTTP 403 `{"message":"Resource not accessible by integration","documentation_url":"https://docs.github.com/rest/branches/branch-protection#get-branch-protection","status":"403"}` |
| `GET repos/aackad21/battleship2/branches/devin%2F1788265893-testing-fixes/protection` | HTTP 403, same body |
| `GET repos/aackad21/battleship2/rulesets` | HTTP 200 `[]` (no rulesets exist) |
| `PUT repos/aackad21/battleship2/branches/master/protection` (attempted once, payload in section 5) | HTTP 403 `{"message":"Resource not accessible by integration","documentation_url":"https://docs.github.com/rest/branches/branch-protection#update-branch-protection","status":"403"}` |
| `POST repos/aackad21/battleship2/rulesets` (attempted once) | HTTP 403 `{"message":"Resource not accessible by integration","documentation_url":"https://docs.github.com/rest/repos/rules#create-a-repository-ruleset","status":"403"}` |

Summary: neither branch has classic branch protection or a ruleset. The
`protected: false` flag on the branch listing is readable without admin rights,
so it is a reliable indicator; the protection detail endpoint is not.

Note on the default branch: the repository API already reports `master` as the
default branch, while the legacy branch `devin/1788265893-testing-fixes` still
exists at the same commit. If Vercel is still configured to deploy
`devin/1788265893-testing-fixes`, section 2 still applies in full.

## 2. Default branch

Recommendation: `master` is the default branch. Retire
`devin/1788265893-testing-fixes` once Vercel deploys `master`.

The default branch decides what GitHub shows on the repository home page, what
new PRs target by default, and what `git clone` checks out. Vercel deploys
whatever branch is set as its **Production Branch**; it does not follow the
GitHub default automatically. Flipping the default branch while Vercel still
points at the legacy branch means production stops receiving merged changes and
goes stale.

Do these together:

1. Confirm `master` and `devin/1788265893-testing-fixes` point at the same
   commit (`git rev-parse origin/master origin/devin/1788265893-testing-fixes`).
2. Vercel: Project → Settings → Git → **Production Branch** → set to `master`
   → Save. Trigger a deployment (push to `master` or "Redeploy" in the Vercel
   dashboard) and confirm https://battleship2-xne9.vercel.app/ serves it.
3. GitHub: Settings → General → Default branch → switch to `master` (if not
   already `master`). Equivalent:
   `gh api --method PATCH repos/aackad21/battleship2 -f default_branch=master`
4. Retarget any open PRs that still point at `devin/1788265893-testing-fixes`
   to `master` (PR page → Edit next to the title → base branch).
5. Delete `devin/1788265893-testing-fixes` only after steps 2–4 are verified:
   `git push origin --delete devin/1788265893-testing-fixes`. Do not apply
   protection to this branch; it is being retired, and a protected branch cannot
   be deleted until the rule is removed.

## 3. Recommended protection for `master`

| Setting | Value | Reason |
| --- | --- | --- |
| Require a pull request before merging | On | All changes arrive as reviewable PRs, which is already the working practice. |
| Required approvals | 0 | The repository has a single human owner. Requiring 1 approval would block the owner from merging their own PRs (an author cannot approve their own PR) and would require a second account for every merge. Review still happens via the PR, and the required check below is the gate. |
| Dismiss stale approvals when new commits are pushed | On | Harmless with 0 required approvals; correct if approvals are ever enabled. |
| Require conversation resolution before merging | On | Review comments (including bot review comments) must be resolved before merge. |
| Require status checks to pass | On, check `test` (from the `CI` workflow, `.github/workflows/ci.yml`) | `npm test` must pass before merge. |
| Require branches to be up to date before merging | On | Forces a re-run of `test` against the merged state; the suite runs in seconds. |
| Block force pushes | On | Keeps history and Vercel deployments reproducible. |
| Block deletions | On | Prevents accidental loss of the production branch. |
| Require linear history | Off | Existing history uses merge commits (`Merge pull request #N`); enabling this would change the merge method for no benefit. |
| Require signed commits | Off | Not in use; would block agent commits. |
| Admin bypass (`enforce_admins`) | Do **not** let admins bypass (`enforce_admins: true`) | Recommended position: with 0 required approvals the only gate is the `test` check, and the owner is the only admin. Letting the admin bypass means the CI gate can be skipped by the one person most likely to be merging. If a hotfix must bypass CI, temporarily edit the rule rather than leaving a standing bypass. Rulesets equivalent: leave the **Bypass list** empty. |

About the required check: GitHub only offers a check in the required-checks
picker after that check has reported at least once on the repository. The `CI`
workflow (`.github/workflows/ci.yml`, job `test`) must run once (for example on
the PR that adds it) before step 4 in section 4 can select it. The name to
select is `test`; if the picker shows `CI / test`, that is the same check.

## 4. UI path (rulesets, recommended)

Settings → Rules → Rulesets → **New ruleset** → **New branch ruleset**:

| Field | Value |
| --- | --- |
| Ruleset Name | `protect-master` |
| Enforcement status | Active |
| Bypass list | (empty) |
| Target branches → Add target | **Include by pattern** → `master` (or **Include default branch**, once `master` is default) |
| Restrict deletions | checked |
| Require linear history | unchecked |
| Require signed commits | unchecked |
| Require a pull request before merging | checked |
| → Required approvals | `0` |
| → Dismiss stale pull request approvals when new commits are pushed | checked |
| → Require review from Code Owners | unchecked |
| → Require approval of the most recent reviewable push | unchecked |
| → Require conversation resolution before merging | checked |
| → Allowed merge methods | Merge, Squash, Rebase (leave defaults) |
| Require status checks to pass | checked |
| → Require branches to be up to date before merging | checked |
| → Add checks | `test` (search for `test`; source GitHub Actions) |
| Block force pushes | checked |
| Require deployments to succeed / code scanning results | unchecked |

Click **Create**.

Equivalent classic branch protection path: Settings → Branches → **Add
classic branch protection rule** → Branch name pattern `master`, then the same
values; the "Do not allow bypassing the above settings" checkbox corresponds to
`enforce_admins: true`. Use one mechanism or the other, not both; rulesets are
the current GitHub default and the one recommended here.

## 5. Equivalent API commands

Classic branch protection (this is the exact payload the agent attempted; it
returned HTTP 403 for the agent and will succeed for the owner):

```bash
gh api --method PUT repos/aackad21/battleship2/branches/master/protection \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "checks": [ { "context": "test" } ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "required_conversation_resolution": true,
  "block_creations": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
EOF
```

If the `test` check has not yet run, GitHub still accepts the payload (contexts
are stored by name), but merges will be blocked until a check named `test`
reports on the PR. Confirm the name matches the job name in
`.github/workflows/ci.yml` first.

Ruleset alternative (same rules as section 4):

```bash
gh api --method POST repos/aackad21/battleship2/rulesets --input - <<'EOF'
{
  "name": "protect-master",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["refs/heads/master"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [ { "context": "test" } ] } }
  ]
}
EOF
```

Verify afterwards:

```bash
gh api repos/aackad21/battleship2/branches/master --jq .protected   # true
gh api repos/aackad21/battleship2/branches/master/protection         # classic rule
gh api repos/aackad21/battleship2/rulesets                           # rulesets
```

## 6. Should the same apply to `devin/1788265893-testing-fixes`?

No. Protect `master` only. `devin/1788265893-testing-fixes` is a legacy branch
kept as the Vercel production branch until section 2 is complete, after which it
is deleted. Protecting it would only add a step (removing the rule) before it can
be deleted. Until it is retired, the practical protection is that agents cannot
push to it directly and only merge into it via PR. If the retirement is expected
to take a long time, the ruleset in section 4 can temporarily target both
branches (add a second **Include by pattern** entry); remove that entry before
deleting the branch.

## 7. Effect on the agent workflow

Today agents cannot merge into `master` at all: the app token has
`push: false`, and merging a PR into `master` is refused. The current workflow is
therefore "open a PR against `devin/1788265893-testing-fixes`, the owner merges,
then `master` is fast-forwarded to the same commit".

Once `master` is the default branch and is protected as above, expect:

- Agents open PRs against `master`. They cannot merge them; the owner merges.
  The fast-forward step disappears because there is only one branch.
- The `test` check must be green and the PR branch up to date with `master`
  before the Merge button is enabled. When `master` moves while a PR is open,
  the PR needs "Update branch" (or a rebase) and a fresh CI run. Agents can do
  this on their own branch; the owner can also click "Update branch".
- With `enforce_admins: true` (empty bypass list) the owner is subject to the
  same rules: no direct pushes to `master`, no merging with a red or missing
  `test` check. To land an emergency fix without CI, edit the rule, merge, and
  restore it.
- Agents still cannot change any of these settings; a 403 on any
  settings endpoint is expected and should be reported, not worked around.
- Agents' own feature branches (`devin/<timestamp>-<slug>`) are unaffected and
  can still be force-pushed and deleted.
