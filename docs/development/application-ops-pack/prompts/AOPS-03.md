# Prompt AOPS-03 — Localhost Security, Pairing and Secrets

Implement only epic `AOPS-03` in the open VacancyPilot repository root.

Precondition: run on clean synchronized `main` with AOPS-02 commit
`8d8c11efecb50b10fed77d8a3bb855a76b653a40` in the ancestry. Follow the
repo-local session contract; do not create a branch or pull request.

## Goal

Secure the loopback companion before exposing domain operations: strict
origin policy, pairing lifecycle, authenticated requests, OS-keyring
abstraction, rate/size/content controls, and secret-safe logging.

## Read first

1. `AGENTS.md`
2. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` sections 8, 17–19 and risks
   R1/R6
3. ADR-001, ADR-003 and ADR-004
4. `API_CONTRACT_V1.md`
5. Current companion configuration, middleware and tests

## Threat model

Another local webpage/process can attempt to call the loopback service, guess a
pairing code, replay a token, send oversized payloads, or force secrets into
logs. The extension must receive only its own client credential, never HH/AI
provider credentials.

## Required work

Implement:

- startup validation that refuses non-loopback bind addresses;
- explicit configured extension origins; no wildcard CORS;
- no credentialed browser CORS unless strictly required and justified;
- `POST /api/v1/pair/start`;
- `POST /api/v1/pair/confirm`;
- `POST /api/v1/pair/revoke`;
- short-lived six-digit pairing code with expiry, bounded attempts and
  single-use behavior;
- cryptographically random client token;
- stored token verification using a safe representation, not plaintext in
  SQLite;
- required authenticated headers:
  `X-VacancyPilot-Client` and `X-VacancyPilot-Request-ID`;
- auth dependency ready for future protected routes;
- request body limit, JSON content-type enforcement and bounded local
  rate-limiting for pairing/protected calls;
- keyring interface with production OS keyring and an explicit in-memory fake
  only for tests;
- secret names for HH application token, HH refresh token, AI key and pairing
  material;
- disconnect/revoke deletion semantics;
- structured logs with central redaction for authorization headers, tokens,
  keys, email/phone/contact fields and credential-bearing URLs;
- sanitized error responses that never contain secret values or tracebacks.

Pair bootstrap may be unauthenticated only for the minimal start/confirm flow.
Document how the user obtains the code locally.

## Tests

Add positive and negative coverage:

- companion refuses `0.0.0.0`;
- allowed origin succeeds; arbitrary web origin is denied;
- wildcard origin is absent;
- code expires, is single-use, and locks/backs off after bounded failures;
- wrong code and wrong token are rejected;
- revoke immediately invalidates token;
- oversized/non-JSON request rejected;
- request IDs remain non-secret and bounded;
- secret values never appear in captured logs, errors or OpenAPI examples;
- keyring fake behavior and delete path;
- protected sample/test route requires client token without exposing a
  production domain endpoint.

## Extension boundary

Do not yet add extension UI or storage. Define the public pairing contract only
through OpenAPI/shared contracts.

## Non-goals

- no HH OAuth;
- no provider API key UI;
- no vacancy endpoints;
- no browser permissions;
- no cloud auth/JWT platform;
- no TLS claim for loopback MVP;
- no real secrets in tests.

## Acceptance criteria

- all non-health future domain routes can use one tested auth dependency;
- loopback/origin/token invariants have negative tests;
- keyring is the only production secret store;
- logs/errors/exports contain no test secret;
- OpenAPI snapshot documents auth/error behavior without secret examples.

## Validation

```powershell
pnpm verify:companion
pnpm verify
pnpm test:release
git diff --check
```

Run focused security tests with verbose output and include them in handoff.

## Handoff

Do not commit or push.

Expected reviewed commit message:

```text
feat: secure and pair the Ops companion
```
