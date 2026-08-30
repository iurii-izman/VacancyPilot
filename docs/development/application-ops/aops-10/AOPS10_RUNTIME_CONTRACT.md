# AOPS-10 Runtime Contract

1. HH calls run only in the companion through the fixed official API origin.
2. The public HH client exposes safe GET resources only; token issuance is a
   separate explicit lifecycle operation.
3. The application token is read from OS keyring slot
   `SecretSlot.HH_APPLICATION_TOKEN` and never enters SQLite, Dexie, logs,
   query JSON, fixtures, or extension responses.
4. `User-Agent` and `HH-User-Agent` are present on every HH request.
5. Every request has an explicit bounded timeout.
6. Retries are bounded and apply only to safe GET operations.
7. 429 honors a bounded valid `Retry-After` delay or a bounded fallback.
8. 401 is never retried infinitely; 403 is surfaced as a capability/auth
   result without blind retry.
9. 5xx retry count and delay are bounded.
10. Search profile query objects are versioned and allowlisted; arbitrary URLs,
    hosts, headers, endpoints, and unsupported query parameters are rejected.
11. Pagination is service-owned, per-page is bounded, and the 2000-result
    official search depth is respected.
12. Normalized results reuse the existing vacancy intake and canonical natural
    key `(source, source_vacancy_id)`.
13. Changed vacancies use existing snapshot behavior; unchanged results do not
    create snapshot spam.
14. Stage A may run deterministically after intake; Full V4 is never automatic
    for all results.
15. Sync is manual only. There is no scheduler; recurring sync belongs to
    AOPS-18.
16. `hh_sync_runs` is append-only and partial profile failure is not reported as
    full success.
17. No HH write methods, auto-apply, auto-message, autofill, or form actions
    exist in this epic.
