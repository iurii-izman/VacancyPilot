# ITER-072: Popup Shell And Badge Finalization

Epic: EPIC-36
Commit: `fix: stabilize popup shell and badge placement`

## Goal

Stabilize popup shell dimensions and finish the remaining ambient badge placement/behavior polish without changing product logic.

## Scope

- enforce stable popup width/height behavior across loading, no-vacancy, and saved-vacancy states;
- add a stable popup shell or loading placeholder if needed so Chrome does not open a visually collapsed surface;
- ensure popup primary actions remain visible in normal runtime states;
- refine badge placement and presentation for real HH pages while staying inside the current extension-owned DOM surface;
- keep badge accessibility and interaction feedback coherent with the latest runtime model.

## Non-Goals

- no About/Onboarding content refactor here;
- no dashboard information architecture changes;
- no permissions changes;
- no HH writes, auto-clicks, or hidden fetch behavior.

## Acceptance Criteria

- popup does not open as a tiny or collapsed strip;
- popup has stable minimum dimensions across its key runtime states;
- badge placement is visibly safer and more deliberate on real HH pages;
- popup and badge remain inside current safety constraints;
- focused tests cover the real shell contract or presentation helpers touched here.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
