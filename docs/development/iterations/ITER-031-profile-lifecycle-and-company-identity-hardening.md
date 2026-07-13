# ITER-031: Profile Lifecycle And Company Identity Hardening

Epic: EPIC-14
Commit: `fix: make coverLetter profileId nullable, parse employer ID, verify recompute UX`

## Goal

Clean up the remaining confirmed lifecycle/data-model issues around deleted profiles and weak company identity, and add explicit coverage for the score-refresh UX path.

## Inputs

- `docs/development/ITER-027-triage-report.md`
- current repository state after `ITER-030`

## Scope

- make `CoverLetter.profileId` nullable/optional in a coherent way;
- stop writing empty-string orphan values on profile delete;
- add parsing/storage of employer/source company ID from HH vacancy data when available;
- use the new company identity data in tracker mapping where appropriate;
- add explicit test coverage for profile-selection recompute refresh flow.

## Non-Goals

- no destructive profile-delete UX redesign with counts;
- no attempt to solve every company identity collision case beyond the confirmed local improvement;
- no manual browser rerun execution in this iteration.

## Acceptance Criteria

- cover letters no longer rely on `""` as a fake missing-profile state;
- tracker preserves stronger employer identity when HH provides it;
- profile-selection recompute refresh path has explicit automated coverage;
- existing behavior remains compatible with current Phase 1 scope.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
