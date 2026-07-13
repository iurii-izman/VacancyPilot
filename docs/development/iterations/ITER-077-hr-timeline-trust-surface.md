# ITER-077: HR Timeline Trust Surface

Epic: EPIC-37
Commit: `fix: harden hr timeline trust surface`

## Goal

Reduce unnecessary privacy/export risk in the HR timeline flow by tightening what is stored and surfaced from HH negotiation parsing.

## Scope

- review the raw HR timeline DTO and current adapter extraction path;
- remove or constrain stored HTML if plain text is sufficient for the current product surfaces;
- keep classification and read-only HR workflow behavior intact;
- update tests and any affected export/privacy documentation;
- preserve local-first behavior and current storage semantics where safe.

## Non-Goals

- no new HR product features;
- no dashboard redesign;
- no hidden HH fetch/XHR;
- no generalized HTML rendering pipeline;
- no permission changes.

## Acceptance Criteria

- HR timeline no longer stores unnecessary raw markup for the MVP flow, or the remaining HTML surface is tightly justified and documented;
- existing HR timeline classification/storage tests stay green and are updated where needed;
- export/privacy docs accurately reflect the resulting data shape.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
```
