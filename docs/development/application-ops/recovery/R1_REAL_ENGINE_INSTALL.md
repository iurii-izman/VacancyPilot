# R1 Real Engine Install

Date: 2026-08-30. Branch: `chore/recovery-tooling-hygiene`.

## Source

- Private repo: `C:/Dev/workoutreachHH` (HEAD `d9b6853`, branch `main`, no remote — none invented)
- Authoritative package: `dist/release-v4/JOB_SEARCH_APPLICATION_ENGINE_V4.zip`
- Package zip SHA-256: `dbdbe8f648fc48479f98f3f7284b546f5efffaf5f1b23dc8eb8c013dee738fe3`
  (matches `dist/JOB_SEARCH_APPLICATION_ENGINE_V4.zip.sha256` and the private
  `ACTIVE_SOURCE_MANIFEST_V4.md` per-file hashes — all 11 verified)

## Loader defect found and fixed (AOPS-07)

The AOPS-07 loader was built against the synthetic fixture format and could
not load the authoritative V4 package (39 validation errors). Proven gaps:

1. Real V4 files use a document-level frontmatter block
   (`document_id` / `content_version` / `status`), not `engine_id`/`engine_version`.
2. Per-entry metadata lives in fenced ```yaml blocks in the body
   (119 claims / 15 cases / 20 portfolio), not in frontmatter collections.
3. Per-file content versions differ from the engine version (e.g. claims
   3.7.0 inside engine 4.0.0) — the loader required equality.

Fixes (additive, synthetic-fixture compatible, strictness preserved):

- `DocumentFrontmatter` model; leading `---` block validated per file
  (body horizontal rules are not mistaken for frontmatter).
- Fenced ```yaml entry parsing with required machine IDs and 64-char limit;
  policy-map blocks (evidence legend, `score_caps`, `decision_bands`, ...)
  recognised as valid non-entry blocks.
- Per-file versions allowed; version presence still mandatory.
- `KnowledgeIndex` extended: real-format claims (with canonical strength→
  evidence-level mapping: A_DIRECT→E4, A_PROJECT_VALIDATED/B_PROJECT_IMPLEMENTED→E3,
  C/D→E2, TRANSFERABLE_INFERENCE→P1, X_SUPERSEDED excluded; certificate origin
  capped below E4), cases, portfolio boundaries from `shareability`,
  target profiles, `SCORING_CAPS_V4` caps (13), `automatic_hard_fails` gates (6),
  voice gold examples, skill calibration groups.

## Install

- Installer: existing AOPS-07 `vacancypilot-engine` CLI (`app.engine.cli`),
  atomic install into `companion/data/engine/current` (configured ignored
  runtime path, `.gitignore:71`).
- Install: `Status: installed, Valid: True, Engine version: 4.0.0,
  Active files: 10`
- Verify: `Status: already_current, Valid: True` — PASS
- Aggregate hash: `3cfc6d4c2199aa3b8d175014de08cb74bffb8dcacb1517447c915166af7e2c9d`

## Index smoke (real package)

claims=119 (E4:39, E3:70, E2:5, P1:5), cases=15, portfolio=20,
targeting_rules=14, caps=13, hard_gates=6, voice=15, skills=108.

## Privacy

- `git status` shows zero private payload files; runtime package is ignored.
- Private workspace backed up: `recovery-backups/20260830-182526/workoutreachHH/`
  (HEAD, status, package hash, full `git bundle --all`).
- This report contains no private content.
