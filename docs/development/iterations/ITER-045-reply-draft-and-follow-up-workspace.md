# ITER-045: Reply Draft And Follow-Up Workspace

Epic: EPIC-23
Commit: `feat: add hr follow up workspace`

## Goal

Turn the captured HR timeline into a practical local workspace where the user can review context, plan the next follow-up, and prepare a manual reply.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `3.3`, `3.9`, `Phase 5`, `24.3`
- current repository state after `ITER-044`

## Scope

- dashboard or application-level HR timeline view built from local data;
- follow-up planning controls integrated with existing reminder logic where appropriate;
- reply draft workspace with copy-only workflow;
- local notes / next-step capture tied to the application record;
- focused tests for workspace state, follow-up updates, and no-auto-send boundaries.

## Non-Goals

- no DOM writes into HH chat or form fields;
- no background notification delivery;
- no hidden communication capture;
- no reopening of `n8n` permissions.

## Acceptance Criteria

- the user can review HR history, set the next manual follow-up, and prepare a reply without leaving product boundaries;
- reply help remains explicit, local-first, and copy/paste based;
- reminder and application state stay consistent after workspace actions.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
