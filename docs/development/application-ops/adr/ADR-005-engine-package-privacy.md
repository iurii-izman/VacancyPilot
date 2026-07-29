# ADR-005: Application Engine V4 Package Privacy

Status: ACCEPTED
Date: 2026-07-29
Epic: AOPS-00

## Context

Application Engine V4 is an existing versioned local knowledge/package
workspace with supporting Python validation tooling. It contains private
candidate facts: skill claims, commercial cases, portfolio entries, skill
calibrations, and candidate scoring rules.

The VacancyPilot repository is public or may become public. Committing
real candidate facts would expose personal data.

## Decision

**Real V4 candidate knowledge is not committed to this repository.**
The repository contains only:

1. **Loader/runtime code** — Python modules that import, validate, and
   execute the engine package (AOPS-07)
2. **Manifest schema** — the expected structure of the engine package
   (files, hashes, metadata)
3. **Synthetic test fixtures** — fake candidate facts with the same shape
   as real data but no real personal information
4. **Installer/import tooling** — CLI command that accepts a local source
   path, validates the package, and installs it into the companion's data
   directory
5. **`.gitignore` rules** — patterns that exclude real engine packages
   from version control

The real package is installed locally from a user-approved canonical
artifact (local directory path or private archive). An explicit
private-repository decision is required before vendoring facts.

## Consequences

### Positive
- No personal candidate data in version control
- Repository remains safe for public visibility
- Synthetic fixtures enable full test coverage without real data
- Installer provides clear UX for package setup

### Negative
- Tests use synthetic data, not real facts — may miss edge cases in
  real candidate claims
- Requires a separate installation step before first use
- Engine validation must distinguish "valid structure with synthetic
  data" from "valid structure with real data" for safety checks

### Neutral
- Engine runtime code is committed and reviewable; only facts are
  external

## Rejected Options

### Option A: Commit real engine package
Exposes personal candidate data. Violates privacy constraint. Rejected.

### Option B: No engine tests at all
Would leave the most complex component untested. Rejected.

### Option C: Encrypt facts in repository
Adds key management complexity. Doesn't truly protect data if keys are
also in the repo or shared. Rejected as security theater.
