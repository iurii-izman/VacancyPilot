# EPIC-31 Start Report

Date: `2026-06-21`

Purpose: lock the next active implementation sequence after the private release readiness pack and make the AI trust work executable in the same one-iteration-at-a-time workflow used throughout the project.

## Decision

The next active epic is:

- `EPIC-31 — AI Assist Quality And Trust`

This is the highest-value next step because:

1. the private install/docs baseline is now in place through `ITER-063` and `ITER-064`;
2. the main remaining product trust gap is the AI layer, not repository hygiene or packaging;
3. public-release blockers still include the absence of a real AI provider, weak cost visibility, and limited guardrails around generated letters.

## Execution Order

Run exactly one row at a time:

1. `ITER-060` — harden AI settings lifecycle and land the first real BYOK provider
2. `ITER-061` — add token/cost preview and local request-budget controls
3. `ITER-062` — add letter quality guardrails and provenance markers

Do not start `ITER-061` before `ITER-060` is reviewed, committed, and pushed.
Do not start `ITER-062` before `ITER-061` is reviewed, committed, and pushed.

## Scope Boundary

In scope for this pack:

- AI provider runtime quality
- local API key lifecycle and warnings
- token/cost transparency
- local budget controls
- output quality/trust markers for letters

Out of scope for this pack:

- backend proxy or sync
- encrypted remote vaults
- `n8n` reopening
- multi-site support
- Chrome Web Store/public-release work

## Why This Order

`ITER-060` must go first because the rest of the pack depends on a real provider path existing at all.
`ITER-061` then adds user control over AI cost and volume.
`ITER-062` finishes the trust layer at the output surface where users actually consume AI text.

## Ready Prompt Files

- `docs/development/prompts/ITER-060.md`
- `docs/development/prompts/ITER-061.md`
- `docs/development/prompts/ITER-062.md`

## Next Prompt To Run In Zed

`docs/development/prompts/ITER-060.md`
