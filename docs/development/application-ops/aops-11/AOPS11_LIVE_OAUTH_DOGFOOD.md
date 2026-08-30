# AOPS-11 live OAuth dogfood

Date: 2026-08-30

## Result

`PASS` for OAuth/account with `PARTIAL_LIVE_CAPABILITIES`; AOPS-11 is eligible for acceptance under the explicit capability contract.

The OAuth application configuration was available locally and explicit HH authorization was completed in the normal system browser. HH redirected to the VacancyPilot-owned loopback callback, the companion exchanged the code, and the token bundle was restored from the OS keyring in a new process. The still-valid access token was reused without an early refresh.

Live read-only results:

- `GET /me`: HTTP 200; `auth_type=applicant`, `is_applicant=true`, `is_employer=false`.
- `/me` included both `resumes_url` and `negotiations_url`; both resolved to the official `api.hh.ru` paths `/resumes/mine` and `/negotiations`.
- `GET /resumes/mine`: HTTP 403; sanitized `errors[0].type=forbidden`, `value=null`, `description=null`.
- `GET /negotiations`: HTTP 403; sanitized `errors[0].type=forbidden`, `value=null`, `description=null`.

The two 403 responses are recorded as `resumes=DENIED_BY_HH` and `negotiations=DENIED_BY_HH`. This is an expected external restriction for this valid applicant OAuth state, not a successful resume/negotiation sync. No HH write request was made and no blind retry was attempted.

No token, authorization code, raw response body, or personal account data is stored in this report. No HH write request was made.

## Capability matrix

| Capability | State | Evidence |
|---|---|---|
| account | `AVAILABLE` | `/me` 200, applicant OAuth |
| resumes | `DENIED_BY_HH` | canonical path 403 `forbidden` |
| negotiations | `DENIED_BY_HH` | canonical path 403 `forbidden` |
| writes | `FORBIDDEN_BY_PRODUCT` | read-only boundary |
