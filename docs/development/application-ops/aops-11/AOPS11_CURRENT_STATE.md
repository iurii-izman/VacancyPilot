# AOPS-11 current state

## Boundary

AOPS-10 was fully accepted and locally merged into `main` before this branch was created. AOPS-11 is implemented on `feat/aops-11-hh-oauth-sync` and has not been merged.

## Implemented

- PKCE state/verifier generation with a five-minute, single-use pending session.
- Authorization-code exchange and refresh-token rotation through the official HH token endpoint.
- Access token, refresh token, and expiry metadata use one OS-keyring token bundle; valid access tokens are restored across companion restarts without early refresh.
- Protected companion routes for OAuth start/callback/disconnect and read-only applicant projection.
- Read-only client methods for `/resumes/mine` and `/negotiations`.
- Safe status reporting without token values or raw upstream payloads.
- Interactive local client-secret setup command that never accepts the secret as a CLI argument.

## Live acceptance state

Current local configuration is:

- `VACANCYPILOT_HH_CLIENT_ID`: configured
- `VACANCYPILOT_HH_REDIRECT_URI`: configured
- OS-keyring `HH_CLIENT_SECRET`: configured
- OS-keyring OAuth token bundle: present after explicit authorization

The registered redirect is the exact VacancyPilot loopback callback. Earlier Postman-based attempts are obsolete. AOPS-11 uses a real GET callback and does not refresh while the access token is still valid. Live `/me` succeeded with applicant auth; canonical `/resumes/mine` and `/negotiations` both returned sanitized 403 `forbidden` responses. These are represented as `DENIED_BY_HH`, persisted as safe capability metadata, and do not trigger retries or writes. The honest live matrix is `account=AVAILABLE`, `resumes=DENIED_BY_HH`, `negotiations=DENIED_BY_HH`; this is partial live capability acceptance, not successful resume/negotiation sync.
