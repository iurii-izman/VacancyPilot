# AOPS-11 runtime contract

## Protected companion routes

- `GET /api/v1/integrations/hh/status` reports public-token and OAuth readiness only.
- `POST /api/v1/hh/auth/start` returns an HH authorization URL, public state, and expiry. It never returns the PKCE verifier.
- `POST /api/v1/hh/auth/callback` accepts only the short-lived state/code pair and consumes state before exchanging it.
- `POST /api/v1/hh/auth/disconnect` clears the in-memory access token and keyring refresh token.
- `POST /api/v1/hh/sync/applicant` performs only `GET /resumes/mine` and `GET /negotiations`, returning an allowlisted identifier/status projection.

## Security invariants

- No HH writes, auto-apply, message sending, browser cookies, or HH session handling.
- OAuth secrets never enter SQLite, IndexedDB, logs, URLs, or command-line arguments.
- Upstream error bodies are not returned or persisted.
- OAuth state is single-use and expires after five minutes.
- Only loopback companion clients may call these routes through the existing pairing boundary.
