# EPIC-06: AI Privacy Layer And Analysis

## Goal

Add AI analysis safely: explicit opt-in, payload preview, redaction, Strict Privacy, provider abstraction, validation, and cache.

## Scope

- Redaction helpers.
- Payload preview.
- Standard Privacy and Strict Privacy.
- Token/cost preview where possible.
- AI provider interface.
- Mock provider first.
- OpenAI/OpenRouter/DeepSeek provider later.
- AI output validation.
- AI request cache.

## Non-Goals

- No AI call without user action.
- No sending full resume by default.
- No backend proxy in MVP.
- No raw response storage outside debug mode.

## Acceptance Criteria

- AI can be disabled completely.
- Payload preview shows included and excluded fields.
- Strict Privacy excludes `descriptionClean`.
- Cache prevents unnecessary repeated requests.
- Invalid AI JSON is handled safely.

## Safety Notes

Never let content scripts see API keys. Do not claim `chrome.storage.local` is a secure vault.
