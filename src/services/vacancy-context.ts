import { extractHhVacancyIdFromUrl } from "./hh-vacancy-url";

export type VacancyPageKind = "vacancy";

export interface VacancyContext {
  tabId: number;
  windowId: number;
  vacancyId: string;
  pageKind: VacancyPageKind;
  timestamp: number;
}

export const VACANCY_CONTEXT_MAX_AGE_MS = 15_000;

export function extractVacancyIdFromUrl(url: string | undefined): string | null {
  return extractHhVacancyIdFromUrl(url);
}

export function isFreshVacancyContext(
  context: VacancyContext,
  now = Date.now(),
): boolean {
  return (
    context.tabId > 0 &&
    context.windowId > 0 &&
    Boolean(context.vacancyId) &&
    context.pageKind === "vacancy" &&
    now - context.timestamp >= 0 &&
    now - context.timestamp <= VACANCY_CONTEXT_MAX_AGE_MS
  );
}

export function contextStorageKey(tabId: number): string {
  return `vp_context_tab_${tabId}`;
}

/**
 * The side panel itself does not have a tab sender. Keep the exact tab that
 * opened it, scoped by browser window, so a worker restart cannot turn one
 * tab's vacancy into another tab's context.
 */
export function sidePanelBindingStorageKey(windowId: number): string {
  return `vp_side_panel_binding_window_${windowId}`;
}

export function contextMatchesTab(
  context: VacancyContext | undefined,
  tabId: number,
  windowId: number,
  now = Date.now(),
): context is VacancyContext {
  return Boolean(
    context &&
      context.tabId === tabId &&
      context.windowId === windowId &&
      isFreshVacancyContext(context, now),
  );
}
