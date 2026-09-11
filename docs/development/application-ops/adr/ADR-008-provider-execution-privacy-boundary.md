# ADR-008: Reviewed Provider Execution and Privacy Boundary

Status: ACCEPTED
Date: 2026-09-10
Scope: Standalone AI operations and Companion Full V4/Application Factory execution

## Context

A provider call can become unsafe when the reviewed Preview payload differs from
the later Execute input, when two UI paths dispatch the same semantic operation,
or when privacy filtering is applied only to one caller. Preview, cache,
confirmation, provider selection, budgets and retries therefore need one
explicit execution contract.

## Decision

Every executable AI operation compiles a canonical provider plan from current
authoritative input and the current explicit AI/privacy policy. Its deterministic
`provider_plan_hash` covers the exact provider messages, provider/model,
provider-affecting options, compiler and repair fingerprints, subject IDs, and
privacy/input fingerprints. Budget-limit and cache-only changes are operational
inputs, not plan semantics.

The execution sequence is:

```text
plan → provider-free Preview → authenticated receipt → explicit confirmation
→ current-plan/policy verification → semantic claim → atomic attempt reservation
→ durable dispatching → provider → bounded repair → sanitized result
```

The Companion uses an HMAC receipt backed by a dedicated OS-keyring secret.
Preview may render without initializing or writing that secret; execution fails
closed when it is unavailable. Companion SQLite is canonical for the shared
execution and attempt ledger. Standalone Dexie is canonical for Standalone's
equivalent ledger. Same-plan duplicates share one persisted result and do not
dispatch a second provider attempt. A post-dispatch timeout is durable
`outcome_unknown` and is never automatically retried; SDK retries are disabled.

Provider input is allowlist-first. Allowed nested string leaves are recursively
redacted before truncation; unknown fields, secrets, private static instructions
and raw provider output are not forwarded or persisted. Raw output may exist
only in the in-memory bounded repair window. Preview exposes the exact redacted
dynamic payload and the receipt-bound disclosure without exposing private static
prompt text or secrets.

Application Factory Preview is fully provider-free and side-effect-free. Full
V4 Preview retains ADR-007's narrow exception for one official read-only
hydration of an incomplete selected vacancy; it has no application/status side
effect. Neither path auto-applies, writes HH forms, handles HH cookies, or sends
external recruiter/follow-up messages.

## Consequences

- A stale receipt, changed input/privacy policy, missing execution permission,
  duplicate in-flight operation, or exhausted budget blocks before dispatch.
- Repair and explicit retry attempts are counted as real provider attempts;
  Preview and cache reuse cost zero attempts.
- Queue state remains separate from application status, and invalid/unknown
  results cannot become ready-for-manual-apply.
- The two local ledgers are deliberately mode-local; switching modes is not
  represented as one cross-storage atomic transaction.

## Rejected alternatives

- Rebuilding a request ad hoc after confirmation: it permits Preview/Execute
  drift and is rejected.
- A client-only receipt or client-generated provider token: it is not an
  authenticated authority and is rejected.
- Auto-retrying timeouts or dispatching without durable state: the provider
  outcome may already exist and duplication is unsafe, so it is rejected.
