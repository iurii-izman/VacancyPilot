# Side Panel / Popup Overlap Report

**Date:** 2026-06-22
**Branch:** `fix/ai-and-sidepanel-runtime-ux`

## Problem

When the Chrome side panel is already open, clicking the VacancyPilot toolbar icon in popup mode opens the browser-controlled action popup over the side panel. The popup is anchored to the toolbar icon, cannot be dragged by extension code, and forces the user to work with overlapping UI surfaces.

## Browser constraints

Based on the official Chrome Extensions documentation:

1. Extension popup is anchored to the toolbar icon and cannot be moved by extension code.
2. `chrome.sidePanel.open()` must be called from an extension user action / user gesture.
3. `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` allows the toolbar action click to open the side panel instead of relying on popup-first flow.
4. `chrome.sidePanel.getLayout()` is available in newer Chrome versions (Chrome 140+) to read whether the panel is on the left or right.
5. Chrome documentation exposes `getLayout()` for reading layout, but no reliable `setLayout()` workflow is used here. VacancyPilot does not fake a left/right setting.

Official references:

- [chrome.sidePanel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Create a side panel](https://developer.chrome.com/docs/extensions/develop/ui/create-a-side-panel)
- [Chrome extensions: what's new](https://developer.chrome.com/docs/extensions/whats-new)

## Chosen solution

VacancyPilot now treats the side panel as the primary full workspace without pretending the popup can become draggable.

Implemented changes:

- Added a user setting: `toolbarClickBehavior: "popup" | "sidePanel"`.
- Added a user setting: `closePopupAfterOpeningSidePanel: boolean` with default `true`.
- Added `src/services/toolbar-behavior.ts` to centralize:
  - toolbar action behavior application;
  - popup restore path lookup from the runtime manifest;
  - side panel layout detection.
- In `sidePanel` mode:
  - `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
  - `chrome.action.setPopup({ popup: "" })`
- In `popup` mode:
  - restores the popup from `chrome.runtime.getManifest().action.default_popup`
  - `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })`
- Popup `Side Panel` action now closes the popup only after a successful `chrome.sidePanel.open(...)` call.
- Popup now explicitly tells the user to continue in the side panel for the full workspace and explains that Chrome controls popup positioning.

## Settings added

- `general.toolbarClickBehavior`
  - `popup` (default)
  - `sidePanel`
- `general.closePopupAfterOpeningSidePanel`
  - default: `true`

Permissions UI now also shows:

- toolbar icon behavior controls;
- close-popup toggle;
- detected side panel side when Chrome reports it.

## Manual QA

| Case | Result | Notes |
|---|---|---|
| Popup opens normally in popup mode | Not run manually | Covered by toolbar behavior tests and existing popup surface |
| Side Panel button opens panel and closes popup | Not run manually | Covered by popup unit tests |
| Error opening side panel keeps popup visible | Not run manually | Covered by popup unit tests |
| Toolbar sidePanel mode | Not run manually | Covered by `toolbar-behavior` unit tests |
| Toolbar popup mode | Not run manually | Covered by `toolbar-behavior` unit tests |
| Chrome side panel layout detected | Not run manually | Covered by service tests with mocked `getLayout()` |

## Remaining limitations

- VacancyPilot still cannot move or drag the Chrome action popup, because Chrome owns that surface.
- VacancyPilot does not force the side panel to the left. It only reports layout when Chrome exposes it.
- Real browser validation for `setPanelBehavior()` and runtime popup switching still requires manual Chrome QA on the target profile.
