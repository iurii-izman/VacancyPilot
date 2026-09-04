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
  if (!url) return null;
  const match = url.match(/^https:\/\/(?:hh\.ru|[a-z0-9-]+\.hh\.ru)\/vacancy\/(\d+)(?:[/?#]|$)/i);
  return match?.[1] ?? null;
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
