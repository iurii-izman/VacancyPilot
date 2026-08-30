# AOPS-08 Recovery R2 — Live Provider Acceptance

Date: 2026-08-30

## Verdict

**PASS**

After R2 remediation, the configured OpenAI BYOK provider was invoked through
the canonical `OpenAIProvider` boundary using a synthetic vacancy and the
active real V4 package. Structured parsing, deterministic validation,
evidence persistence, and read-back all passed.

## Sanitized live evidence

| Field | Value |
| --- | --- |
| provider | `openai` |
| model | `gpt-4o` |
| key configured | yes |
| fixture | `SYNTH-R2-LIVE-011` |
| engine version | `4.0.0` |
| engine package hash | `3cfc6d4c2199aa3b8d175014de08cb74bffb8dcacb1517447c915166af7e2c9d` |
| prompt version | `v4.0.0-ao8-4` |
| preview | PASS; 2,917 estimated input tokens |
| selected evidence | 3 claims, 1 case (IDs and bodies intentionally omitted) |
| provider usage | 3,643 input tokens, 744 output tokens, estimated USD 0.016547 |
| structured parse | PASS |
| score / risks | structured score present; exactly 2 risks |
| persistence / read-back | persisted; read-back status `success` |
| evidence usage persisted | 2 |
| deterministic validation | PASS; 0 errors |
| run ID | `710ee415-e1e-4a69-b52a-7e65b6fe54cf` |

No API key, candidate fact body, private package content, compiled prompt,
provider raw response, or letter body is recorded in this artefact.

## R2 remediation performed

The first live attempt exposed two implementation defects that could create a
false acceptance result. Both were fixed and covered by focused regression
tests:

1. An empty `cover_letter` skipped all literal validators. Validation now runs
   unconditionally, so an empty letter cannot produce a successful run.
2. The signature validator treated a greeting such as `Dear Hiring Manager`
   as a name signature. It now recognises a bare name only on the final
   non-empty line and finds sign-off phrases from the end of the letter.

The compiler now sends bounded allowed wording and case proof for selected
evidence (rather than opaque IDs), repairs schema-invalid JSON objects once,
and accepts a case micro-proof only when its cited `case_id` resolves through
the evidence map. Prompt version `v4.0.0-ao8-4` prevents stale cache reuse.

Focused verification after the changes passed:

- `pytest tests/test_analysis.py -q`: 33 passed;
- Ruff check and format check: PASS;
- `mypy app/analysis`: PASS.

## Completion

The live vertical slice now passes without bypassing validators. AOPS-08 can
proceed to its local merge and post-merge acceptance; AOPS-09 may start only
after those merge gates pass.
