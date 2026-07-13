# EPIC-07: Cover Letter Studio

## Goal

Make cover letter generation, editing, saving, and copying a strong Core feature without touching HH form fields.

## Scope

- Letter modes.
- Constraints: no emoji, no markdown, max chars.
- Draft/final versions.
- Edit and save.
- Copy workflow.
- Optional streaming generation.
- Letter validation.

## Non-Goals

- No writing into HH form fields.
- No clicking HH apply buttons.
- No letter spam queue.

## Acceptance Criteria

- User can generate or write a draft.
- User can edit and save final text.
- User can copy text manually.
- Constraints are enforced or clearly warned.
- Final letters are linked to job/profile/resume.

## Safety Notes

The product prepares text; the user reviews, copies, pastes, and submits manually.
