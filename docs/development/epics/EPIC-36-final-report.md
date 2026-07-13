# EPIC-36 Final Report: Runtime Visual Consistency

Status: **Complete**
Date: 2026-06-22
Input: `docs/vacancypilot_runtime_visual_consistency_audit_2026-06-21.md`

## Summary

EPIC-36 addressed P0 and P1 findings from the 2026-06-21 runtime UX audit. Four iterations delivered targeted fixes to popup shell stability, badge behavior, About/Onboarding role separation, dashboard shell consolidation, forms/empty-states readability, and disabled-state contrast.

## What Changed

### ITER-072 — Popup Shell And Badge Finalization
- Popup shell stabilized with `minWidth: 300`, `maxWidth: 360`, `minHeight: 360`, `maxHeight: 600`, and owned vertical scrolling
- Badge placement and interaction behavior refined
- Popup no longer opens as an extremely small/collapsed window

### ITER-073 — Onboarding And About Role Separation
- **AboutSection** reduced to compact product identity: tagline, status, stack, TrustSafetySummary (compact)
- **OnboardingSection** restructured as step-oriented wizard with expandable steps, status chips, and completion flow
- **TrustSafetySummary** extracted as shared reusable component with `compact`/`full` levels
- Duplicated long-form safety blocks eliminated; safety posture preserved

### ITER-074 — Dashboard Shell Consolidation
- **Breakpoints**: ≥1000px full (200px), 760-999px compact icons-only (56px), <760px collapsible
- **Scroll**: sidebar header fixed, only `<ul>` scrolls; main content owns primary scroll
- **Tooltips**: `title` attribute removed in full-label mode; `aria-label` always present
- **Navigation groups**: Work, Profile, System, Advanced — visual dividers in compact mode, labels in full mode

### ITER-075 — Runtime Forms, Empty States, And Final Report
- **EmptyState**: `maxWidth: 360, minWidth: 200, margin: 48px auto, lineHeight: 1.5`
- **Disabled states**: Replaced `opacity: 0.4` on parent containers in AISettingsSection and Labs with explicit muted text colors (`colors.textFaint`)
- **Forms**: `minWidth: 0` on inputs in ProfileManager and ResumeManager; textarea `minHeight: 96px`
- **`src/styles/forms.ts`**: Shared form layout helpers for future use

## Before / After Decisions

| Finding | Before | After | Rationale |
|---|---|---|---|
| P0-01 Popup size | Collapsed/mini window possible | Fixed 320×480 with min/max constraints | First impression must be deliberate |
| P0-02 About vs Onboarding | Two long pages with duplicated safety text | Compact About + step-wizard Onboarding + shared TrustSafetySummary | One source of truth for safety messaging |
| P0-03 Triple scrollbars | Sidebar `overflow:auto` + main `overflow:auto` | Sidebar header fixed, only nav `<ul>` scrolls; main is primary scroll | Single scroll ownership |
| P0-04 Breakpoints too late | Labels visible ≥900px, sidebar 140-180px wide | Labels visible ≥1000px, sidebar 56px otherwise | ~50-60% width savings for extension-sized windows |
| P0-05 Native tooltips | `title` on every sidebar button | `title` only in compact mode; `aria-label` always | No awkward browser tooltips over full-label sidebar |
| P0-06 Text density | Long onboarding document | Step wizard with collapsed-by-default content | Readable above the fold |
| P1-01 Empty states narrow | No min-width, flat margins | 200-360px range, 48px vertical margin, line-height 1.5 | Prevents cramped stacks |
| P1-02 Disabled contrast | `opacity: 0.4` on parent containers | Explicit muted colors (`textFaint`, `textVeryFaint`) | Labels remain readable |
| P1-03 Form responsiveness | No `minWidth:0` on inputs | `minWidth:0` added; textarea `minHeight:96` | Prevents flex overflow, improves narrow layouts |
| P1-05 Emoji icons | Sidebar uses emoji | Deferred — acceptable for private alpha | Low ROI before public release |
| P1-06 Inline styles | Heavy one-off inline styles | `src/styles/forms.ts` created; not a full rewrite | Pragmatic step without broad refactor |

## Files Changed (cumulative EPIC-36)

| File | Iteration |
|---|---|
| `entrypoints/popup/App.tsx` | ITER-072 |
| `entrypoints/popup/index.html` | ITER-072 |
| `entrypoints/popup/interaction-states.test.ts` | ITER-072 |
| `entrypoints/vacancy.content.ts` | ITER-072 |
| `src/release-safety/vacancy-badge-surface.test.ts` | ITER-072 |
| `src/components/TrustSafetySummary.tsx` | ITER-073 (new) |
| `src/components/TrustSafetySummary.test.tsx` | ITER-073 (new) |
| `src/components/AboutSection.tsx` | ITER-073 |
| `src/components/AboutSection.test.tsx` | ITER-073 |
| `src/components/OnboardingSection.tsx` | ITER-073 |
| `src/components/OnboardingSection.test.tsx` | ITER-073 |
| `entrypoints/options/App.tsx` | ITER-074, ITER-075 |
| `src/components/EmptyState.tsx` | ITER-075 |
| `src/components/AISettingsSection.tsx` | ITER-075 |
| `src/components/ProfileManager.tsx` | ITER-075 |
| `src/components/ResumeManager.tsx` | ITER-075 |
| `src/styles/forms.ts` | ITER-075 (new) |

## Validation Results

| Iteration | typecheck | lint | test | build | test:release |
|---|---|---|---|---|---|
| ITER-072 | ✅ | ✅ | ✅ | ✅ | ✅ |
| ITER-073 | ✅ | ✅ | ✅ | ✅ | ✅ |
| ITER-074 | ✅ | ✅ | ✅ | ✅ | ✅ |
| ITER-075 | ✅ | ✅ | ✅ (1615 tests) | ✅ | ✅ (373 release-safety tests) |

## Manual QA Checklist

These items require live browser verification — they cannot be validated by automated tests alone.

### Width breakpoints (P0-04)
- [ ] Window at 500px: sidebar is compact (56px), content readable
- [ ] Window at 760px: sidebar compact (56px), content readable
- [ ] Window at 1000px: sidebar full (200px) with labels and group headers
- [ ] Window at 1200px: sidebar full, no layout issues

### Scroll ownership (P0-03)
- [ ] No triple vertical scrollbars visible at any width
- [ ] Sidebar header stays fixed while nav list scrolls (when many items)
- [ ] Main content scrolls independently

### About page
- [ ] Reads in under 30 seconds
- [ ] Product identity, status, stack visible
- [ ] TrustSafetySummary (compact) visible with green/red lists

### Onboarding wizard
- [ ] Step 1 (Safety & Trust) expanded by default
- [ ] Steps expand/collapse on click
- [ ] "Done" chip appears when step is collapsed
- [ ] Optional steps show "Optional" chip
- [ ] "Got it — Start Using VacancyPilot" button completes onboarding

### Disabled states (P1-02)
- [ ] AI disabled: provider/model/key sections show muted text (not washed out)
- [ ] Labs disabled: guided apply row text is muted (not invisible)
- [ ] Toggle buttons show subtle opacity only on the control itself

### Empty states (P1-01)
- [ ] Applications, Companies, Letters, Events empty states centered with good spacing
- [ ] Empty states do not collapse into cramped stacks at narrow widths

### Forms (P1-03)
- [ ] Profile form inputs stay within bounds at narrow widths
- [ ] Resume form textarea has adequate height
- [ ] Two-column form rows wrap to single column naturally

## Remaining UX Debt

These items are explicitly deferred from EPIC-36 and should be addressed in future passes:

| ID | Item | Severity | Notes |
|---|---|---|---|
| P1-04 | Badge placement modes | Medium | Top-right, bottom-right, hidden settings. Current badge position is acceptable. |
| P1-05 | Emoji icons | Low/Medium | Replace with inline SVG or lucide icons for professional polish. Acceptable in private alpha. |
| P1-06 | Inline style reduction | Medium | `src/styles/forms.ts` is a start. More shared styles needed for cards, warnings, tables. |
| — | Kanban horizontal scroll | Low | Only horizontal scrolling allowed for Kanban; already handled. |
| — | Sidebar collapsed state | Low | Narrow-mode toggle works; could add an overlay/drawer pattern in future. |
| — | Responsive navigation at <500px | Low | Acceptable for now; extreme narrow widths are edge cases. |

## Conclusion

EPIC-36 successfully transformed the runtime UI from a working private alpha into a more deliberate, visually consistent product surface. The four iterations addressed all P0 and key P1 findings without expanding product scope, changing permissions, or breaking the existing automated validation pack.

The remaining UX debt is documented above and does not block the current development phase. The next active pack (EPIC-35) should reference this report for any runtime/UI defects confirmed by manual QA.
