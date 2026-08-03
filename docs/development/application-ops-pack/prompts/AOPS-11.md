# Prompt AOPS-11 — HH OAuth PKCE and Read-only Applicant Sync

Implement only epic `AOPS-11` in the open VacancyPilot repository root.

Follow `../ZED_SESSION_START.md`: work only on synchronized `main`; do not
create a branch or PR, and leave commit/push to the Codex review gate.

## Goal

Add user-controlled HH OAuth with PKCE, secure token refresh/disconnect, account
and resume sync, and capability-gated read-only applicant response sync.

## Read first

1. `AGENTS.md`
2. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` sections 8, 11.4, 15
   `hh_accounts/hh_sync_runs`, 16.3, 20.3 and risks R1/R2
3. ADR-004 and current HH developer contract
4. Pairing/keyring/redaction implementation
5. Extension manifest/release-safety and existing HR timeline behavior
6. Current official HH OAuth and applicant API documentation

## External preflight

Identify and document:

- dev extension ID and `chrome.identity` redirect URI;
- production/private extension ID if available;
- required HH application registration fields;
- documented scopes/capabilities;
- whether PKCE is supported/required exactly as planned;
- endpoint availability for resumes and applicant negotiations.

If a registered redirect/application is unavailable, implement and test the
offline OAuth contract with fixtures, then mark live verification
`NOT RUN/BLOCKED`. Do not fake a connection PASS.

## OAuth flow

Implement explicit user action:

1. extension generates cryptographically random state and PKCE verifier;
2. stores them ephemerally with expiry;
3. derives challenge correctly;
4. launches `chrome.identity.launchWebAuthFlow`;
5. validates returned state and allowed redirect;
6. sends code, verifier and exact redirect URI to companion over paired API;
7. companion exchanges through documented HH endpoint;
8. access token remains in companion memory;
9. refresh token is stored in OS keyring;
10. extension receives only connected account/capability metadata.

Use server-side state binding as needed to prevent flow confusion; document the
chosen ownership precisely.

Implement:

```text
POST /api/v1/hh/auth/start
POST /api/v1/hh/auth/exchange
POST /api/v1/hh/auth/disconnect
POST /api/v1/hh/sync/resumes
POST /api/v1/hh/sync/negotiations
GET  /api/v1/hh/capabilities
```

Do not expose access/refresh tokens in any response.

## Refresh/disconnect

- one safe refresh attempt after documented 401 behavior;
- serialized refresh to avoid concurrent token races;
- rotated refresh token replaces old keyring value atomically;
- invalid refresh disconnects safely and surfaces re-auth requirement;
- disconnect revokes remotely only when officially documented/safe, always
  removes local token material and metadata state;
- no token in SQLite, Dexie, chrome storage, OpenAPI example, log or export.

## Read-only sync

Implement documented:

- current account identity;
- applicant resumes metadata needed by MVP;
- available applicant response/invitation/negotiation collection;
- capability discovery and feature flags;
- idempotent match by official vacancy/negotiation identity;
- append-only application events;
- proposed status update with deterministic mapping;
- automatic current-status projection only for an unambiguous documented
  read-only signal, with visible timeline;
- detailed messages remain disabled unless the official capability is verified
  and explicitly enabled later.

Never send applications or recruiter messages.

## Extension/UI

- add only required `identity` permission and exact tested callback behavior;
- HH Integration settings shows disconnected/connecting/connected/expired/
  limited/error;
- show capabilities and last sync;
- explicit sync/disconnect buttons;
- no token/personal raw response display.

## Tests

Cover:

- PKCE known vector/challenge;
- state mismatch/expiry/replay;
- redirect mismatch;
- successful exchange using fake server;
- token never returned/logged/stored outside keyring;
- concurrent 401 causes one refresh;
- refresh rotation and invalid refresh;
- disconnect deletion;
- account/resume normalization;
- capability absent/403 is safe;
- negotiation sync idempotency;
- ambiguous status does not auto-change;
- no HH POST application/message endpoint;
- manifest permission snapshot.

Live manual contract tests remain opt-in and must sanitize output.

## Non-goals

- no detailed negotiation messages as P0 blocker;
- no daily sync;
- no automatic application/message/form action;
- no browser cookie/session access;
- no OAuth secret in extension.

## Acceptance criteria

- mocked connect/refresh/disconnect passes;
- live status is honestly reported;
- secrets stay only in keyring/memory;
- resumes and available read-only responses sync idempotently;
- capability gaps degrade gracefully;
- release-safety proves no unsafe permissions/HH writes.

## Validation

```powershell
pnpm verify
pnpm test:release
pnpm verify:companion
git diff --check
```

## Handoff

Do not commit/push. Separate mocked PASS from live/manual gates and list exact
official docs used.

Expected reviewed commit message:

```text
feat: add secure HH OAuth and applicant sync
```
