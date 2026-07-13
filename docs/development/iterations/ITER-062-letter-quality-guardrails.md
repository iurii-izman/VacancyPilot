# ITER-062: Letter Quality Guardrails

Epic: EPIC-31
Commit: `feat: add letter quality guardrails`

## Goal

Make generated cover letters easier to trust by surfacing clear quality checks, draft provenance, and human-review cues.

## Scope

- detect basic letter issues such as empty/too-short/too-generic or constraint-violating output;
- add draft provenance markers such as generated/edited/final where needed;
- improve review workflow around warnings before copy/save final;
- keep the guardrails compatible with the provider/budget flows landed in `ITER-060` and `ITER-061`;
- add focused tests for the guardrails.

## Non-Goals

- no remote moderation service;
- no semantic scoring model rewrite;
- no public-release work;
- no broader editor redesign.

## Acceptance Criteria

- users can distinguish raw generated draft from reviewed/final text;
- obvious quality or constraint issues produce visible warnings;
- tests cover the new guardrail states.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
