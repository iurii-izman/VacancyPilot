# R5 Daily-Use Readiness

Status: `R5 bounded synthetic QA PASS; Fix 3 execution/privacy/concurrency PASS`;
no new live-provider V4 acceptance after the current vacancy hydration/card
hotfix line
FEATURE DEVELOPMENT: `FROZEN`
MODE: `REAL DAILY USE / DOGFOOD`

## Start checklist

- Companion healthy and paired.
- Effective Ops Mode is confirmed after migration; an enabled toggle alone is
  not authority.
- Engine V4 valid.
- OpenAI configured only if analysis or letter generation is needed.
- HH public API available for the explicitly enabled read-only capability.
- HH capability state is shown honestly: account `AVAILABLE`, resumes
  `DENIED_BY_HH`, negotiations `DENIED_BY_HH`.
- Preview the Application Factory session before execution.
- Confirm that the private local engine metadata is valid; the current local
  package is `4.0.1`. Public `4.0.0` fixtures are synthetic compatibility data.

## Daily workflow

Search Profiles / HH discovery → Inbox → open full vacancy → Preview Full V4
→ explicit Confirm and run → review V4 decision/evidence/letter → manually
apply externally → Confirm Applied → track response/outcome. In Ops, Inbox is
the Companion vacancy projection (including vacancies with no Application) and
Pipeline is the Companion Application workflow.

Application Factory Preview makes no provider call and has no database,
session/item, budget, receipt or keyring side effect. Full V4 Preview is also
provider-free for the analysis itself, but an incomplete selected vacancy may
first be hydrated through the official read-only HH API and persisted. Queue
preparation produces a resumable manual-review state and never creates an
application or `APPLIED`.

Every executable AI operation is compiled into a canonical plan from current
authoritative input and the current explicit AI/privacy policy. Preview shows
the exact redacted dynamic payload, provider/model, plan hash, privacy summary,
cache predicate, expected attempt count, budget limit and authenticated
receipt. Execute requires explicit confirmation and an unexpired receipt for
the same plan; it then performs a semantic single-flight claim and atomic
provider-attempt reservation before dispatch. Provider retries are disabled;
one bounded repair may consume one additional attempt. A dispatch timeout is
outcome-unknown and is not automatically retried. Raw provider output is not
persisted, logged or exported.

Copying or opening HH is not applying. Generated letter text is not evidence;
`SKIP` produces no letter. Follow-ups are local and human-controlled, with
explicit sent confirmation. Interview Pack and backup health are deferred or
inactive.

In Standalone, the local Confirm Applied action is available only after the
user has submitted through native HH and confirms that fact. In effective Ops,
Full V4, hydration, Search Profiles, analytics, Application Factory and Ops
follow-ups are enabled only when the Companion is connected and paired; stale
or unavailable transport leaves those controls disabled with an explanation.
Guided Apply's preparation checklist never marks Applied, and its final local
mutation remains unavailable in Ops. Fix 2 changes read authority only; it does
not add an Ops write path.

## Daily-use UI cues

Today, Discovery, Inbox, Pipeline, Candidate and Settings remain the only
primary routes. Empty states now provide the next useful destination; Inbox
keeps the common search/status/decision filters visible and puts secondary
filters behind `More filters`; Application Card makes provider-free Preview and
explicit execution confirmation visually distinct. These are presentation
refinements only and do not change the underlying workflow or safety boundary.

The post-change production render was inspected locally. Final visual acceptance
of the unpacked browser extension still requires a human reload/review; no live
Full V4/provider acceptance was performed as part of this polish pass.

Ops read semantics are explicit: no Application is not `new`, no analysis is
not score `0`, invalid/unavailable sources are not converted into valid/empty
state, and multiple Applications or follow-ups are retained rather than
arbitrarily selected. Refreshing Ops does not update Standalone Dexie domain
tables. Fix 3 execution, privacy, and concurrency findings are closed by the
shared plan/receipt/coordination boundary and the standalone Dexie ledger.

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
