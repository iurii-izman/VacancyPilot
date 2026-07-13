# ITER-073: Onboarding And About Role Separation

Epic: EPIC-36
Commit: `refactor: separate onboarding and about surfaces`

## Goal

Separate the roles of About and Onboarding so the product explains itself once, clearly, and in the right place.

## Scope

- make About a short product identity/version/status surface;
- turn Onboarding into a step-oriented first-run setup surface;
- extract a reusable trust/safety summary layer only if it removes real duplication;
- preserve strong safety and privacy messaging while reducing repeated long-form explanations.

## Non-Goals

- no new onboarding persistence logic unless a tiny local UI-state helper is required;
- no permissions changes;
- no AI/provider feature expansion;
- no public-release/store copy work.

## Acceptance Criteria

- About is readable quickly and acts as a compact product/status page;
- Onboarding becomes actionable rather than only explanatory;
- duplicate long-form trust/safety blocks are reduced or shared cleanly;
- safety posture remains visible and accurate without reading as copy-pasted content.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
