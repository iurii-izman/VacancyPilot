# Prompt AOPS-08 — Full V4 Analysis and Literal Validation

Implement only epic `AOPS-08` in the open VacancyPilot repository root.

Follow `../ZED_SESSION_START.md`: work only on synchronized `main`; do not
create a branch or PR, and leave commit/push to the Codex review gate.

## Goal

Turn a saved vacancy and a valid engine package into a minimal evidence-aware
provider request, validated structured V4 analysis, evidence trace and
persisted engine run with one bounded repair retry.

## Read first

1. `AGENTS.md`
2. `docs/mvp/VACANCYPILOT_APPLICATION_OPS_MVP.md` sections 4.4, 9.3–10.3,
   11.1–11.3, 15 `engine_runs/evidence_usage`, 16.4 and 20.4
3. ADR-005/006 and provider/engine API contracts
4. Current engine loader/index, DB repositories and existing OpenAI BYOK code
5. Canonical V4 validator/regression expectations without editing V4 sources

## Required architecture

Implement a companion provider protocol with explicit operations and metadata,
not a provider-specific service leaking through domain code:

```text
analyze_vacancy
repair_output
provider/model/capabilities
```

P0 automated provider is OpenAI BYOK through companion keyring. Preserve any
existing standalone extension AI behavior, but do not store a second copy of
the key. DeepSeek runtime support is not part of this epic.

## Prompt compiler

Compile a deterministic minimal payload:

- normalized vacancy fields and full visible text;
- three central requirements candidate;
- selected claim IDs and allowed wording;
- selected commercial cases;
- at most one relevant portfolio case with explicit boundary;
- relevant skill calibration;
- targeting/hard-gate/cap subset;
- voice/regression subset;
- Project Instructions;
- output JSON schema;
- explicit forbidden overclaims and evidence whitelist.

Do not send the entire knowledge pack by default. Record prompt version,
selection reasons, input hash and payload preview. Never log private prompt
content when privacy mode disallows it.

## Structured result

Use strict Pydantic models for:

- vacancy identity;
- eligibility and hard-fail reasons;
- exactly three central requirements when enough information exists;
- evidence map with requirement, level, claim/case/portfolio IDs and allowed
  wording;
- raw score, caps, final score, confidence and decision;
- strategy;
- five-section user response and/or typed cover-letter field according to the
  frozen contract;
- exactly two recruiter risks;
- interview preparation;
- QA result and errors.

Reject unknown evidence IDs, invalid levels, impossible cap math, unsupported
decision bands and provider prose outside the schema.

## Deterministic validation

Local code, not the LLM, must verify:

- H1 first non-empty line;
- five required sections in order;
- APPLY-family letter 150–220 words;
- hard-fail fallback 90–130 words;
- two vacancy anchors;
- one micro-proof;
- exactly two recruiter risks;
- signature and whitespace only after signature;
- no placeholders/meta-text/forbidden phrases;
- no hidden self-disqualification;
- no unsupported direct claim;
- no homogeneous skill list over five;
- evidence whitelist and portfolio boundary;
- score/hard-gate/cap/decision parity;
- English-only mode when required.

Allow one repair retry containing only validation errors, original structured
result, allowed evidence and required schema. If repair fails:

- persist run as invalid;
- keep raw output under privacy rules;
- expose errors;
- never mark result/letter ready.

## API/persistence

Implement/finish:

```text
POST /api/v1/vacancies/{id}/analyze
GET  /api/v1/engine/runs/{run_id}
```

Persist engine run and evidence usage transactionally. Add input-hash cache
that is scoped by engine version, prompt version, provider and model. Reuse
only validated compatible runs. Explicit user action is required for provider
execution.

Add payload preview with provider/model/token estimate. Cost is an estimate,
not a promise.

## Tests

Use fake providers. Cover:

- minimal evidence selection and no full-pack leak;
- deterministic input hash/cache hit/miss;
- valid structured output;
- malformed JSON/schema;
- unknown evidence ID/level;
- cap and hard-gate mismatch;
- unsupported claim;
- all literal letter validators;
- English mode;
- first invalid then repaired valid;
- two invalid attempts remain invalid;
- provider timeout/rate/auth error mapping;
- key/prompt redaction;
- engine run/evidence transaction rollback.

Port the current 15 regression scenarios and 6 smoke scenarios as
non-private, sanitized fixtures or an approved local harness. Do not weaken
expected ranges after observing output.

## Non-goals

- no manual ChatGPT import yet;
- no sent letter state/diff;
- no HH API;
- no batch auto-analysis;
- no automatic engine rule change;
- no fabricated provider PASS.

## Acceptance criteria

- 15/15 regressions and 6/6 smoke validations pass locally;
- unsupported direct claims: zero in fixtures;
- invalid package/result cannot become ready;
- one and only one repair retry;
- provider call only on explicit action;
- full run has traceable evidence and reproducible metadata.

## Validation

Apply the focused per-epic policy in `ZED_SESSION_START.md`. The broader
commands listed below are release-gate inventory, not mandatory for this epic;
run only directly affected tests/static/contract checks and `git diff --check`,
then report the rest as `DEFERRED_TO_RELEASE_GATE`.

Release-gate command inventory (do not run for this epic):

```powershell
pnpm verify:companion
pnpm verify
pnpm test:release
git diff --check
```

Run and report focused regression/smoke commands with exact counts.

## Handoff

Do not commit/push. Report any manual live-provider gate separately from mocked
PASS.

Expected reviewed commit message:

```text
feat: add validated V4 vacancy analysis
```
