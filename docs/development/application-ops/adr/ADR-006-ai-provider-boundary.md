# ADR-006: AI Provider Boundary

Status: ACCEPTED
Date: 2026-07-29
Epic: AOPS-00

## Context

The Application Ops MVP supports AI-powered vacancy analysis and cover
letter generation. The existing extension already has an AI provider
abstraction with mock provider, cache, payload preview, and privacy modes.

The MVP specification defines two AI execution modes:
1. **OpenAI BYOK** — user provides their own API key, companion calls
   OpenAI API directly
2. **Manual ChatGPT Project Bridge** — user copies prompts from companion
   UI, pastes into ChatGPT, and pastes results back

Additionally, DeepSeek V4 Pro is used as the Zed coding agent in this
development workflow. There is a natural question about whether DeepSeek
should also be a product AI provider.

## Decision

**DeepSeek in Zed is a coding tool, not automatically a product provider.**

The reviewed Application Ops plan promotes the manual bridge from the source
specification's conditional P1 list into P0 because it is the required
no-API-budget fallback and is implemented in the same validated letter
lifecycle. This is an explicit scope decision, not an accidental rewrite.

The P0 AI execution set is:
1. OpenAI BYOK (programmatic, via companion)
2. Manual ChatGPT Project Bridge (copy/paste workflow)

DeepSeek provider integration is **not** part of the listed MVP P1 scope or
automatically authorized by AOPS-18. It requires a separate owner decision,
ADR, security review, schema-compatibility proof, and bounded epic because:
- DeepSeek API availability, pricing, and terms may differ from OpenAI
- Provider adapter must match the existing abstraction (streaming,
  token counting, error handling)
- Adding providers expands the test matrix and support surface

## Consequences

### Positive
- Clear separation between development tooling and product runtime
- P0 scope remains focused on tested OpenAI integration
- Manual bridge provides a provider-agnostic fallback for any LLM
- A later provider decision can be made with real usage data from the pilot

### Negative
- If the user prefers DeepSeek for cost/reliability reasons, they use the
  manual bridge until a separate provider decision is approved
- Provider abstraction must be designed to accommodate future additions
  without refactoring

### Neutral
- The provider abstraction (AOPS-08) will support pluggable providers;
  adding DeepSeek later is incremental work, not architectural change

## Rejected Options

### Option A: Add DeepSeek as a P0/P1 provider automatically
Expands scope without user demand data. Adds testing burden before core
flows are stable. Rejected as premature.

### Option B: Only manual bridge, no programmatic provider
Loses automation benefit of BYOK. Manual bridge is a fallback, not the
primary workflow. Rejected.

### Option C: Support "any OpenAI-compatible endpoint"
Generic endpoint support sounds simple but creates support ambiguity
(error messages, token counting, streaming behavior differ between
providers). Rejected as undertested.
