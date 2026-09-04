# Battleship: Fleet Command v1.0.1

Release notes for tag `v1.0.1`. Copy the body below into the GitHub Release.

- Tag: `v1.0.1`
- Target branch: `master`, the only branch
- Title: `Battleship: Fleet Command v1.0.1`
- Publish at the merge commit of this pull request, so the archive contains the
  community health documents and the settings record that landed after `v1.0.0`

---

A documentation and repository release. No gameplay, engine, or asset change:
https://battleship2-xne9.vercel.app/ serves the same build as `v1.0.0`, and the
defect register in [`TESTING.md`](https://github.com/aackad21/battleship2/blob/master/TESTING.md)
is unchanged with every entry closed.

`v1.0.0` was tagged before the community health documents merged, so anyone
downloading that archive got a repository without `CONTRIBUTING.md`,
`SECURITY.md`, `CODE_OF_CONDUCT.md`, or the issue and pull request templates.
This tag is the first archive that contains them.

## What is in this release

- Contribution and support documents: `CONTRIBUTING.md`, `SUPPORT.md`,
  `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1).
- Security policy: `SECURITY.md`, plus `.github/CODEOWNERS`, a pull request
  template, and structured bug and feature issue forms.
- `docs/repository-settings.md` records the repository settings as configured
  and verified, rather than as recommendations still to apply.
- `TESTING.md` records the release readiness run against the deployed build:
  the eleven web-served files were confirmed byte-identical to the default
  branch before testing, and the run raised no defect.

## Upgrading from v1.0.0

Nothing to do. There is no runtime dependency, no build step, and no saved
state format change, so browser-local profiles and career statistics carry
over untouched.

## Links

- Production deployment: https://battleship2-xne9.vercel.app/
- Debug report and defect register: https://github.com/aackad21/battleship2/blob/master/TESTING.md
- Changelog: https://github.com/aackad21/battleship2/blob/master/CHANGELOG.md
- Previous release: https://github.com/aackad21/battleship2/releases/tag/v1.0.0
