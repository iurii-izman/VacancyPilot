# ITER-044: HR Timeline Capture And Classification

Epic: EPIC-23
Commit: `feat: add hr timeline capture`

## Goal

Create the safe read layer for HR communication by extracting visible negotiation / application signals from user-opened HH pages and normalizing them into local timeline data.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `3.2`, `3.3`, `Phase 5`, `24.3`
- current repository state after `ITER-054`

## Scope

- HH adapter support for read-only extraction on relevant `applications` / `messages` surfaces;
- sanitized fixtures for visible HR reply states and message-like metadata;
- local timeline / conversation data model linked to `Application`;
- reply classification heuristics for:
  - `invitation`
  - `rejection`
  - `question`
  - `test_task`
  - `interview`
  - `unknown`
- focused parser and classification tests.

## Non-Goals

- no reply drafting UI yet;
- no hidden polling or background page traversal;
- no webhook / Telegram sending;
- no auto-reply or DOM writes into HH fields.

## Acceptance Criteria

- user-opened HH application or negotiation pages can be parsed into deterministic local HR timeline data;
- classifications are explicit and covered by fixtures/tests;
- the new read layer introduces no hidden network or automation behavior.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
