# ITER-057: Profile Experience And Seniority Model

Epic: EPIC-29
Commit: `feat: add profile experience model`

## Goal

Extend the local profile model so score quality can become meaningfully candidate-specific instead of treating experience as mostly neutral.

## Scope

- add profile fields for:
  - `experienceYears`;
  - `seniority`;
- surface those fields in profile management/editing flows;
- persist, load, edit, and validate the new fields through the current local model/UI;
- add or update focused tests around model, profile editor, and persistence behavior.

## Non-Goals

- no scoring-calibration logic yet;
- no industry/domain model expansion;
- no language-fit scoring yet;
- no AI or resume workflow changes.

## Acceptance Criteria

- a user can set and edit years of experience and a seniority level in local profiles;
- the new fields persist correctly and remain backwards-compatible with older profile records;
- profile-related tests cover the new fields;
- the repository is ready for a follow-up scoring iteration that consumes these inputs.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
