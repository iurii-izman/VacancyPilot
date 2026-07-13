# EPIC-03: Local Tracker And Status History

## Goal

Allow the user to save vacancies locally, update statuses, and preserve a clear event/status history.

## Scope

- Save/update job.
- Status lifecycle.
- Status history.
- Event log.
- Passive HH visible status sync data model.
- Basic tracker queries.

## Non-Goals

- No auto-status mutation from hidden HH requests.
- No HR chat reading.
- No n8n notifications yet.

## Acceptance Criteria

- User can save/update a job locally.
- Status transitions create history entries.
- Passive HH status requires user confirmation before changing local status.
- Tracker works without AI and without network.

## Safety Notes

The extension can track what the user did, but must not perform the HH action for the user.
