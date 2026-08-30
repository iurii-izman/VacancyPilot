# AOPS-10 Live Public HH Smoke

Date: 2026-08-30

The configured application credential was used only inside the companion for a
single bounded official request. The credential value was not printed or
persisted by the smoke command.

| Field | Result |
|---|---|
| endpoint category | public vacancy search |
| endpoint | `GET https://api.hh.ru/vacancies` |
| method | GET |
| request | `text=python`, `page=0`, `per_page=1` |
| status | 200 |
| latency | 1870 ms (local command wall time) |
| item count | 1 |
| pagination | 2000 pages reported by HH; implementation remains bounded to the official 2000-result depth |
| normalization | not persisted during smoke; client response model parsed successfully |
| writes | none |

No response body, description, Authorization header, token fragment, or
upstream request ID was recorded.
