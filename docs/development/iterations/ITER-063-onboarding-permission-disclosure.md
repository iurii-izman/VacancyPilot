# ITER-063: Onboarding And Permission Disclosure

Epic: EPIC-32
Commit: `feat: complete onboarding and permission disclosure`

## Goal

Bring onboarding, permission explanation, and privacy disclosure surfaces up to the actual runtime product so private testers are not relying on guesswork.

## Scope

- audit current onboarding/settings/privacy disclosure against the implemented extension behavior;
- fill the highest-value missing surfaces or gaps;
- align permission explanations with the real manifest and optional features;
- add focused tests or fixture coverage where practical.

## Non-Goals

- no public store copywriting pack;
- no legal-policy finalization;
- no new permissions;
- no multi-site work.

## Acceptance Criteria

- a private tester can see what the extension does, does not do, and which permissions it uses;
- docs and runtime disclosure no longer materially diverge;
- the change stays within the current manifest posture.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
