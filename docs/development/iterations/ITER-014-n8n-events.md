# ITER-014: n8n Events

Epic: EPIC-09
Commit: `feat: add opt in n8n events`

## Goal

Add opt-in webhook events with safe payloads, HMAC, retry, and event logging.

## Scope

- Webhook settings model.
- HTTPS URL validation.
- Test webhook.
- HMAC signing.
- Retry queue with backoff.
- Rate limit.
- Event log integration.

## Non-Goals

- No HR chat events.
- No full cover letter/resume payload by default.
- No developer telemetry.

## Acceptance Criteria

- n8n is off by default.
- Payload preview exists.
- HMAC header is supported.
- Failed sends are visible and retryable.
- Disable stops future sends.

## Validation

```text
pnpm typecheck
pnpm test
```
