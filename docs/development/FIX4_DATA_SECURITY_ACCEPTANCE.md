# Fix 4 Data Security Acceptance

Status: `ACCEPTED`
Date: `2026-09-10`
Scope: current private local dogfood checkout
Verdict: `VACANCYPILOT_FIX4_DATA_SECURITY_COMPLETE`
Verified commit: the single Fix 4 closeout commit recorded in Git history

This report is the current acceptance artifact for the bounded Fix 4 pass. It
does not rewrite the historical Fix 1, Fix 2 or Fix 3 reports. Runtime code,
tests and the generated OpenAPI snapshot remain authoritative.

## Preflight

| Item | Evidence |
| --- | --- |
| Branch | `hotfix/hh-vacancy-hydration-v4-card` |
| Starting short HEAD | `c62e4ab1` (`--short=8`) |
| Starting full HEAD | `c62e4ab1e6a1e63f03b0e826acfa3cda56ca0e45` |
| `main` / `origin/main` | `7c0f8e937cdcfe65882f1c6a8ea365d38dbec705` |
| Starting worktree | clean |
| `.local` | ignored and kept out of Git |
| Sibling repository dependency | none |

No live provider call, live HH sync, HH write, auto-apply, private V4 package
read or public endpoint was used by this pass.

## Findings

| Finding | Disposition | Evidence |
| --- | --- | --- |
| `DATA-DELETE-001` | corrected | `src/services/delete-all.ts`, `src/services/reset-guard.ts`, reset/export tests |
| `DATA-DELETE-002` | corrected | structured Standalone cascade, terminal outbox handling, Ops refusal, export tests |
| `SEC-DOM-001` | corrected | closed Shadow DOM badge, no page hide/dim, badge and release-safety tests |
| `SEC-CSV-001` | corrected | string-only CSV formula neutralization and export tests |
| `SEC-SYNC-FANOUT-001` | corrected | explicit scope, 50-profile/2,000-item limits and single-flight tests |
| `SEC-ACTION-001` | corrected | trusted extension-owned quick actions plus background validation |
| `SEC-URL-001` | corrected | canonical HTTPS HH URL helper and navigation/search/tracker tests |
| `SEC-CONTEXT-001` | corrected | current-tab/sender binding, stale-context clearing and Side Panel tests |
| `SEC-FOLLOWUP-001` | corrected | timezone-aware `due_at` validation before mutation and companion tests |
| `SEC-RATE-001` | corrected | bounded pre-auth limiter before token verification and security tests |
| `SEC-ENGINE-001` | corrected | sanitized fingerprinted engine-status cache and companion tests |
| `SEC-OAUTH-001` | corrected | purge, 128-state cap and atomic consume/disconnect behavior |
| `DATA-EXPORT-001` | corrected | browser-local export wording and exclusion of execution/budget control state |
| `DATA-SET-001` | corrected | schema-first settings normalization and malformed/unknown-field tests |
| `ROUTE-UI-001` | corrected | canonical `?vacancyId=<id>#inbox` selection/close/history behavior |
| `SEC-SERVER-AUTH-001` | accepted risk | current private-dogfood risk with a hard public-release gate; see below |

## Clear extension data

`deleteAllData()` is an extension-local reset, not a Companion backup/delete
operation.

| Surface | Current semantics |
| --- | --- |
| Dexie | Clears every current `TABLE_NAMES` table in a write transaction, including Jobs, profiles, resumes, letters, events, HR timeline, visits, Labs, AI cache, metadata, Ops cache, outbox, `aiExecution` and `aiBudget`. |
| `chrome.storage.local` | Uses exhaustive extension-namespace `clear()`; the compatibility fallback removes all known VacancyPilot namespaces. Safe default settings are restored after the clear. |
| `chrome.storage.session` | Cleared exhaustively. |
| Provider keys | Cleared with the extension namespace; no Companion secret is copied into browser storage. |
| Companion token | Cleared with local storage and the in-memory Companion client generation is reset. |
| HR drafts | Cleared by namespace during global reset and by exact job key during per-job deletion. |
| Badge/context | Badge keys, Side Panel context and bindings are cleared; reset messages remove live content-script state and stale generations are ignored. |
| Ops cache/meta/outbox | Cleared as browser-local Dexie coordination/cache data; authoritative Companion records are not deleted. |
| Labs/events | Cleared as browser-local records. |
| Fix 3 coordination | Execution rows, budget reservations and related browser coordination state are cleared; Standalone unsafe execution states block reset. |
| Reset guard | `withResetGuard()` increments an epoch, drains already-admitted writes and blocks new writes. Async UI/service writers also reject stale epochs or cannot re-enter during reset. |
| Outcome unknown | Standalone reset blocks `claimed`, `dispatching`, `repairing` and `outcome_unknown`; Ops reset may clear only browser-local state because Companion authority is untouched. |
| Companion DB/keyring/private engine | Not touched by extension reset. There is no remote revoke/delete call. |
| User copy | Options, privacy disclosure and trust/safety copy say browser-local supported categories and explicitly exclude Companion SQLite/keyring/private engine. |

Browser-global history, cache, password and cookie APIs are not used.

## Per-job delete

- Standalone deletion resolves one Job and its structured identity, then
  cascades linked applications, cover letters, application events, HR timeline,
  visit marks, Labs actions, AI cache/meta, browser outbox, Ops cache and the
  exact HR draft/badge keys.
- Linked outbox rows in terminal states (`pending`, `retrying`, `dead`,
  `conflict`) are removed. Linked in-flight/unknown rows are refused with
  `RESET_BLOCKED_OUTCOME_UNKNOWN`; no substring matching is used for linkage.
- Per-job deletion is refused with `OPS_LOCAL_DELETE_ONLY` while Ops is
  authoritative. Fix 4 does not invent an authoritative Companion delete API.
- Targeted Vitest coverage proves the cascade, in-flight block and preservation
  of unrelated records.

## Historical raw provider data

- Active recognized stores were inspected with the scrubber in dry-run mode:
  `companion/data/vacancypilot.db` reported 6 legacy non-empty
  `engine_runs.raw_output` rows; `.local/data/companion/vacancypilot.db`
  reported 0. No recognized backup database was found.
- Browser storage/schema and export audits found no raw provider-body field in
  the browser stores; raw provider output is not an export field.
- `companion/app/analysis/service.py` no longer rehydrates legacy raw output;
  runtime execution uses structured/sanitized results and bounded in-memory
  repair input only.
- `scripts/maintenance/scrub_engine_raw_output.py` is dry-run by default,
  accepts destructive mode only with `--confirm`, recognizes only the
  repository's canonical/legacy Companion roots and approved backup names,
  refuses arbitrary paths, updates only `raw_output`, and checks SQLite
  integrity before and after confirmation. Tests prove structured results are
  preserved and raw values are not printed.
- No raw value was printed. No destructive confirmation was run against the
  real `.local` database. The 6 legacy rows in `companion/data` remain an
  explicit operator follow-up rather than an unreviewed destructive mutation.

## HH DOM privacy

| Field | Result |
| --- | --- |
| Old channel | Global page styles and state-bearing card classes are no longer a production path; the compatibility style injector is a no-op and legacy classes are only removed. |
| Chosen strategy | Extension-owned closed Shadow DOM for the badge. |
| Shadow fallback | No open-root or page-DOM fallback. |
| Page-owned state | No status/score/view/saved/rejected state in page classes, `data-*`, title, ARIA or page text. |
| Host attributes | Only generic state-independent `vp-sb-host`; no vacancy state in the host class. |
| Score/status/view leakage | State remains inside the closed root and extension-owned action mapping. |
| Dim/hide behavior | No HH card hiding or dimming; legacy dim/hidden classes are removed. |

## Quick actions

Quick-action controls are inside the closed extension root. A synthetic event is
rejected; a trusted event still requires a matching canonical vacancy ID/URL.
The background handler validates the current sender tab, approved HH search
page, action payload and canonical reference before changing local data. The
synthetic-event regression returns no privileged action.

## HH URL policy

- Supported authority is exact `hh.ru` or a real subdomain ending in `.hh.ru`;
  lookalikes and foreign hosts are rejected.
- Only HTTPS canonical vacancy paths `/vacancy/<numeric-id>` are accepted.
  Query/fragment data is discarded during canonicalization; protocol-relative,
  `javascript:`, `data:`, userinfo, explicit-port and malformed-ID inputs are
  rejected.
- Redirect/nested-link extraction recursively decodes only within the same
  approved HH authority and binds the extracted ID to the canonical URL.
- Search extraction, tracker, visit marks, badge actions, background messages,
  Side Panel navigation and external open helpers use the same central policy.

## Side Panel context

- Fresh authority comes from the current active tab in the current window and,
  for background messages, the sender tab URL/ID binding.
- Stored context is a convenience cache only; it is not accepted as authority
  when live proof is unavailable or stale.
- Numeric vacancy IDs and canonical URL/ID equality are required.
- Navigation away, tab reset and failed live lookup clear the binding and UI;
  there is no fallback to a different vacancy.
- The implementation is event/lookup based and adds no unbounded polling or
  per-tab resource map.

## HH sync

- Implicit all-profile sync is removed. The UI sends explicit selected IDs or
  explicit `all_enabled: true`.
- The profile bound is 50 and the aggregate item bound is 2,000 per run.
- Duplicate IDs, ambiguous/empty scope, disabled/missing profiles and over-limit
  explicit scopes are refused with stable error codes.
- Broad queries are refused; an aggregate item limit is reported as
  `truncated`, `limit_reached`, partial status and `HH_SYNC_ITEM_LIMIT` rather
  than silently dropping results.
- Identical scopes are protected by a process-local single-flight lease and
  return `HH_SYNC_IN_PROGRESS`; fake-client call-count coverage proves a second
  HH execution is not started. No cooldown was added because the lease directly
  covers the duplicate concurrent execution risk.

## Follow-up, rate, engine and OAuth controls

- `due_at` must be ISO-8601 with a timezone; it is normalized to UTC `Z` before
  any DB/revision mutation. Invalid input returns validation error and leaves no
  row.
- Pre-auth authentication attempts are bounded before token verification by a
  60/minute, max-64-entry limiter keyed by loopback peer and coarse route; the
  protected limiter remains after verified identity. OPTIONS/health/public
  engine status and pairing flows retain their existing behavior.
- Engine status caches sanitized metadata by current-package path/mtime/size,
  with 5-second success and 1-second error TTLs and a maximum of 8 cache
  entries. No candidate/private package text is in the response or cache.
- OAuth state is purged before start/callback, capped at 128 pending states,
  atomically consumed once, and cleared on disconnect; replay is rejected.

## CSV, export, settings and route

- CSV neutralizes only string cells whose first non-whitespace/control character
  is `=`, `+`, `-` or `@`; typed negative numbers remain numeric, CSV quoting is
  preserved and JSON export is unchanged.
- Export is a supported browser-local extension export. It excludes API keys,
  control-plane execution/budget state and Companion SQLite/keyring/private
  engine data. Delete copy uses the same boundary.
- Settings are normalized field-by-field against the schema; unknown top-level
  and nested keys, malformed values and unsafe Companion base URLs do not
  survive round-trip. Compatibility fields remain only where modeled.
- Inbox selection uses canonical `?vacancyId=<id>#inbox` history entries; select
  pushes, close replaces, Back/Forward and reload rehydrate the same numeric
  ID, and invalid/nonexistent IDs do not select another card. Standalone and
  Ops keep their existing authority boundaries.

## Server identity decision

`SEC-SERVER-AUTH-001` is `ACCEPTED_RISK_WITH_PUBLIC_RELEASE_GATE` for private
local dogfood. The threat is a malicious local process impersonating the
loopback Companion. Current controls are loopback-only supported binding,
client authentication/pairing, bounded pre-auth attempts, constrained CORS,
sanitized responses and no developer cloud backend. Server identity is not
technically solved in Fix 4. Before public distribution, implement/review
authenticated IPC, pinned local TLS or an equivalent server-identity control.
TLS/mTLS/named-pipe work was intentionally not added.

## Browser fixture smoke and resource posture

The automated fixture/release-safety surface is available and passed. Manual
unpacked-extension visual/browser acceptance remains
`FIX4_BROWSER_ACCEPTANCE_NEEDS_HUMAN_REVIEW`; this is not an automated-gate
failure. Badge hosts are removed on reset/disconnect, observer/listener paths
are bounded, context state is generation-bound, sync single-flight state is
cleared, the rate limiter and OAuth maps are capped, engine cache entries are
bounded, and no browser history is retained.

## Verification record

Targeted frontend Fix 4 tests passed: 5 files / 123 tests. The full frontend
and release suites passed before closeout at 93 files / 1,951 tests and 11
release files / 450 tests. The Companion focused sync/follow-up suite passed
16 tests; the full Companion suite passed 412 tests with one existing
Starlette/httpx deprecation warning.

Required closeout gates:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:release
pnpm companion:format-check
pnpm companion:lint
pnpm companion:typecheck
pnpm companion:test
pnpm companion:openapi-check
pnpm verify
pnpm verify:all
git diff --check
```

Final closeout result:

- `pnpm verify`: passed — frontend typecheck, lint, 93 files/1,951 tests and
  production build. The build retains one non-safety Vite chunking warning
  about `ops-intake.ts` being both statically and dynamically imported.
- `pnpm test:release`: passed — 11 files/450 tests.
- `pnpm verify:companion`: passed — Ruff format/lint, strict mypy, 412 tests
  and OpenAPI drift check; one existing Starlette/httpx deprecation warning.
- `pnpm verify:all`: passed end-to-end.
- `git diff --check`: passed; Git reported only existing CRLF-to-LF warnings
  for touched files, with no whitespace errors.
- Secret/private-store scan: no tracked `.local` paths or database artifacts;
  no `wxt.config.ts`/manifest permission diff; no recognized backup database.
- Real dry-run scrub output: legacy store 6 rows, canonical `.local` store 0;
  no raw values printed and no real destructive confirmation run.

## Safety and scope

- No real provider calls, HH sync calls, HH writes, auto-apply, synthetic HH
  form events, CAPTCHA bypass, cookie/password/session handling or developer
  telemetry were introduced.
- No Chrome permission or host-permission broadening occurred.
- The private V4 engine and candidate knowledge remained outside the tracked
  worktree; Ops authority and the Fix 3 execution contract remain intact.
- Fix 5 contracts/CI/dependency overhaul and historical-document cleanup are
  deferred.

## Git closeout

- Commit: one `fix: harden data lifecycle and local security boundaries`
  commit; hash is reported with the closeout response
- Worktree: clean after commit
- Push: none
