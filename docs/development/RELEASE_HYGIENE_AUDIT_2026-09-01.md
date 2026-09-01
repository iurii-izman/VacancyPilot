# Release Hygiene Audit — 2026-09-01

## VERDICT

`IN_PROGRESS` while the local-prune and validation gates run. No feature work is
in scope. The intended operating mode remains **FEATURE DEVELOPMENT: FROZEN** /
**MODE: REAL DAILY USE / DOGFOOD**.

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
| Local branch | `chore/r5-release-hygiene` (local only; never push) |

The baseline was verified before creating the local hygiene branch. The
pre-prune VacancyPilot bundle is preserved outside the active development root:

`C:\Dev-archive\VacancyPilot\recovery\2026-09-01\VacancyPilot-pre-prune-2026-09-01.bundle`

SHA-256: `AA1D19E2BEDA5D18726AE271C8539741DA0BE69FE85824349DCB264FF6C7731B`.

## MAIN REPO BEFORE/AFTER

Before pruning: 740 tracked files / 4,394,423 tracked bytes. The after values
will be filled after the cleanup commit and merge. Runtime, tests, fixtures,
migrations, contracts and required tooling are protected unless a later proof
entry says otherwise.

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

The initial deletion command removed the five groups and six superseded
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
test is removed merely to reduce counts. Counts and fresh gate results will be
recorded after validation.

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
blanket-cleaned. Before cleanup, the measured removable set is 57,750,232
bytes;
the exact after byte total will be recorded after removal.

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
`workoutreachHH` bundle (same size and SHA-256). The corrupt-main forensic file,
all unique patch/status manifests and the verified bundles are preserved. The
consolidated external archive location and any exact-duplicate removal will be
recorded after the move is completed.

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

The package dependency graph is unchanged. A fresh `pnpm audit --json` result,
the companion locked environment result and Dependabot details will be filled
after the clean-clone and full-gate runs. `pnpm audit fix --force` is forbidden
and will not be run.

## CLEAN-CLONE PROOF

Pending after tracked cleanup. The temporary clone will be outside the active
repository and will run the repository-supported locked setup and release
commands. It must not resolve any sibling path or private V4 source.

## GITHUB HARDENING

Read-only audit completed. Main deletion and force-push protections are already
disabled at the remote. CI, dependency review, secret scanning/push protection
and Dependabot configuration are recorded in current repository docs. Ruleset
details and stale-branch status will be recorded without changing solo-owner
workflow settings.

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

Pending. Target is a clean pushed `main` with no hygiene branch after the
post-merge gates. If any required gate or remote synchronization fails, the
verdict will be downgraded to the applicable blocked/manual state.

## FINAL C:\Dev ACTIVE WORKSPACE

Expected safe target: active `C:\Dev\VacancyPilot`; protected
`C:\Dev\workoutreachHH`; separate `C:\Dev\workoutreach`; no active copies of
the archived helper/prompt/recovery directories. `career-signal-hh` remains
manual because its current checkout is dirty.

## OPERATIONAL MODE

**FEATURE DEVELOPMENT: FROZEN**

**MODE: REAL DAILY USE / DOGFOOD**

## NEXT

Use the cleaned VacancyPilot baseline for real applications. Do not start new
feature work based only on cleanup findings.
