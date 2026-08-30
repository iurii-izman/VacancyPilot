# R1 AOPS-08 Runtime Contract

Authoritative behavior contract for the Full V4 Analysis runtime, derived from
the AOPS-08 epic spec, the V4 master prompt invariants, and the R1 recovery
review. Implementation must match this document; deviations are defects.

## 1. Engine availability

| State | Full V4 analysis | Stage A deterministic triage |
|---|---|---|
| Valid engine package installed | allowed | available |
| Missing engine package | **BLOCKED** (409, `ENGINE_PACKAGE_UNAVAILABLE`, message starts `ENGINE_PACKAGE_MISSING`) | available |
| Invalid engine package (manifest/checksum/frontmatter/hash) | **BLOCKED** (409, message starts `ENGINE_PACKAGE_INVALID` with safe error-code summaries) | available |

- No generic LLM fallback exists. A missing/invalid package can never degrade
  into an engine-less analysis.
- Stage A (vacancy intake + deterministic triage) never touches the engine
  package and must keep working without one (proven by test).
- Preview mode requires the same valid package (it compiles from the index).

## 2. Run identity

Every full analysis run is persisted with at least:

`vacancy_id`, `engine_version`, `engine_hash` (package aggregate hash),
`prompt_version`, `provider`, `model`, `input_hash`, `created_at`.

`input_hash` covers prompt version, engine version/hash, provider, model,
privacy mode, language, vacancy title/company, description hash, and the
selected evidence ID sets. Vacancy content is additionally covered by the
description hash (snapshot hash remains tracked at the vacancy-snapshot
level, not duplicated per run).

## 3. Prompt compiler

- Deterministic; never sends the entire knowledge pack.
- Selects: vacancy fields, selected claims (with evidence level and allowed
  wording), selected commercial cases, at most one portfolio case with its
  boundary, skill calibration subset, targeting rules, voice/regression
  subset, Project Instructions (truncated at 16k chars), output JSON schema,
  forbidden overclaims and evidence whitelist.
- Every selected evidence item keeps its source ID.
- Records prompt version, selection reasons, input hash, payload preview,
  token estimate.

## 4. Evidence states

Supported levels: `E4`, `E3`, `E2`, `P1`, `X0`, `N0`.

Invariants (enforced in deterministic code, index mapping and/or validators):

- `X0_UNKNOWN != N0_NO` (distinct literals; both in whitelist).
- Generated wording is never evidence: claims must reference an ID that
  resolves through the KnowledgeIndex.
- Portfolio != commercial production: project strength can never map to E4;
  portfolio entries carry a boundary (`shareability=internal_only_no_link` →
  "no public link").
- Certificate != commercial practice: `CERTIFICATE_*` origin caps below E4.
- Positive wording != score upgrade: `final <= raw`, `final <= lowest cap`
  (Pydantic model + literal validator).

Canonical strength mapping (from the authoritative V4 evidence inventory):
`A_DIRECT→E4`, `A_PROJECT_VALIDATED→E3`, `B_PROJECT_IMPLEMENTED→E3`,
`C_PROJECT_DOCUMENTED→E2`, `D_TOOL_LISTED→E2`, `X_SUPERSEDED→excluded`,
`TRANSFERABLE_INFERENCE→P1`.

## 5. Structured output

Canonical Pydantic output (`V4StructuredResult`, `extra='forbid'`):
`vacancy_identity`, `eligibility`, `central_requirements` (exactly 3 or 0),
`evidence_map`, `score {raw, caps, final, confidence, decision}`, `strategy`,
`cover_letter`, `recruiter_risks` (exactly 2), `interview_prep`, `qa`.
Markdown is a rendering layer only; the structured result is the source of
truth.

## 6. Independent validators

Code (not the model) verifies: schema (`extra='forbid'`), score range,
score/cap parity, evidence IDs resolve through the index, unsupported direct
claim guard, exactly 2 recruiter risks, letter length by decision band, H1,
five sections in order, vacancy anchors, micro-proof, placeholders/meta-text,
forbidden overclaims, hidden self-disqualification, signature with no content
after it, English mode, homogeneous skill-list density.

`qa.pass=true` from the model is never treated as proof; local validation
result is the only PASS source.

## 7. Repair retry

At most one controlled repair retry. The repair request contains the invalid
structured result, the exact validator errors, the same evidence subset and
schema, and an explicit instruction not to add new facts. If the repaired
output is still invalid: `engine_run.status = 'invalid'`,
`repair_status = 'invalid'`, `ready = false`.

## 8. Persistence

- `engine_runs` and `evidence_usage` are append-only/immutable history.
- Persisted per run: structured result JSON, raw output (privacy-scoped),
  validation errors, provider token/cost metadata, engine version + hash,
  prompt version, input hash.
- Previous analyses are never silently overwritten; the input-hash cache only
  reuses prior runs scoped by engine version/hash, prompt version, provider
  and model, and only when `status='success'`.
