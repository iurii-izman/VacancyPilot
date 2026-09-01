# VacancyPilot — R5.4 Final Release-Readiness Seal

Date: 2026-09-01  
Repository: `C:\Dev\VacancyPilot` / `iurii-izman/VacancyPilot`  
Audit scope: final R5.4 release-readiness, baseline hygiene, reproducibility, security boundaries, recovery evidence, and dogfood handoff.

## 1. Verdict

`FINAL_READINESS_SEALED_REMOTE_CHECKS_PENDING`

The evidence gate passed locally and in an isolated clean clone. This provisional verdict remains pending the final documentation commit, merge to `main`, push, and post-push GitHub checks.

No P0/P1 inconsistency was found. No runtime or product-boundary correction was justified.

## 2. Baseline and Git state

- Starting baseline: `4459ae6e5205a82c6fc7e516e6a159280314fd09` (`docs: clarify final merge record`).
- At audit start, `main == origin/main == 4459ae6e5205a82c6fc7e516e6a159280314fd09`.
- Working tree was clean; no tags, releases, extra active worktrees, or unexpected branches were present.
- A local-only audit branch `chore/r5-final-readiness-seal` was used for this report and will not be pushed.
- Four pre-existing stashes were retained.
- `git diff --check` passed.
- `git fsck --full` reported 0 missing/corrupt/error objects and 1,235 retained dangling objects. These are historical recovery objects, not reachable-tree corruption; no prune or destructive cleanup was performed.

## 3. Repository tree and tracked hygiene

- Tracked file count: 511.
- Expected top-level areas are present: `.github`, `assets`, `companion`, `docs`, `entrypoints`, `public`, `scripts`, `shared`, and `src`.
- No tracked generated build output, browser profile, database, log, environment file, key, or secret artifact was found.
- Intentional duplicates were retained: the three standard WXT React entrypoint wrappers are identical, and the two Python `__init__.py` package markers are empty and identical.
- No nested Git repository or submodule is part of the tracked tree.
- Local ignored noise (`.claude`, `node_modules`, `companion/.venv`, `companion/data`) is not release content and was not blanket-cleaned.
- `.gitignore` and `.gitattributes` cover build output, caches, secrets, logs, databases/profiles, Python environments, and text/binary normalization.

## 4. Toolchain and dependency lock state

- Package manager: pnpm 11.1.1; lockfile format 9; frozen install passed.
- Local Node.js: 24.18.0; CI uses Node.js 22/current LTS. This is compatible and intentional.
- WXT 0.21.4, TypeScript 6.x, React/React DOM 19.2.8.
- Companion: Python 3.12.10, uv 0.9.30, `requires-python >=3.12`; `companion/uv.lock` is coherent.
- The only tracked dependency lockfiles are `pnpm-lock.yaml` and `companion/uv.lock`.
- `pnpm audit --json`: 3 high and 1 moderate transitive development-toolchain advisories, all in the PostCSS/Vite/Vitest/WXT graph; no runtime dependency path was identified. Disposition: defer rather than introduce forced toolchain churn.
- GitHub Dependabot has two open PostCSS alerts (#40 moderate and #33 high); the status is documented and consistent with the local audit.

## 5. Runtime boundaries and permissions

- Manifest V3, with runtime permissions limited to `storage`, `sidePanel`, and `activeTab`.
- `host_permissions` is empty. Optional hosts are limited to OpenAI API and the localhost companion endpoint.
- No cookies, passwords, HH session handling, CAPTCHA/antibot bypass, hidden HH fetch, synthetic HH form events, auto-submit, or auto-apply behavior was found.
- Extension UI actions remain user-controlled. Cover-letter preparation and application tracking are local-first/read-first.
- AI and n8n/companion flows remain opt-in with payload preview and redaction controls.

## 6. Security, privacy, and secret hygiene

- Current-HEAD Gitleaks scan passed.
- Full-history Gitleaks reported 7 findings, all in historical synthetic test fixtures (`generic-api-key` / `stripe-access-token` patterns); no live credential was identified and no secret value is reproduced here.
- Current tracked-tree secret-pattern review passed.
- GitHub Code Scanning has no open alerts; the two known CodeQL alerts are fixed. Secret scanning returned no findings.
- Static checks for HH writes, form automation, unsafe fetches, and sensitive permission expansion found no reportable P0/P1 issue.
- `SECURITY.md` and `PRIVACY.md` match the local-first/read-first boundary.

## 7. Migrations and OpenAPI

- Alembic has one head: `e5f7a9b1c3d4`.
- Migration tests cover fresh upgrade, idempotent upgrade, downgrade/upgrade round-trip, current head/schema, and SQLite PRAGMA checks.
- Companion OpenAPI generation/check passed.
- `shared/contracts/openapi.json` is current (SHA-256 `1B9AA323CBB8DD24939D6BB875CC70CDA982BBD99435BE0CABF0100ED59D338C`) with 43 paths.
- No HH write-like endpoint (apply/send/submit/write/response) is present.

## 8. Test and QA evidence

Active repository gates passed:

- `pnpm install --frozen-lockfile`
- `pnpm verify`: typecheck, lint, 78 test files / 1,864 tests, production build, and application-ops workflow validator
- `pnpm test:release`: 10 release test files / 420 tests and production build
- `uv lock --check --project companion`
- `uv sync --project companion --frozen`
- `pnpm verify:companion`: Ruff format/lint, strict mypy over 58 files, 356 pytest tests, and OpenAPI check
- Markdown link validation with URL decoding: 0 missing links

One nonblocking build warning is stable in both local and clean-clone builds: `ops-intake.ts` is both statically and dynamically imported, so the dynamic import does not create a separate chunk. No behavior defect was established; no change was made.

R5 synthetic/manual QA evidence was accepted. A new live HH browser smoke run was not required for this release-readiness seal; no live HH data or session was used.

## 9. Clean-clone reproducibility

An isolated clone from the candidate baseline was created at `C:\Temp\VacancyPilot-final-readiness-seal-20260901`, tested, and then removed after evidence capture.

- Frozen pnpm install passed from a clean dependency state.
- Clean-clone `pnpm verify` passed across all 78 test files and the production build.
- Clean-clone `pnpm test:release` passed: 420 tests and production build.
- Frozen companion sync and `pnpm verify:companion` passed: 356 tests and OpenAPI check.
- The clone was self-contained; sibling-project strings were documentary references only, with no runtime import/dependency/path coupling.

## 10. Production artifact inspection

The active Chrome MV3 artifact was inspected after build:

- `.output/chrome-mv3`: 20 files, 779,036 bytes (779.04 kB).
- Contains the expected background service worker, popup/options/sidepanel pages, content scripts, chunks, icons, and manifest.
- Manifest version is 0.1.0; permissions and optional hosts match the source configuration.
- Forbidden filenames, personal paths, sibling runtime paths, and secret-pattern matches were absent.
- Expected `hh.ru` parsing and extension-created UI handlers are present; release-safety tests confirm they are not HH form automation.

## 11. GitHub remote and CI

- Remote: `git@github.com:iurii-izman/VacancyPilot.git`; repository is public, active, and defaults to `main`.
- No remote tags or releases exist; no tag/release operation was performed.
- Main protection rules prevent deletion and non-fast-forward updates. No mandatory PR review/status-check requirement is configured; this was not changed.
- Latest workflows for the audited baseline `4459ae6`: CI passed and SonarQube Cloud passed.
- Dependency-review and Sonar workflows retain their documented advisory/conditional behavior; no external-product or sibling-repository path was introduced.

## 12. Recovery and historical preservation

Verified recovery bundles:

- `C:\Dev-archive\VacancyPilot\recovery\2026-09-01\VacancyPilot-pre-prune-2026-09-01.bundle` — SHA-256 `AA1D19E2BEDA5D18726AE271C8539741DA0BE69FE85824349DCB264FF6C7731B`.
- `C:\Dev-archive\VacancyPilot\recovery\2026-09-01\workoutreachHH-2026-09-01.bundle` — SHA-256 `60C8A72C01F3D5FA41ACA944C0703C5F276CB6DE9D12725D7BEC07DFA49D7BDF`.

`git bundle verify` passed for both bundles. The workoutreachHH bundle retains the V4 history/tags. The corrupt-main forensic backup `main.corrupt-backup` is preserved under the dated recovery archive. The dirty sibling repository `C:\Dev\workoutreachHH` was inspected but not modified.

## 13. Manual retirements and sibling hygiene

- `career-signal-hh` and `workoutreach` were treated as documented/manual retirement or dirty-sibling states; neither was modified.
- Former helper paths (`C:\Dev\hh-vacancy-cleaner`, `C:\Dev\VacancyPilot-prompts`, `C:\Dev\VacancyPilot-git-recovery`, `C:\Dev\VacancyPilot-recovery-backups`) are absent from the active workspace. Their retained material is represented in the dated archive evidence above.
- No sibling runtime dependency remains in VacancyPilot.

## 14. Changes made by this seal

- Added this release-readiness evidence document only.
- No runtime code, package versions, lockfiles, permissions, manifest hosts, database schema, migrations, OpenAPI contract, V4 artifacts, recovery artifacts, or historical reports were changed.
- No generated build output, secret, browser profile, or local log was committed.

## 15. Operational mode after PASS

FEATURE DEVELOPMENT: FROZEN  
MODE: REAL DAILY USE / DOGFOOD  
MAINTENANCE: HOTFIX / EVIDENCE-DRIVEN ONLY

The product remains a local-first, read-first HH.ru copilot. Auto-apply and all forbidden HH automation remain out of scope.

## 16. Next permitted work

1. Use the extension in real daily dogfood and record only reproducible defects or evidence gaps.
2. Accept only hotfixes backed by evidence; update this seal or a focused audit when a boundary, permission, schema, contract, or release claim changes.
3. Revisit the deferred transitive PostCSS/nanoid advisories only when a safe lockfile/toolchain update is available and the complete gate suite remains green.
4. Do not begin a new feature epic, auto-apply workflow, HH form automation, broad permission expansion, or speculative refactor under this seal.
