# AOPS-11 acceptance report

## Verdict

`AWAITING_HH_OAUTH_APP_CREDENTIALS`

## Acceptance state

The AOPS-11 code boundary is implemented and locally validated, but full acceptance cannot be claimed because the local HH OAuth application registration is incomplete:

- `VACANCYPILOT_HH_CLIENT_ID` is absent.
- `VACANCYPILOT_HH_REDIRECT_URI` is absent.
- OS-keyring `HH_CLIENT_SECRET` is absent.

No secret was requested or printed in chat. AOPS-11 was not merged; AOPS-10 remains accepted and merged locally.

## Implemented and tested

| Area | Result |
|---|---|
| OAuth PKCE | S256 challenge, random state/verifier, five-minute single-use state |
| Token lifecycle | Official token endpoint, memory-only access token, keyring refresh rotation, serialized refresh |
| Local API | auth start/exchange/callback/disconnect, capabilities, read-only resumes/negotiations routes |
| Applicant client | `/me`, `/resumes/mine`, `/negotiations`, negotiation detail/messages GET boundary |
| Safety | fixed official hosts, resource ID validation, sanitized errors, no HH writes |
| Tests | 8 focused HH/OAuth tests passed; full companion suite 337 passed once OpenAPI was regenerated |
| Static gates | Ruff and strict mypy passed; OpenAPI check passed |

## Not run / not claimable

Live OAuth authorization, current-user capability discovery, live resume/negotiation sync, extension OAuth UX, and post-merge AOPS-11 gates are not run because the official HH OAuth app credentials and registered redirect URI are not available. No fake live PASS is recorded.

## Secure next action

Set `VACANCYPILOT_HH_CLIENT_ID` and `VACANCYPILOT_HH_REDIRECT_URI` locally to the exact values from the HH developer application, then run `uv run --project companion python -m app.hh.credentials set-client-secret` in a private terminal; the prompt is hidden and the secret is written directly to the OS keyring.
