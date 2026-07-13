# ITER-003: Domain Models

Epic: EPIC-01
Commit: `feat: add domain model contracts`

## Goal

Implement typed domain models from the master specification.

## Scope

- JobStatus.
- Job.
- Company.
- Profile.
- Resume.
- CoverLetter.
- Application.
- EventLog.
- StatusChange.
- PassiveHHStatus.
- RiskFlag.
- AIAnalysis.
- AppSettings.
- AIRequestCache.

## Non-Goals

- No persistence implementation.
- No UI.
- No parser.

## Acceptance Criteria

- Types compile.
- Models are exported from stable paths.
- No `any` where core contracts are known.
- API key fields are not part of IndexedDB business entities.

## Validation

```text
pnpm typecheck
pnpm test
```
