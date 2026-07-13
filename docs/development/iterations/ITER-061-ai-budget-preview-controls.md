# ITER-061: AI Budget Preview Controls

Epic: EPIC-31
Commit: `feat: add ai budget preview controls`

## Goal

Add practical cost and request-budget visibility to AI analysis and letter-generation flows so the user can act deliberately.

## Scope

- add provider-local metadata needed for token/cost preview;
- token/input-size preview where possible;
- approximate cost preview or explicit "not available" state;
- local daily request-budget controls and enforcement UX;
- focused tests around preview/budget logic and failure states.

## Non-Goals

- no server metering;
- no billing integration;
- no speculative pricing service;
- no new provider architecture.

## Acceptance Criteria

- AI actions show previewable request size and cost when derivable;
- if cost cannot be computed, the UI says so clearly;
- users can set and hit a local budget limit without silent bypass.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
