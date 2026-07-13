# ITER-051: Security Alert Inventory And Fix Map

Epic: EPIC-28
Commit: `docs: inventory remaining security alerts`

## Goal

Turn the remaining GitHub security summary into an exact, actionable inventory before making more dependency changes.

## Inputs

- `docs/Техническое заданиеV.1.md` sections `20`, `22.7`, `23.4`
- current repository state after `ITER-050`
- GitHub issue `#10`
- current GitHub Security alert summary for `main`

## Scope

- list each remaining alert or deduplicated alert family;
- identify direct vs transitive origin and the dependency chain;
- classify each alert as:
  - safe local fix,
  - toolchain-coordinated fix,
  - upstream-blocked / deferred;
- produce the next fix map for `ITER-052` and `ITER-053`.

## Non-Goals

- no dependency changes yet unless strictly required to inspect the graph;
- no product feature work;
- no permission changes;
- no speculative package upgrades.

## Acceptance Criteria

- a committed triage report exists for the remaining alerts;
- the team has a concrete map of which alerts belong in `ITER-052` vs `ITER-053`;
- any blocked alerts are explained with a real dependency-chain reason.

## Validation

```text
pnpm audit
pnpm typecheck
pnpm lint
pnpm test
```
