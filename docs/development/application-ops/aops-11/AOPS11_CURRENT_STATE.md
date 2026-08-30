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

## Live blocking state

Current local configuration is:

- `VACANCYPILOT_HH_CLIENT_ID`: configured
- `VACANCYPILOT_HH_REDIRECT_URI`: configured
- OS-keyring `HH_CLIENT_SECRET`: configured
- OS-keyring `HH_REFRESH_TOKEN`: present but rejected by HH during refresh

Explicit browser authorization reached the registered callback, but live token/resource acceptance is blocked by `HH_OAUTH_TOKEN_REJECTED` on refresh and a subsequent exchange timeout. AOPS-11 remains unmerged.
