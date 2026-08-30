# R5-A Runtime Contract

`POST /application-sessions/preview` accepts only explicit vacancy IDs,
deduplicates nothing silently, validates existence, and performs zero provider
calls. `POST /application-sessions` persists deterministic ordered items,
with a maximum of 20. `GET /application-sessions/{id}` resumes the queue.

`POST /application-sessions/{id}/execute` requires `confirmation=true`, limits
work to explicit selected items and at most 20 items per call, and processes
sequentially (concurrency 1). It reuses the existing V4 cache and analysis
service. A failed item is marked FAILED without rolling back completed items;
archived items are DEFERRED. SKIP decisions never generate letters. The queue
does not create or confirm external applications. APPLIED remains possible
only through the existing explicit AOPS-13 transition service.
