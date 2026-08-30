# AOPS-11 runtime contract

## Protected companion routes

- `GET /api/v1/integrations/hh/status` reports public-token and OAuth readiness only.
- `POST /api/v1/hh/auth/start` opens the fixed HH authorization URL in the normal system browser and returns only public state and expiry. It never returns the PKCE verifier.
- `GET /api/v1/hh/auth/callback` is the unprotected loopback browser callback. It consumes state before the companion exchanges the code and returns minimal HTML.
- `POST /api/v1/hh/auth/disconnect` clears the in-memory access token and the keyring token bundle.
- `POST /api/v1/hh/sync/applicant` performs only `GET /resumes/mine` and `GET /negotiations`, returning an allowlisted identifier/status projection.

## Security invariants

- No HH writes, auto-apply, message sending, browser cookies, or HH session handling.
- OAuth secrets never enter SQLite, IndexedDB, logs, URLs, or command-line arguments.
- Access token, refresh token, and expiry metadata use one atomically replaced OS-keyring token bundle. A companion restart restores a still-valid access token without an early refresh.
- Upstream error bodies are not returned or persisted.
- OAuth state is single-use and expires after five minutes.
- HH refresh is attempted only after access-token expiry; a still-valid access token is reused.
- Only loopback companion clients may call these routes through the existing pairing boundary.
