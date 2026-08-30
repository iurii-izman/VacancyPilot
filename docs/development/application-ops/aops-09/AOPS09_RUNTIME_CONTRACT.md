# AOPS-09 Runtime Contract

## Lifecycle

`GENERATED → EDITED* → FINAL → SENT`

- **GENERATED** records engine run, origin/provider, prompt version, immutable
  body snapshot, and creation time.
- **EDITED** is append-only and never changes the generated snapshot.
- **FINAL** is an explicit user confirmation and requires deterministic local
  QA success.
- **SENT** is created only by the explicit "Save as actually sent" command.
  Copying text or marking an application applied does not create it. A sent
  snapshot is immutable; a later correction is a new version, never an update.

## Manual bridge

The bridge is copy/paste only:

`VacancyPilot → copy request → user uses ChatGPT Project → user pastes response → local import/validation`

The request includes a stable bridge ID, vacancy identity/hash, vacancy text,
expected V4 format and import instructions. It excludes keys, keyring data,
private package paths and private candidate content. An import is user-provided
content, has `source=manual_chatgpt`, and cannot overwrite engine score or
evidence.

## Validation and diff

- Generated/imported/final letter validation is deterministic.
- Invalid imports are `IMPORT_INVALID` and cannot become final.
- Diff uses deterministic text comparison and stores generated/sent word
  counts, added/removed word counts, edit ratio, opening/closing changes, and
  a structured unified diff.

## Safety

No API key enters bridge text. No operation writes to HH, submits an
application, or infers sent state from clipboard activity.
