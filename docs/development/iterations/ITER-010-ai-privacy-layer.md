# ITER-010: AI Privacy Layer

Epic: EPIC-06
Commit: `feat: add ai privacy layer`

## Goal

Implement redaction, payload builder, payload preview data, and privacy modes before real AI calls.

## Scope

- Redaction helpers.
- VacancyAnalysisInput builder.
- CoverLetterInput builder.
- Standard Privacy.
- Strict Privacy.
- Payload preview object.
- Tests that sensitive fields are excluded.

## Non-Goals

- No real provider calls.
- No API key storage UI.
- No streaming yet.

## Acceptance Criteria

- Strict Privacy excludes `descriptionClean`.
- Payload preview lists included/excluded fields.
- Redaction removes emails/phones/tokens patterns.
- Tests cover privacy boundaries.

## Validation

```text
pnpm typecheck
pnpm test
```
