# Prompt AOPS-04 — Extension Ops Client and Offline Mode

Implement only epic `AOPS-04` in the open VacancyPilot repository root.

## Goal

Connect the existing WXT extension to the secured companion through a typed
adapter, settings and minimal pair/connect/disconnect UI while preserving every
Standalone Mode workflow when the companion is absent.

## Read first

1. `AGENTS.md`
2. `docs/development/CODEX-RUNTIME-BRIEF.md`
3. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` sections 7, 8.2–8.4, 11,
   12.8 and 16–18
4. ADR-001 and ADR-003
5. OpenAPI snapshot and pairing contract
6. Existing settings bridge, options UI, side panel shell, storage patterns,
   manifest and release-safety tests

## Required work

Implement:

- generated or schema-validated TypeScript contracts derived from the
  sanitized OpenAPI snapshot;
- `OpsClient` adapter with:
  - fixed configurable default `http://127.0.0.1:8765/api/v1`;
  - timeout and abort handling;
  - JSON/error-envelope parsing;
  - request ID generation;
  - client token header;
  - no automatic retry for non-idempotent calls;
  - typed health and pairing methods;
- companion settings stored through the existing `chrome.storage.local`
  settings bridge, not Dexie;
- pair/connect/disconnect flow using the server contract;
- local storage of only the companion client token and non-secret metadata;
- a minimal Companion section in the existing Settings/Options UI;
- visible states: unavailable, unpaired, pairing, connected, incompatible API,
  error;
- a small Engine/Ops status indicator in an existing appropriate shell without
  creating a new dashboard;
- capability/version handshake;
- optional localhost host permission requested only when the user enables Ops
  Mode, if WXT/Chrome requires it;
- clear fallback: existing save, score, letter, pipeline and export features
  continue in Standalone Mode.

## Permission/safety constraints

- no `api.hh.ru` permission in the extension;
- no broad `http://*/*`;
- no `tabs`, `history`, cookies, webRequest expansion or native messaging;
- no hidden HH fetch;
- no provider/HH secret storage;
- pairing token must not enter normal export;
- disconnect removes local pairing material and calls revoke when reachable.

## Tests

Cover:

- typed health success;
- incompatible API version;
- timeout/offline/error envelope;
- pairing success/failure/revoke;
- token header present only for companion calls;
- token excluded from export and logs;
- Standalone Mode features remain available;
- optional permission requested only by explicit action;
- manifest/release-safety snapshot permits only loopback addition;
- components have loading/error/offline/connected states and accessible labels.

## Non-goals

- no Dexie outbox/migration yet;
- no vacancy intake;
- no engine/HH/provider UI;
- no new dashboard route;
- no automatic companion install/start.

## Acceptance criteria

- extension build works with companion completely offline;
- user can pair and disconnect explicitly;
- local API incompatibility is explained, not silently ignored;
- no existing workflow is disabled by default;
- permission diff is minimal and guarded by release-safety tests;
- shared contracts do not drift from OpenAPI.

## Validation

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
pnpm verify:companion
git diff --check
```

## Handoff

Do not commit/push. Highlight manifest and storage changes separately.

Expected reviewed commit message:

```text
feat: connect extension to local Ops companion
```
