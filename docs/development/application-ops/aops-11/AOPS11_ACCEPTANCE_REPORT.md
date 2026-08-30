# AOPS-11 acceptance report

## Verdict

`AOPS10_PASS_AOPS11_BLOCKED`

## Acceptance state

The AOPS-11 code boundary is implemented and locally validated, but full acceptance cannot be claimed because two required applicant capabilities were denied by HH:

- An explicit browser authorization reached the VacancyPilot-owned loopback callback.
- The companion exchanged the code and restored the still-valid access token from OS keyring without early refresh.
- Real `GET /me` succeeded.
- Real `GET /resumes/mine` and `GET /negotiations` returned 403 Forbidden.

No secret was requested or printed in chat. AOPS-11 was not merged; AOPS-10 remains accepted and merged locally.

## Implemented and tested

| Area | Result |
|---|---|
| OAuth PKCE | S256 challenge, random state/verifier, five-minute single-use state |
| Token lifecycle | Official token endpoint, atomically replaced keyring bundle (access/refresh/expiry), valid-token reuse, post-expiry serialized refresh rotation |
| Local API | auth start/exchange/callback/disconnect, capabilities, read-only resumes/negotiations routes |
| Applicant client | `/me`, `/resumes/mine`, `/negotiations`, negotiation detail/messages GET boundary |
| Safety | fixed official hosts, resource ID validation, sanitized errors, no HH writes |
| Tests | 8 focused HH/OAuth tests passed; full companion suite 343 passed |
| Static gates | Ruff and strict mypy passed; OpenAPI check passed; migrations passed |

## Not run / not claimable

Resume/negotiation capability sync, extension OAuth UX, and post-merge AOPS-11 gates are not accepted because HH denied the two required read capabilities. Root gates nevertheless passed: 2809 root tests, build, and 1365 release-safety tests. No fake live PASS is recorded.

## Secure next action

Verify applicant resume and negotiation read capabilities for the HH Developer Application/account, then rerun real `/me`, `/resumes/mine`, and `/negotiations` checks before retrying acceptance.
