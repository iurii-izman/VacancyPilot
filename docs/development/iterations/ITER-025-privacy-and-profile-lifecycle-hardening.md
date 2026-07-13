# ITER-025: Privacy And Profile Lifecycle Hardening

Epic: EPIC-13
Commit: `fix: close privacy gap and clean profile lifecycle refs`

## Goal

Close the confirmed cover-letter privacy gap and prevent profile/resume deletion from leaving broken references behind.

## Scope

- apply `strictPrivacyMode` and `allowResumeHighlightsToAI` rules to cover-letter payload building;
- add tests for cover-letter privacy gates;
- clean orphan references when deleting profiles or resumes across:
  - jobs
  - cover letters
  - related local settings/default pointers where applicable;
- add salary input guard so invalid values do not become `NaN`.

## Non-Goals

- no parser hardening;
- no generated-manifest audit yet;
- no localization pass;
- no n8n work.

## Acceptance Criteria

- cover-letter input excludes resume highlights when privacy settings require it;
- profile/resume deletion does not leave broken local references behind;
- invalid salary input cannot persist as `NaN`;
- focused tests cover privacy gates and lifecycle cleanup.

## Validation

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
