# ITER-050: React Stack Alignment

Epic: EPIC-27
Commit: `chore: align react stack`

## Goal

Resolve the remaining React-related Dependabot drift with a coherent stack decision rather than a partial major bump.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `17`, `22.3`, `23.4`
- current repository state after `ITER-049`
- Dependabot PR `#13` triage outcome

## Scope

- treat `react`, `react-dom`, and their type packages as one decision surface;
- either align them on a verified compatible newer stack or keep them on the current line with explicit rationale captured in code/docs;
- run focused validation against popup, side panel, and dashboard build/runtime surfaces through existing automated checks.

## Non-Goals

- no product-feature expansion;
- no opportunistic UI rewrites;
- no unrelated dependency churn;
- no permission or manifest changes.

## Acceptance Criteria

- the repository no longer has an ambiguous partial React major bump pending;
- any chosen stack alignment is coherent across runtime and type packages;
- validation remains green after the final decision.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
