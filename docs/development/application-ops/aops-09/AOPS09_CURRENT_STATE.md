# AOPS-09 Current State

Date: 2026-08-30

## Canonical authority

- Standalone mode remains Dexie/IndexedDB-canonical.
- In Ops Mode the companion SQLite database is canonical; the extension is a
  cache/outbox client through the authenticated loopback `OpsClient`.
- Existing `CoverLetterStudio` is the only letter editor and must be extended,
  not replaced.

## Existing implementation

| Surface | Current state | AOPS-09 implication |
| --- | --- | --- |
| SQLite | `cover_letters` projection + append-only `letter_versions` already exist | extend provenance/lifecycle fields via migration; preserve old rows |
| Companion repository | supports generated versions and an immutable sent guard | add explicit lifecycle commands, history, import, validation, and diff |
| AOPS-08 | Full V4 analysis has validated output, engine run identity, evidence usage and provider metadata | generated letters can reference `engine_run_id`; imported output cannot promote score/evidence |
| Extension model | has draft/final provenance and local versions | add sent/manual-bridge provenance without changing standalone behavior |
| UI | `CoverLetterStudio` supports API draft, edit, save, final, copy | add source picker, import, version history, explicit sent snapshot and diff |
| Ops client | authenticated typed loopback adapter | extend only through canonical OpenAPI-derived surface |

## Gaps to implement

1. Immutable generated, final, and sent snapshots with complete provenance.
2. Deterministic generated-to-sent diff metrics and rendering data.
3. Manual ChatGPT bridge request generation and local response import parser.
4. Local validation for generated/imported/final text; imported score/evidence
   never overwrite authoritative AOPS-08 results.
5. Minimal authenticated API and extension integration, migrations, tests, and
   a privacy/security review.
