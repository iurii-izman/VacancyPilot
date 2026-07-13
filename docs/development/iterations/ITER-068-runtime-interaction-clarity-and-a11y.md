# ITER-068: Runtime Interaction Clarity And Accessibility

Epic: EPIC-34
Commit: `feat: improve runtime interaction clarity`

## Goal

Improve interaction clarity, feedback, and baseline accessibility across popup, side panel, and search triage surfaces.

## Scope

- improve labels, feedback text, button grouping, and disabled/busy/success/error states;
- improve accessibility semantics and keyboard flow where the current runtime UI is weak;
- refine popup, side panel, and search triage interactions so intent and result are clearer;
- add focused tests for interactive state behavior where practical.

## Non-Goals

- no search/runtime architectural rewrite;
- no public-release/store copy work;
- no broad feature additions.

## Acceptance Criteria

- high-frequency runtime actions provide clearer feedback before and after activation;
- interactive surfaces are easier to understand without trial-and-error;
- accessibility semantics are improved in the most important flows;
- tests cover the most important interaction-state regressions.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
