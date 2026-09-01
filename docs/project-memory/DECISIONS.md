# Decision Register

This is a retrieval aid, not a replacement ADR system. Only decisions evidenced by accepted sources are listed.

| ID | Status | Decision | Rationale summary | Canonical source | Supersedes / superseded by |
| --- | --- | --- | --- | --- | --- |
| ADR-001 | ACCEPTED | Use a local loopback FastAPI companion for Application Ops. | Keeps Engine V4, relational storage, and OS-keyring secrets local without a cloud backend. | [`ADR-001`](../development/application-ops/adr/ADR-001-local-companion.md) | — |
| ADR-002 | ACCEPTED | SQLite is canonical in Ops Mode; Dexie is canonical in Standalone Mode and a cache/outbox in Ops Mode. | Prevents split-brain writes while preserving offline standalone use. | [`ADR-002`](../development/application-ops/adr/ADR-002-sqlite-dexie-authority.md) | — |
| ADR-003 | ACCEPTED | Generated OpenAPI is the canonical companion API contract. | Prevents hand-maintained client/server contract drift. | [`ADR-003`](../development/application-ops/adr/ADR-003-openapi-contract-source.md) | — |
| ADR-004 | ACCEPTED | Programmatic HH access uses official read-only APIs through the companion; extension page access is read-only DOM inspection. | Keeps HH tokens out of extension storage and prevents hidden or write operations. | [`ADR-004`](../development/application-ops/adr/ADR-004-hh-official-read-only-boundary.md) | — |
| ADR-005 | ACCEPTED | Real V4 candidate knowledge stays outside the repository; only loader code, schemas, and synthetic fixtures are committed. | Protects private candidate data while retaining testability. | [`ADR-005`](../development/application-ops/adr/ADR-005-engine-package-privacy.md) | — |
| ADR-006 | ACCEPTED | Product AI scope is OpenAI BYOK plus the manual ChatGPT Project Bridge; DeepSeek is not automatically a product provider. | Separates coding-tool use from product scope and avoids an unreviewed provider matrix expansion. | [`ADR-006`](../development/application-ops/adr/ADR-006-ai-provider-boundary.md) | — |

No PROPOSED or SUPERSEDED decisions are registered here; proposals remain in their source documents until accepted through the repository decision process.
