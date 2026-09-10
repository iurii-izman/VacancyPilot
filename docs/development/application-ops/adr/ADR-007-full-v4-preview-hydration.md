# ADR-007: Full V4 Preview May Persist Read-Only Vacancy Hydration

Status: ACCEPTED
Date: 2026-09-09
Scope: Full V4 analysis preview

## Context

Full V4 has two different preview contracts. Application Factory Preview is a
planning preview for a manual preparation queue. Full V4 Preview is an
analysis payload preview for one selected vacancy. HH search results can be
lightweight and may not contain enough description data for the V4 compiler.

The current implementation already resolves that case by reading one full
vacancy through the official HH API and applying the normalized result to the
canonical local vacancy before producing the analysis payload preview.

## Decision

**Accept the current behavior.** Full V4 Preview is provider-free and has no
application or application-status side effects, but it may perform and persist
official read-only HH vacancy hydration when the selected vacancy is
incomplete.

The terms are intentionally precise:

- “Provider-free” means Full V4 Preview does not call the configured AI/LLM
  provider.
- “No application/status side effects” means Preview does not create an
  application, create an Application Factory queue item, mutate application
  status, or set `APPLIED`.
- Incomplete-vacancy hydration is a permitted local vacancy-data write. It is
  one official `GET` for the selected HH vacancy, never a HH write operation,
  and is idempotent once the vacancy is analysis-ready.
- Application Factory Preview remains stricter: it is provider-free and
  side-effect-free, with no session/item/application/status mutation.

Documentation and UI must not call Full V4 Preview unqualified
“side-effect-free.” They must use “provider-free” and, where relevant, “no
application/status side effects,” while naming the possible persisted
read-only hydration.

## Consequences

- The first Full V4 Preview of an incomplete selected vacancy can update the
  local vacancy projection and append its canonical snapshot.
- Repeated Preview after successful hydration does not issue another hydration
  request or append another snapshot.
- The explicit Full V4 Execute action remains the only analysis/provider
  execution step.
- Regression tests cover provider calls, hydration calls and persistence,
  Application/APPLIED invariants, HH write absence, already-Full vacancies and
  repeated-preview idempotency.
- Fix 3 adds a second, independent execution boundary after this readiness
  decision: the provider-free payload is compiled into a canonical plan and
  authenticated receipt, then Execute must revalidate current input/privacy
  policy before any provider attempt. This does not widen the hydration
  exception or turn Application Factory Preview into a mutating flow.

## Rejected alternative

Making hydration a separate mandatory user action would preserve a stricter
meaning of “side-effect-free,” but would change the current workflow and
runtime behavior. It is not adopted by this decision.
