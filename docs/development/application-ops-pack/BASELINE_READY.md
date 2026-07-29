# VacancyPilot Application Ops — Baseline Ready

Prepared: 2026-07-29

Target: the VacancyPilot repository root containing this file.

## Final local Git state

```text
branch: codex/application-ops-mvp
pre-import predecessor: e36a067ae4e8ef931bf0f151712016cb4dbce47e
repo-native pack import: 8117cc7ec479210a027bc09954d9069c65d23bd4
worktree: clean
v4.0.0: ABSENT
```

Historical MVP baseline
`71ab48c48376a1e7b44ed0733fdc9aa435f39e76` is an ancestor of the prepared
HEAD.

## Preserved predecessor work

The original dirty tree contained a coherent documentation pack for the
already implemented Search Highlights work. It was reviewed, corrected to
match actual commit history, and committed without changing runtime:

```text
e36a067 docs: close search highlights implementation pack
```

The preceding runtime history remains:

```text
083d360 fix search highlights discovery
71ab48c fix: harden search highlights rendering
e6c3958 feat: add search highlights controls and qa pack
63474fb feat: add search highlights mvp
1d55ab0 feat: add local visit marks foundation
```

Local `main` was fast-forwarded to `e36a067`, then
`codex/application-ops-mvp` was created at the same commit. The later
repo-native pack import belongs only to the AOPS branch.

## Executed validation on the prepared HEAD

```text
pnpm verify
exit: 0
typecheck: passed
lint: passed
unit/integration: 65 files, 1700 tests passed
production Chrome MV3 build: passed

pnpm test:release
exit: 0
release safety: 10 files, 391 tests passed
production Chrome MV3 build: passed
```

The expected error logging in two negative `openSidePanel` tests appeared on
stderr; both tests passed and the full command exited `0`.

## Checks

- Changed-document reference scan: no missing referenced Markdown files.
- Secret-pattern scan: no credential-like values found.
- Staged diff whitespace check: passed.
- `v4.0.0`: absent locally and on the configured `origin`; it was not created,
  moved, or deleted.
- Runtime Application Engine V4: not modified.
- Remote branches/tags: not pushed or rewritten.

## Remote note

Preparation is intentionally local:

```text
local main is 2 commits ahead of origin/main
local fix/search-highlights-card-discovery is 1 commit ahead of its origin
codex/application-ops-mvp has no remote branch yet
```

This is not a blocker for local Zed implementation. Publishing remains a
separate explicit action after review.

## AOPS-00 start gate

Proceed only when these commands still show the prepared state:

```powershell
git status --short --branch
git branch --show-current
git rev-parse HEAD
git merge-base --is-ancestor 71ab48c48376a1e7b44ed0733fdc9aa435f39e76 HEAD
git merge-base --is-ancestor e36a067ae4e8ef931bf0f151712016cb4dbce47e HEAD
git merge-base --is-ancestor 8117cc7ec479210a027bc09954d9069c65d23bd4 HEAD
```

Expected:

```text
branch: codex/application-ops-mvp
worktree: clean
all ancestry commands exit: 0
```

If any value differs, stop and review the new state instead of resetting it.
