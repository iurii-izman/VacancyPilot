# ITER-060: AI Settings Lifecycle Hardening And First Real Provider

Epic: EPIC-31
Commit: `feat: harden ai settings and add first real provider`

## Goal

Make AI settings and local API-key handling more predictable, explicit, and recoverable for private users, and land the first real BYOK AI provider on the existing architecture.

## Scope

- review current AI settings persistence and reset/update behavior;
- implement one real provider on the current provider boundary (OpenAI or OpenRouter preferred);
- harden local key lifecycle UX and warnings without inventing fake security guarantees;
- improve empty/error/saved states for provider configuration;
- add focused tests for settings persistence, key-handling behavior, and the new provider wiring.

## Non-Goals

- no backend vault;
- no sync storage;
- no provider architecture rewrite;
- no `n8n` or public release work.

## Acceptance Criteria

- AI settings changes behave predictably across popup/dashboard/side panel surfaces where relevant;
- API-key handling is explicit about local-only storage and reset/delete behavior;
- at least one real provider can be configured and invoked through the existing opt-in flow;
- tests cover the main lifecycle transitions.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
