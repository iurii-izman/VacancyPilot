# AOPS-11 acceptance report

## Verdict

`AOPS10_PASS_AOPS11_PASS_PARTIAL_LIVE_CAPABILITIES`

## Acceptance state

The AOPS-11 OAuth/account acceptance passed. Optional applicant capabilities are explicitly degraded by HH and therefore do not block the epic:

- An explicit browser authorization reached the VacancyPilot-owned loopback callback.
- The companion exchanged the code and restored the still-valid access token from OS keyring without early refresh.
- Real `GET /me` succeeded with `auth_type=applicant`, `is_applicant=true`, and `is_employer=false`.
- `/me` canonical URLs were present and validated to `https://api.hh.ru/resumes/mine` and `https://api.hh.ru/negotiations`.
- Real `GET /resumes/mine` and `GET /negotiations` returned sanitized HTTP 403 `forbidden`; both are represented as `DENIED_BY_HH`.

No secret was requested or printed in chat. AOPS-10 remains accepted and merged locally; AOPS-11 is accepted on its feature branch pending the local no-ff merge.

## Implemented and tested

| Area | Result |
|---|---|
| OAuth PKCE | S256 challenge, random state/verifier, five-minute single-use state |
| Token lifecycle | Official token endpoint, atomically replaced keyring bundle (access/refresh/expiry), valid-token reuse, post-expiry serialized refresh rotation |
| Local API | normal-browser loopback auth start/callback/disconnect, explicit capability discovery, safe degraded applicant sync |
| Applicant client | `/me` plus validated canonical `/resumes/mine` and `/negotiations` read probes |
| Safety | fixed official hosts, resource ID validation, sanitized errors, no HH writes |
| Tests | OAuth refresh and capability-focused tests passed; full companion suite passed |
| Static gates | Ruff and strict mypy passed; OpenAPI check passed; migrations passed |

## Capability qualification

This report does not claim successful resume or negotiation synchronization. It claims that a valid OAuth account was discovered, HH’s optional capability denials were verified and honestly surfaced, no blind retry or write fallback occurs, and the safe state survives reconciliation. A 401 authentication failure remains distinct from a 403 capability denial.
