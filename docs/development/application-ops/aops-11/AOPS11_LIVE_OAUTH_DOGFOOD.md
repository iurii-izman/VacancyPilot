# AOPS-11 live OAuth dogfood

Date: 2026-08-30

## Result

`BLOCKED` — no live acceptance claim.

The OAuth application configuration was available locally and explicit HH authorization was completed in the normal system browser. HH redirected to the VacancyPilot-owned loopback callback, the companion exchanged the code, and the token bundle was restored from the OS keyring in a new process. The still-valid access token was reused without an early refresh.

Live read-only results:

- `GET /me`: `AVAILABLE`
- `GET /resumes/mine`: `403 FORBIDDEN`
- `GET /negotiations`: `403 FORBIDDEN`

The two 403 responses are recorded as unavailable HH capabilities. No HH write request was made.

No token, authorization code, response body, or personal account data is stored in this report. No HH write request was made.

## Required external follow-up

Verify that the HH Developer Application and authorized account are granted applicant resume and negotiation read capabilities. Then rerun the three read-only calls and require all three to succeed before considering AOPS-11 acceptance.
