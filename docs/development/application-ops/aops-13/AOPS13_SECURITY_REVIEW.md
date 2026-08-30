# AOPS-13 Security Review

Date: 2026-08-30

| Review area | Severity | Result |
|---|---|---|
| Forged external event/source | P0/P1 | source is validated; HH events are informational unless an explicit transition is requested |
| Status mutation bypass | P0/P1 | HTTP status changes use `transition_application`; revision and transition matrix are enforced |
| APPLIED without confirmation | P0/P1 | rejected without user confirmation plus sent-letter or documented no-letter reason |
| Duplicate/retry behavior | P0/P1 | application natural key, event idempotency key and follow-up idempotency key are stable |
| Lost update | P0/P1 | application/follow-up revisions are checked and stale writes return 409 |
| Fake sent state / auto-send | P0/P1 | sent follow-up requires explicit confirmation; generation is offline draft-only |
| Event payload leakage | P0/P1 | payloads are bounded and pass central redaction before persistence |
| HH/OAuth/provider secrets | P0/P1 | no tokens, keys, direct HH calls or provider calls are introduced |
| Timezone handling | P2 | persisted ISO timestamps are normalized for state derivation; UI renders local time |

No P0/P1 findings remain. No external messaging or HH form/API write exists.
