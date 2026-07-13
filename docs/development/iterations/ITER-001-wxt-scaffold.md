# ITER-001: WXT Scaffold

Epic: EPIC-00
Commit: `chore: scaffold extension foundation`

## Goal

Create the initial WXT + React + TypeScript extension skeleton.

## Scope

- Initialize package manager files.
- Add WXT, React, TypeScript baseline.
- Add minimal entrypoints: background, content vacancy, popup, side panel, options/dashboard placeholder.
- Configure MV3 manifest with minimal permissions.
- Add placeholder UI that proves the extension builds.

## Non-Goals

- No parser implementation.
- No Dexie.
- No AI.
- No n8n.
- No real HH data extraction.

## Acceptance Criteria

- `pnpm install` succeeds.
- `pnpm build` succeeds.
- Generated manifest does not contain forbidden permissions.
- Placeholder extension entrypoints compile.

## Validation

```text
pnpm install
pnpm build
```
