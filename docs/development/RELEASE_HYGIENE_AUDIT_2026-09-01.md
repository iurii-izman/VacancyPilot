# Release Hygiene Audit — 2026-09-01

## VERDICT

`RELEASE_HYGIENE_COMPLETE_WITH_MANUAL_RETIREMENTS`. No feature work was
introduced. The intended operating mode remains **FEATURE DEVELOPMENT:
FROZEN** / **MODE: REAL DAILY USE / DOGFOOD**.

## BASELINE

| Check | Result |
| --- | --- |
| Repository | `C:\Dev\VacancyPilot` |
| Starting branch | `main` |
| Baseline HEAD / `origin/main` | `c7792e8afc7508e453bb9a67080245605da8aaab` |
| Baseline message | `merge: synchronize R5 documentation truth` |
| Starting worktree | clean; one registered worktree |
| Starting stashes | 4; inspected, retained |
| Starting tracked files | 740 |
| Starting tracked bytes | 4,394,423 |
| `git diff --check` | PASS |
| `git fsck --full` | no missing/corrupt reachable objects; dangling recovery objects retained |
| Local hygiene branch before merge | `chore/r5-release-hygiene` (local only; never pushed) |

The baseline was verified before creating the local hygiene branch. The
pre-prune VacancyPilot bundle is preserved outside the active development root:

`C:\Dev-archive\VacancyPilot\recovery\2026-09-01\VacancyPilot-pre-prune-2026-09-01.bundle`

SHA-256: `AA1D19E2BEDA5D18726AE271C8539741DA0BE69FE85824349DCB264FF6C7731B`.

## MAIN REPO BEFORE/AFTER

Before pruning: 740 tracked files / 4,394,423 tracked bytes. After the local
prune and fixture-isolation fix: 511 tracked files / 3,504,975 tracked bytes
(working-tree byte measurement; Git tree blob total is 3,497,235 bytes).
The tracked deletion count is 231 files. Runtime, tests, fixtures, migrations,
contracts and required tooling were protected.

Tracked size by top-level folder before pruning:

| Folder | Files | Bytes |
| --- | ---: | ---: |
| `.github` | 11 | 18,528 |
| root files | 17 | 141,814 |
| `assets` | 1 | 5,777 |
| `companion` | 104 | 958,207 |
| `docs` | 346 | 1,562,584 |
| `entrypoints` | 16 | 207,024 |
| `public` | 6 | 3,692 |
| `scripts` | 1 | 2,573 |
| `shared` | 1 | 162,475 |
| `src` | 236 | 1,331,749 |

## PROPOSED DELETE MANIFEST

The following groups are deletion candidates on the local hygiene branch. The
proof is based on `git grep`/`git ls-files` and inspection of package scripts,
CI, WXT configuration, imports, Python entrypoints, migrations, contracts,
tests and current documentation. No runtime source, test, fixture, migration,
accepted ADR or canonical contract is in this table.

| Path | Classification | Reason | Reverse-dependency proof | Recovery source |
| --- | --- | --- | --- | --- |
| `docs/search/*` | `DELETE_TRACKED_CURRENT_TREE` | External model dumps and superseded discovery/audit material | Only the master spec/AGENTS mention the historical source directory; no runtime, CI, test or current contract import | Git history before pre-prune SHA |
| `docs/development/prompts/*` | `DELETE_TRACKED_CURRENT_TREE` | Executed one-shot implementation prompts; no longer an active work queue during dogfood freeze | Referenced only by superseded workflow/history documents and reports; no package/CI/runtime consumer | Git history before pre-prune SHA |
| `docs/development/iterations/*` | `DELETE_TRACKED_CURRENT_TREE` | Completed iteration decomposition and plans | No runtime/package/CI/test/fixture/migration consumer; code comments are not file dependencies | Git history before pre-prune SHA |
| `docs/development/epics/*` | `DELETE_TRACKED_CURRENT_TREE` | Superseded epic decomposition | No runtime/package/CI/test/fixture/migration consumer; current state points to Memory Lite and accepted ops docs | Git history before pre-prune SHA |
| `docs/development/application-ops-pack/prompts/*` | `DELETE_TRACKED_CURRENT_TREE` | Completed/paused executor prompts; implementation pack remains as non-prompt reference tooling | No runtime/package/CI/test consumer; pack README will explicitly record prompt retirement | Git history before pre-prune SHA |
| `docs/development/00-product-development-plan.md` | `DELETE_TRACKED_CURRENT_TREE` | Historical execution plan superseded by current roadmap and Memory Lite | Only historical prompts/reports referenced it; no current runtime or release gate consumer | Git history before pre-prune SHA |
| `docs/development/01-epics.md` | `DELETE_TRACKED_CURRENT_TREE` | Historical epic index | Only historical pack files referenced it | Git history before pre-prune SHA |
| `docs/development/02-iteration-map.md` | `DELETE_TRACKED_CURRENT_TREE` | Historical iteration map | Only historical pack files referenced it | Git history before pre-prune SHA |
| `docs/development/03-autopilot-workflow.md` | `DELETE_TRACKED_CURRENT_TREE` | Superseded external-agent workflow | Only prompt/session docs referenced it; no executable consumer | Git history before pre-prune SHA |
| `docs/development/04-zed-deepseek-workflow.md` | `DELETE_TRACKED_CURRENT_TREE` | Superseded executor workflow | Only prompt/session docs referenced it; no executable consumer | Git history before pre-prune SHA |

The initial deletion command removed the five groups and five superseded
top-level plan/workflow files above. The remaining current-facing references
were updated in the same change; historical reports may still mention old
paths as historical facts, but do not drive runtime or release tooling.

Potentially useful one-off audit reports not in the table are retained until a
separate evidence review proves they are neither current acceptance evidence
nor unique regression context.

## DEAD CODE RESULT

No proven dead runtime TypeScript/React file, WXT entrypoint, FastAPI router,
Python module, CLI entrypoint or script was found. The two empty tracked
`__init__.py` files are intentional package markers and remain kept.

## TEST/FIXTURE RESULT

Tests and fixtures are release protection. Current parser, search-card,
security, release-safety, migration and companion coverage remains kept. No
test was removed merely to reduce counts. Root verification passed 78 test
files / 1,864 tests; release safety passed 10 files / 420 tests; companion
verification passed 356 tests. The fixture inventory remains 19 vacancy
fixtures and 3 search fixtures.

## DOCUMENTATION PRUNE

Current README, AGENTS, PRIVACY, SECURITY, `docs/README.md`, ROADMAP, Project
Memory Lite, master specification, Application Ops contracts/ADRs/status,
current R5 acceptance/daily-use/install/release/security documents remain.
Completed planning packs and external model-dump archaeology are removed from
the current tree and remain available through normal Git history. `docs/HISTORY.md`
records the retrieval contract.

## LOCAL CACHE/BUILD CLEANUP + BYTES RECLAIMED

Explicitly regenerable directories are measured before deletion and removed
only by exact path: `.mypy_cache`, `.output`, `.playwright-cli`, `.ruff_cache`,
`.wxt`, companion Python caches and `output`. `node_modules`, companion `.venv`,
`companion/data`, private engine data, keyring data and `.claude` are not
blanket-cleaned. Before the first final cleanup pass, the measured removable
set was 75,879,498 bytes; all exact targets were absent immediately afterward.
The retained `node_modules`, `companion/.venv`, `companion/data` and `.claude`
paths were verified present. Python cache directories inside the retained
`.venv` were removed as regenerable caches; the environment itself was not
removed. Final gates may regenerate ignored caches, which are safe to remove
again without affecting tracked state. After the post-merge gates, the exact
same cleanup targets reclaimed an additional 35,436,536 bytes and were absent
again.

## AUXILIARY WORKSPACE TABLE

| Path | Observed state | Classification / action |
| --- | --- | --- |
| `C:\Dev\career-signal-hh` | Git repo; `main` clean/synced, current checkout is dirty on `codex/epic-l-sync-maturity`; 1 local modification | `MANUAL_DECISION` / keep separate until owner reviews local change |
| `C:\Dev\hh-vacancy-cleaner` | Plain 13-file legacy helper, 64,875 bytes, no Git metadata | `ARCHIVE_LOCAL_THEN_DELETE`; preserve full archive before removing active copy |
| `C:\Dev\VacancyPilot-git-recovery` | Plain recovery evidence; `main.corrupt-backup` present | `ARCHIVE_LOCAL_THEN_DELETE`; move intact into external recovery archive |
| `C:\Dev\VacancyPilot-prompts` | Plain archive containing one historical prompt, 41,633 bytes | `ARCHIVE_LOCAL_THEN_DELETE`; hash and move intact outside active `C:\Dev` |
| `C:\Dev\VacancyPilot-recovery-backups` | 70 recovery files, 45,882,270 bytes | `ARCHIVE_LOCAL_THEN_DELETE`; consolidate intact; delete only exact duplicates after equality proof |
| `C:\Dev\workoutreach` | Distinct private Git repo; `main` synced but worktree has 12 changes/untracked entries | `KEEP_SEPARATE_PROJECT`; no archive/delete in this pass |
| `C:\Dev\workoutreachHH` | Private V4 Git repo, no remote, HEAD `d9b6853ccf9b67a46cb3dba709612b4e1e18ee4f`, 2 status entries/26 untracked | `KEEP_PROTECTED`; never delete |

## workoutreachHH PROTECTED BACKUP/HEAD/VALIDATOR

The protected bundle was created and verified before cleanup:

`C:\Dev-archive\VacancyPilot\recovery\2026-09-01\workoutreachHH-2026-09-01.bundle`

SHA-256: `60C8A72C01F3D5FA41ACA944C0703C5F276CB6DE9D12725D7BEC07DFA49D7BDF`.
`git bundle verify` passed and reported a complete history including the local
`v4.0.0` and `v4.0.0-rc1` tags. `git fsck --full` reported no missing or
corrupt objects. No private V4 payload was read, copied into the public repo,
or modified.

## RECOVERY CONSOLIDATION

The existing recovery backup contains an exact duplicate of the new
`workoutreachHH` bundle (same 2,861,759-byte size and SHA-256). The corrupt-main
forensic file, all unique patch/status manifests and both verified bundles are
preserved under `C:\Dev-archive\VacancyPilot\recovery\2026-09-01` (70 recovery
files plus the new evidence). The duplicate was not removed: retaining both
copies is the safer recovery posture while the old backup remains an explicit
forensic record.

## LEGACY GITHUB REPOS AND ARCHIVE DECISIONS

Read-only GitHub audit:

- `iurii-izman/VacancyPilot`: public, unarchived, default `main`; branch
  protection reports force-push and deletion disabled; zero open code-scanning
  and secret-scanning alerts; two open Dependabot alerts.
- `iurii-izman/career-signal-hh`: public, unarchived; local clone has a dirty
  branch checkout, so no archive/delete action is safe in this pass.
- `iurii-izman/workoutreach`: private, unarchived; local worktree is dirty, so
  it remains a separate project and is not archived/deleted.

No GitHub repository is deleted. No archive mutation is applied until the
corresponding local clone is clean, unique data is preserved, and a verified
bundle exists.

## DEPENDENCY/SECURITY STATE

The package dependency graph is unchanged. `pnpm audit --json` reported 3 high
and 1 moderate advisories, all in the development graph through PostCSS/Vite/
Vitest/WXT and nanoid; no production dependency change was justified during
release hygiene. `pnpm audit fix --force` was not run. `uv lock --check
--project companion` passed. The GitHub audit found two open Dependabot alerts,
zero open code-scanning alerts and zero open secret-scanning alerts.

## CLEAN-CLONE PROOF

Fresh clone proof passed from `dd93df55c6bd68a5bed2bbf753abff524d7fff8b`
outside the active repository. `pnpm install --frozen-lockfile`, `pnpm verify`,
`pnpm test:release`, `uv sync --project companion --frozen` and
`pnpm verify:companion` all passed. The clone used no sibling path or private V4
source; the temporary clone was removed afterward. The only sibling-name scan
hits were the expected references in this audit report.

## GITHUB HARDENING

Read-only audit completed. Main deletion and force-push protections are already
disabled at the remote; three rulesets exist, with administrator enforcement not
enabled. CI, dependency review, secret scanning/push protection and Dependabot
configuration are present. No remote branch or repository archive/delete
mutation was applied: `career-signal-hh` and `workoutreach` both require manual
review because their local checkouts are dirty.

## SAFETY

- History rewritten: **NO**
- Force push: **NO**
- Private V4 lost: **NO**
- Operational DB deleted: **NO**
- Auto-apply introduced: **NO**
- External send introduced: **NO**
- Recovery stashes dropped: **NO**
- GitHub repositories deleted: **NO**

## FINAL GIT STATE

The hygiene branch was merged into `main` with a non-fast-forward merge after
the full gates, the post-merge gates passed, the local hygiene branch was
deleted, and `main` was pushed without force. The final handoff verifies a
clean `main` tracking `origin/main`; the non-fast-forward merge result was
`8020566ec3d7e2cd50dde7aa9c6636d2bbe74601`. The final audit-record commit was
pushed afterward as a normal commit. No history rewrite or force push was
used.

## FINAL C:\Dev ACTIVE WORKSPACE

Final safe state: active `C:\Dev\VacancyPilot`; protected
`C:\Dev\workoutreachHH`; separate `C:\Dev\workoutreach`; no active copies of
the archived helper/prompt/recovery directories. `career-signal-hh` remains
manual because its current checkout is dirty. The archived local paths are
intact under `C:\Dev-archive\VacancyPilot`.

## OPERATIONAL MODE

**FEATURE DEVELOPMENT: FROZEN**

**MODE: REAL DAILY USE / DOGFOOD**

## NEXT

Use the cleaned VacancyPilot baseline for real applications. Do not start new
feature work based only on cleanup findings.
