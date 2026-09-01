# R5 Daily-Use Readiness

Status: `R5 PASS`
FEATURE DEVELOPMENT: `FROZEN`
MODE: `REAL DAILY USE / DOGFOOD`

## Start checklist

- Companion healthy and paired.
- Engine V4 valid.
- OpenAI configured only if analysis or letter generation is needed.
- HH public API available for the explicitly enabled read-only capability.
- HH capability state is shown honestly: account `AVAILABLE`, resumes
  `DENIED_BY_HH`, negotiations `DENIED_BY_HH`.
- Preview the Application Factory session before execution.

## Daily workflow

Search Profiles / HH discovery → Inbox → select → preview → explicit process
→ review V4 decision → prepare/review letter → manually apply externally →
Confirm Applied → track response/outcome.

## Immediate hotfix criteria

Fix immediately only for data loss, duplicate application, incorrect
`APPLIED`, duplicate paid provider calls, broken cache, wrong vacancy/letter
linkage, wrong outcome/provenance, privacy/security issue, or a queue that
cannot resume. Log everything else to the backlog and continue dogfood.

## Observation period

Target, not quota: 2–4 weeks; 20–50+ reviewed real vacancies; 15–30+ real
applications if available.

## Deferred

AOPS-14 is deferred and not started; full canonical AOPS-15 is incomplete.
V4.1 is deferred until enough real outcome data exists. No “AOPS-14 next”
execution commitment is made.

Next work is real vacancy processing and evidence collection. New feature work
requires repeated real friction, quality failures, conversion evidence, a real
interview signal, or a P0/P1 operational defect.
