# Manual QA Run — 2026-06-20

Source: user-reported Chrome + Edge run on build `a602b81`

## Meta

- Tester: `Izman`
- Browsers: `Chrome`, `Edge`
- Build: `a602b81`
- Result: partial pass, core runtime blockers found

## Summary

What passed:

- extension install in Chrome;
- second-browser install in Edge;
- vacancy page detection in popup;
- dashboard opens from popup.

What failed:

- vacancy badge is present but empty/non-interactive;
- popup buttons `Save`, `Reject`, `Side Panel` do not work as expected;
- `Score` and `Status` remain placeholders;
- core save/status flow is not usable in real browser runtime.

## Structured Findings

### Passed

- `setup-install`
- `setup-second-browser`
- `hh-login-states`

### Failed

- `setup-badge-sidepanel`
  - badge shows no useful state;
  - badge does not react to clicks.

- `hh-fields`
  - popup buttons `Save`, `Reject`, `Side Panel` do not work;
  - `Dashboard` button works and opens the extension dashboard/options page.

- `core-save`
  - save flow not working.

- `core-status`
  - status flow not working.

### Not Yet Covered / Deferred In This Run

- scoring verification;
- archived/applied page states;
- AI payload/preview checks;
- AI cache behavior;
- letter studio flow;
- export/delete flow;
- labs checks;
- safety boundary spot-checks beyond observed runtime behavior.

## Implications

This run confirms that Phase 1 has reached the "runtime completion" stage:

- core modules exist in the codebase;
- automated safety checks pass;
- installed-extension workflow is not yet fully wired end-to-end.

These findings are the basis for `EPIC-11: Runtime Workflow Completion`.

---

## ITER-021 Rerun Analysis — 2026-06-20

Build: `c547273` + ITER-021 fixes
Analysis: code review + automated validation (no live browser rerun yet)

### Previously Failed → Status After ITER-017..020

| Check | Original Result | Current Status | Evidence |
| --- | --- | --- | --- |
| `setup-badge-sidepanel` | FAIL (badge empty, non-interactive) | LIKELY FIXED | persistBadgeState + updateBadge + restoreBadgeState wired in ITER-017/020 |
| `hh-fields` (Save/Reject) | FAIL (buttons not working) | LIKELY FIXED | handleSave/handleReject with EXTRACT_VACANCY → tracker flow in ITER-017 |
| `core-save` | FAIL (save flow not working) | LIKELY FIXED | tracker.saveFromDTO + computeAndStoreScore in ITER-017 |
| `core-status` | FAIL (status flow not working) | LIKELY FIXED | tracker.updateStatus + statusHistory in ITER-017 |

### ITER-021 Fix Applied

- **Match pattern gap**: content script `matches` now covers both `https://hh.ru/vacancy/*` and `https://*.hh.ru/vacancy/*`. Previously only `*.hh.ru` was covered, which could cause Save/Reject failures on the bare `hh.ru` domain. `PageStatus.isVacancyUrl` already handled both, creating an inconsistency.

### Validation (automated)

```
pnpm typecheck → pass
pnpm lint     → pass
pnpm test     → 507 passed, 0 failed
pnpm build    → success (manifest now has both match patterns)
```

### Residual Risks for Manual Rerun

1. **Live browser confirmation needed**: all "LIKELY FIXED" items above need a real Chrome/Edge rerun to confirm.
2. **Profile requirement**: scoring requires at least one profile. Without a profile, score shows `—`. This is by design (ITER-019), but QA should verify the UX is clear.
3. **Side panel auto-refresh**: relies on `chrome.storage.onChanged` listening for `badge_v1_hh_*` keys. Should be verified in real browser.
4. **Dashboard refresh**: `VacancySection` loads jobs on mount. If the user saves from popup and then opens dashboard, verify the saved vacancy appears. May need a manual refresh if dashboard was already open.
5. **Not yet covered** (deferred, same as original run): scoring verification on diverse vacancies, archived/applied page states, AI payload/preview, AI cache, letter studio, export/delete, labs, safety boundary spot-checks.

### Recommended Rerun Steps

1. Load unpacked extension from `.output/chrome-mv3` in Chrome.
2. Open an HH.ru vacancy page (with subdomain, e.g., `spb.hh.ru`).
3. Confirm badge appears (VP placeholder is OK if never saved).
4. Click extension icon → popup shows "Vacancy page detected".
5. Click Save → confirm score/status update in popup and badge.
6. Click Side Panel → confirm Overview tab shows saved vacancy with score.
7. Click Reject from popup → confirm status changes to "Rejected" everywhere.
8. Open Dashboard → confirm saved/rejected vacancy appears in the table.
9. Repeat on `hh.ru` (without subdomain, if accessible) to verify match pattern fix.
10. Repeat in Edge if second-browser scope applies.

---

## Phase 1 Closeout Rerun — 2026-06-20

Source: user-reported follow-up Chrome + Edge rerun on current `main` after `ITER-032` review

## Meta

- Tester: `Izman`
- Browsers: `Chrome`, `Edge`
- Build basis: current `main` as of 2026-06-20
- Result: pass for current Phase 1 core scope

## Summary

The follow-up manual rerun for the current Phase 1 core scope was reported as successful in both Chrome and Edge. No new runtime blockers were reported.

Confirmed at closeout level:

- extension loads in Chrome and Edge;
- vacancy page detection works;
- badge is present and usable in the current core flow;
- popup actions behave correctly in the current core flow;
- save/reject flow works;
- side panel opens and participates in the core flow;
- dashboard path works for the saved vacancy flow;
- no new blocker was found that would justify holding `ITER-033`.

## Scope Note

This closeout rerun is sufficient for the Phase 1 private-RC gate and for opening Phase 2 implementation.

It does **not** mean that the entire wider regression/public-release matrix in `release-checklist.md` has been exhaustively re-run item by item.
