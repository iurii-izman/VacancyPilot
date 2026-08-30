# AOPS-11 — Official HH OAuth and applicant API evidence

Checked against the official HH API documentation on 2026-08-30:

- OAuth authorization starts at `https://hh.ru/oauth/authorize`.
- The authorization-code exchange uses `POST https://api.hh.ru/token`.
- PKCE uses `code_challenge` and `code_challenge_method=S256`; the verifier is kept in the local companion pending-session map and is never returned to the extension.
- Applicant read endpoints are `GET /me`, `GET /resumes/mine`, `GET /negotiations`, `GET /negotiations/{id}`, and `GET /negotiations/{id}/messages`.
- AOPS-11 uses only GET applicant endpoints. It does not send applications, messages, or any other HH write request.
- HH refresh tokens are single-use and are intended for refresh only after the current access token expires; an early refresh rejection is not an OAuth implementation failure.

The runtime uses the official API base URL, a stable User-Agent, bounded timeouts, and sanitized error codes. The OAuth client secret and token bundle are OS-keyring secrets; client id and the registered loopback redirect URI are non-secret local configuration. No HH cookie, password, or session is handled.

Official references:

- [HH API OpenAPI/Redoc](https://api.hh.ru/openapi/redoc)
- [HH API authorization documentation](https://github.com/hhru/api/blob/master/docs/authorization.md)
- [HH API negotiations documentation](https://github.com/hhru/api/blob/master/docs/negotiations.md)
