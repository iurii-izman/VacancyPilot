# AOPS-09 security and privacy review

Date: 2026-08-30

| Severity | Finding | Disposition |
| --- | --- | --- |
| P0 | A bridge request could expose BYOK material or a private package location. | Fixed: the request is built only from stored vacancy identity/text and fixed instructions; it contains no key, keyring, database or package-path fields. Regression test covers this. |
| P1 | A copied letter could be mistaken for a sent letter. | Fixed: clipboard write has no persistence side effect. A sent snapshot needs the explicit **Save as actually sent** action and is immutable after creation. |
| P1 | User-supplied imported provider text could be reflected in an API error. | Fixed: malformed/invalid imports return the fixed `IMPORT_INVALID` code; raw input is not echoed. |
| P2 | The browser-local editor has no automatic synchronisation of its version history with a paired companion application ID. | Deferred: canonical history is available through the Ops API in paired mode; automatic cross-store reconciliation needs an explicit application mapping and is outside AOPS-09. |
| P3 | Imported raw V4 envelopes are intentionally not retained by default. | Accepted privacy default: extracted letter and bridge provenance are retained; a future opt-in retention policy may add encrypted/raw envelope storage. |

Review conclusions:

- no HH DOM write, hidden fetch, auto-apply, or submit capability was introduced;
- imported content stays untrusted until deterministic local validation succeeds;
- imported scores/evidence are never written to `Application` or `EngineRun`;
- API remains loopback/authenticated and response errors are sanitized;
- the UI renders text through React, so pasted markup is escaped rather than injected.
