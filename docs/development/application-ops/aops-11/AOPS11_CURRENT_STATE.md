# AOPS-11 current state

## Boundary

AOPS-10 was fully accepted and locally merged into `main` before this branch was created. AOPS-11 is implemented on `feat/aops-11-hh-oauth-sync` and has not been merged.

## Implemented

- PKCE state/verifier generation with a five-minute, single-use pending session.
- Authorization-code exchange and refresh-token rotation through the official HH token endpoint.
- Access token memory-only handling; refresh token and client secret use OS keyring slots.
- Protected companion routes for OAuth start/callback/disconnect and read-only applicant projection.
- Read-only client methods for `/resumes/mine` and `/negotiations`.
- Safe status reporting without token values or raw upstream payloads.
- Interactive local client-secret setup command that never accepts the secret as a CLI argument.

## Blocking readiness

Current local readiness is:

- `VACANCYPILOT_HH_CLIENT_ID`: absent
- `VACANCYPILOT_HH_REDIRECT_URI`: absent
- OS-keyring `HH_CLIENT_SECRET`: absent
- OS-keyring `HH_REFRESH_TOKEN`: absent

Therefore live OAuth authorization and the AOPS-11 acceptance smoke are intentionally not claimed.
