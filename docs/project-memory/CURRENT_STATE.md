# Current State

Last verified: 2026-09-01
Verified commit: `b57b73a3701e74f94c2c91bb66e8e34cfc196d27`

## Product

VacancyPilot is a local-first, user-controlled, read-first HH.ru copilot for vacancy analysis, application preparation, and job-search history. It assists the user; it does not submit applications or change HH state on the user's behalf. See the [master specification](../Техническое%20заданиеV.1.md) and [`AGENTS.md`](../../AGENTS.md).

## Milestone state

- **ACCEPTED — R5:** Local, human-controlled Application Factory and bounded descriptive conversion read model. Evidence: [`R5_POST_MERGE_ACCEPTANCE.md`](../development/application-ops/r5/R5_POST_MERGE_ACCEPTANCE.md), verdict `R5_PASS`; manual browser QA passed with synthetic local data.
- **ACTIVE — dogfood/evidence collection:** R5 status freezes feature development while real daily-use evidence is collected. See [`IMPLEMENTATION_STATUS.md`](../development/application-ops/IMPLEMENTATION_STATUS.md).
- **NEXT — EPIC-31 / ITER-060..062:** Explicitly listed in the product development plan, but not started here and subject to the current dogfood freeze. See [`00-product-development-plan.md`](../development/00-product-development-plan.md).
- **PARKED — AOPS-14:** Interview Pack remains deferred and not started.
- **INCOMPLETE — AOPS-15:** The full canonical analytics and production pilot is not complete; only the bounded R5 slice is accepted.

## Implemented orientation

- WXT / Manifest V3 / TypeScript / React extension with Dexie and `chrome.storage.local`.
- Read-only HH vacancy and search-card parsing from user-opened pages.
- Local tracking, statuses, scoring, cover-letter lifecycle, export/delete, and optional explicit AI flows.
- Local companion in Ops Mode with SQLite authority, loopback-only communication, official HH API reads, and OS-keyring secret handling.
- R5 application preparation queue with preview, explicit confirmation, resumable state, and no external submission.
- R5 descriptive conversion analytics with provenance-backed pending states and unknown-cost handling.

## Binding invariants

- No auto-submit, auto-apply, auto-click, HH form writes, synthetic HH form events, hidden HH requests, CAPTCHA bypass, cookie/session handling, or developer telemetry by default.
- User reviews and controls external actions; AI and external flows are opt-in with preview.
- V4 scoring policy is unchanged by R5.
- Real candidate V4 facts and secrets are not committed to the repository.

## Known conditions

- Private alpha / dogfooding; public release prerequisites remain in [`docs/ROADMAP.md`](../ROADMAP.md).
- AOPS-14, AOPS-16, and AOPS-17 are not started; AOPS-15 is incomplete beyond the accepted R5 slice.
- `n8n` remains deferred pending an explicit permission-model decision.
