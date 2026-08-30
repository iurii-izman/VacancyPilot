# R1 Recovery Backup Manifest

Created: 2026-08-30 18:25 local.
Backup root: `C:/Dev/VacancyPilot-recovery-backups/20260830-182526/`

## Contents

For each dirty worktree (`elastic-mcclintock-030fcc`, `great-spence-0fa731`,
`quizzical-haibt-c77dcd`):

- `head.txt` — HEAD SHA
- `branch.txt` — branch name
- `status.txt` — `git status --short`
- `diff.patch` — `git diff --binary`
- `diff-staged.patch` — `git diff --cached --binary` (all empty — nothing staged)
- `untracked-files.txt` — `git ls-files --others --exclude-standard`
- `untracked/` — physical copy of every untracked file, relative paths preserved

Plus:

- `great-spence-0fa731-full-backup.zip` — full archive of the recovery worktree
- `SHA256SUMS.txt` — SHA-256 of patches and zip

## SHA-256

```
dd3aa54e78b7fb2aa6c0c331022ddc1885add85be8bea7f3a838a1393e83e62e  great-spence-0fa731-full-backup.zip
360b5e85aa145a334c53a999308516ca203fb5eacea1c3320e879a12b5119370  elastic-mcclintock-030fcc/diff.patch
0083008f12b66f922db100433e134be4e39fda318b2e167409967ce3f1999922  great-spence-0fa731/diff.patch
3c33d99a58726d2d0293848933f6a180850a719125711df9a98de6433861b7e8  quizzical-haibt-c77dcd/diff.patch
```

## Guarantee

After Phase 0, no uncommitted source file exists in only one copy: every
modified file is captured in `diff.patch`, every untracked file is physically
copied under `untracked/`, and the recovery worktree is additionally archived
as a zip.
