# EPIC-09: n8n And Telegram Events

## Goal

Add opt-in local webhook events for user-owned automations without leaking sensitive data.

## Scope

- Webhook settings.
- HTTPS validation.
- Test webhook.
- HMAC signing.
- Redacted payloads.
- Retry queue with exponential backoff.
- Event log.
- Local rate limit.

## Non-Goals

- No HR chat events in Phase 1.
- No full cover letter payload by default.
- No resume text payload.
- No developer telemetry.

## Acceptance Criteria

- n8n is off by default.
- User sees example payload before enabling.
- Failed sends are visible and retryable.
- HMAC header is supported.
- Webhook can be disabled cleanly.

## Safety Notes

Webhook URL is sensitive. Treat it as local-only configuration and never expose it in logs or export unless explicitly requested.
