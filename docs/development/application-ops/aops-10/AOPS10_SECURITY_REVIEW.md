# AOPS-10 Security Review

Date: 2026-08-30

## Findings

| Area | Severity | Result |
|---|---|---|
| SSRF / host injection | P0 BLOCKER | fixed official base URL and `urljoin` with route-only paths; no user URL or host is accepted |
| query/header injection | P1 MUST_FIX | allowlisted Pydantic profile query and fixed client headers |
| application-token exposure | P0 BLOCKER | OS keyring only; no extension, SQLite, query JSON, logs, fixtures, or error body |
| unbounded pagination | P1 MUST_FIX | `per_page <= 100`, depth bounded to 2000 results, finite page loop |
| retry storms | P1 MUST_FIX | max two retries, capped Retry-After, GET-only |
| malformed JSON / upstream HTML | P1 MUST_FIX | tolerant consumed-field models and bounded HTML stripping; sanitized error codes |
| HH write surface | P0 BLOCKER | client rejects non-GET; no application/negotiation/message write route exists |
| extension bypass | P0 BLOCKER | extension calls loopback OpsClient only; no `api.hh.ru` host permission or direct HH fetch |
| migration corruption | P2 SHOULD_FIX | additive migration, Alembic head/check and round-trip tests pass |

No open P0/P1 finding remains for AOPS-10.
