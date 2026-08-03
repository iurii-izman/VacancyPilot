# Prompt AOPS-14 — Evidence-aware Interview Pack

Implement only epic `AOPS-14` in the open VacancyPilot repository root.

Follow `../ZED_SESSION_START.md`: work only on synchronized `main`; do not
create a branch or PR, and leave commit/push to the Codex review gate.

## Goal

Generate, review, persist and export an Interview Pack grounded in the
validated vacancy analysis and evidence map, with a useful deterministic
offline version.

## Read first

1. `AGENTS.md`
2. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` sections 11.6, 14, 15
   `interview_packs` and 16.8
3. Current application/evidence/engine/letter services
4. Existing export and Markdown sanitization patterns

## Required output

Produce a typed pack containing:

```text
00_role_summary.md
01_evidence_map.md
02_likely_questions.md
03_risky_claims.md
04_case_answers.md
05_90_second_intro.md
06_questions_to_employer.md
07_first_task_hypothesis.md
08_company_notes.md
```

The stored domain representation may be structured JSON; Markdown export must
be deterministic and safe.

## Evidence rules

- central E2/P1 requirements receive likely questions, safe wording, forbidden
  wording, bridge and related commercial case;
- E4/E3 proof includes exact allowed claim/case IDs;
- portfolio proof keeps its non-commercial boundary;
- unknown evidence stays unknown;
- no evidence upgrade because a provider wrote persuasive text;
- risky claims derive from the validated evidence trace and letter, not from
  invented generic weaknesses.

## Modes

1. Offline deterministic pack from vacancy, evidence map, score, risks and
   templates.
2. Optional provider-enriched pack after payload preview and explicit action.
3. Manual company notes.

Provider enrichment uses the existing provider abstraction and must pass a
schema/evidence validator. Company notes use vacancy/employer public data and
manual input only; no automatic web research.

## API/UI

Implement:

```text
POST /api/v1/applications/{id}/interview-pack
GET  /api/v1/applications/{id}/interview-pack
POST /api/v1/applications/{id}/interview-pack/export
```

Complete the Interview tab:

- no pack/ready/stale/error states;
- generation mode selection;
- evidence/risk visibility;
- editable manual company notes;
- export path chosen safely by user/companion policy;
- stale warning when engine run or vacancy snapshot changed;
- no automatic file overwrite.

## Tests

Cover:

- offline generation with no AI key;
- E2/P1 safe/forbidden wording;
- portfolio boundary;
- unknown evidence;
- provider schema/unknown ID rejection;
- stale detection;
- deterministic Markdown filenames/order/content;
- path traversal and overwrite refusal;
- Unicode/English pack;
- no secret/raw provider payload in export;
- application without valid analysis gets a precise error/template limitation.

## Non-goals

- no automatic web research;
- no calendar scheduling;
- no recording/transcription;
- no fabricated company facts;
- no automatic status change to interview.

## Acceptance criteria

- Interview Pack is useful without AI;
- every risky claim traces to evidence;
- export contains all nine files in stable order;
- provider cannot introduce unsupported fact/evidence;
- changed analysis marks old pack stale;
- manual company notes stay clearly user-authored.

## Validation

Apply the focused per-epic policy in `ZED_SESSION_START.md`. The broader
commands listed below are release-gate inventory, not mandatory for this epic;
run only directly affected tests/static/contract checks and `git diff --check`,
then report the rest as `DEFERRED_TO_RELEASE_GATE`.

Release-gate command inventory (do not run for this epic):

```powershell
pnpm verify
pnpm test:release
pnpm verify:companion
git diff --check
```

## Handoff

Do not commit/push. Include a synthetic exported file list, not private content.

Expected reviewed commit message:

```text
feat: add evidence-aware Interview Pack
```
