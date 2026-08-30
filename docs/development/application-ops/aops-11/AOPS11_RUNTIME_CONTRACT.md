# AOPS-11 runtime contract

## Protected companion routes

- `GET /api/v1/integrations/hh/status` reports public-token and OAuth readiness only.
- `POST /api/v1/hh/auth/start` opens the fixed HH authorization URL in the normal system browser and returns only public state and expiry. It never returns the PKCE verifier.
- `GET /api/v1/hh/auth/callback` is the unprotected loopback browser callback. It consumes state before the companion exchanges the code and returns minimal HTML.
- `POST /api/v1/hh/auth/disconnect` clears the in-memory access token and the keyring token bundle.
- `GET /api/v1/hh/capabilities` probes `/me` and the optional applicant reads, returning explicit `AVAILABLE`, `DENIED_BY_HH`, or `ERROR` states.
- `POST /api/v1/hh/sync/applicant` performs only the same read-only capability discovery and returns a safe partial result when HH denies an optional capability. It never retries a denied capability blindly.
- Canonical `resumes_url` and `negotiations_url` values from `/me` are preferred only after validation against the official `https://api.hh.ru` origin and an allowlisted path; the fallback paths are `/resumes/mine` and `/negotiations`.

## Security invariants

- No HH writes, auto-apply, message sending, browser cookies, or HH session handling.
- OAuth secrets never enter SQLite, IndexedDB, logs, URLs, or command-line arguments.
- Access token, refresh token, and expiry metadata use one atomically replaced OS-keyring token bundle. A companion restart restores a still-valid access token without an early refresh.
- Upstream error bodies are not returned or persisted.
- OAuth state is single-use and expires after five minutes.
- HH refresh is attempted only after access-token expiry; a still-valid access token is reused.
- A refresh token is single-use: successful refresh atomically adopts the new access/refresh/expiry bundle, while refresh failure does not replace the prior bundle.
- Capability `DENIED_BY_HH` is an external optional-capability restriction, not an authentication failure; it is persisted as safe metadata and is not converted into a write fallback.
- Only loopback companion clients may call these routes through the existing pairing boundary.
