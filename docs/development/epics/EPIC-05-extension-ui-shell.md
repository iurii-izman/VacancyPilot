# EPIC-05: Extension UI Shell

## Goal

Create the user-facing workspace: popup, side panel, dashboard/options shell, and content badge.

## Scope

- Popup state.
- Side panel tabs.
- Dashboard shell.
- Content badge via Shadow DOM.
- Loading/empty/error states.
- Error boundaries.
- Accessibility baseline.

## Non-Goals

- No heavy React UI inside HH cards.
- No search badges yet.
- No auto-open behavior unless explicitly configured.

## Acceptance Criteria

- UI does not break HH page layout.
- Side panel opens only from user action or explicit setting.
- Error boundaries prevent UI crashes from affecting HH.
- Keyboard navigation works for core controls.

## Safety Notes

The content script UI must remain minimal. Main UI belongs in side panel/dashboard.
