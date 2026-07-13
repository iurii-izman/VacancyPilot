# ITER-011: AI Provider And Cache

Epic: EPIC-06
Commit: `feat: add ai analysis workflow`

## Goal

Add provider abstraction, mock provider, validation, and AI request cache.

## Scope

- `LLMProvider` interface.
- Mock provider for tests.
- AIAnalysis schema validation.
- Input hash.
- AIRequestCache.
- Manual regenerate path shape.

## Non-Goals

- No production provider key UI.
- No backend proxy.
- No automatic AI calls.

## Acceptance Criteria

- AI analysis requires explicit caller action.
- Cache hit avoids provider call.
- Invalid provider response is handled safely.
- Raw response is not persisted outside debug mode.

## Validation

```text
pnpm typecheck
pnpm test
```
