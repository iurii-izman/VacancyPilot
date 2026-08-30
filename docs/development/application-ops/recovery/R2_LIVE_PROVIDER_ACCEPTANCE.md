# AOPS-08 Recovery R2 — Live Provider Acceptance

Date: 2026-08-30

## Verdict

**FAIL — VALIDATION**

The configured OpenAI BYOK provider was invoked through the canonical
`OpenAIProvider` boundary using a synthetic vacancy and the active real V4
package. The provider and persistence path work, but deterministic post-call
validation correctly rejects the returned result. AOPS-08 is therefore not
accepted, must not be merged, and AOPS-09 must not start.

## Sanitized live evidence

| Field | Value |
| --- | --- |
| provider | `openai` |
| model | `gpt-4o` |
| key configured | yes |
| fixture | `SYNTH-R2-LIVE-006` |
| engine version | `4.0.0` |
| engine package hash | `3cfc6d4c2199aa3b8d175014de08cb74bffb8dcacb1517447c915166af7e2c9d` |
| prompt version | `v4.0.0-ao8-2` |
| preview | PASS; 7 sent categories, 5 excluded categories, 2,262 estimated input tokens |
| selected evidence | 3 claims, 1 case (IDs and bodies intentionally omitted) |
| provider usage | 2,894 input tokens, 509 output tokens, estimated USD 0.012325 |
| structured parse | PASS |
| score / risks | structured score present; exactly 2 risks |
| persistence / read-back | persisted; read-back status `invalid` |
| evidence usage persisted | 0 |
| deterministic validation | FAIL; 4 errors |
| sanitized validation classes | `MICRO_PROOF`, `SECTION_ORDER`, `SIGNATURE_TRAILING`, `WORD_COUNT_HIGH` |

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

The prompt contract was also made explicit: `cover_letter` is mandatory,
requires ordered sections, a decision-dependent word range, title anchors,
and an evidence-backed quantitative proof. Its version was advanced to
`v4.0.0-ao8-2`, preventing a stale cache reuse.

Focused verification after the changes passed:

- `pytest tests/test_analysis.py -q`: 30 passed;
- Ruff check and format check: PASS;
- `mypy app/analysis`: PASS.

## Blocking condition

The canonical live provider still fails literal validation after its one
controlled repair attempt. The failure is not bypassed or reclassified as a
PASS. The remaining work is to make the prompt/compiler and evidence
selection reliably produce a validator-compliant, evidence-linked letter,
then repeat the live smoke and all required AOPS-08 gates. Until then the
correct final state is `AOPS08_LIVE_BLOCKED`.
