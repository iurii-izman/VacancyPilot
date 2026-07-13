# ITER-064: Private Release Readiness Pack

Epic: EPIC-32
Commit: `docs: finalize private release readiness pack`

## Goal

Finish the private-distribution preparation layer so the repo has a coherent install, QA, and release-trust baseline before any public-release work.

## Scope

- align private install guide, release checklist, and related readiness docs with the implemented product;
- harden packaging/release evidence where the repo already has automation or scripts;
- record remaining blockers that belong to a later public-release epic.

## Non-Goals

- no Chrome Web Store submission;
- no new product features unrelated to release trust;
- no public-policy/legal completion pack;
- no multi-site work.

## Acceptance Criteria

- private release docs are internally consistent and match the codebase;
- the repo has a clear private-release checklist and evidence path;
- later public-release work is narrowed to a smaller follow-up epic.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
