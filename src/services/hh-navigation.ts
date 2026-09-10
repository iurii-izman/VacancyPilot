import { canonicalizeHhVacancyUrl } from "./hh-vacancy-url";

/** Return only the canonical HH URL that a user explicitly asked to open. */
export function getHhVacancyNavigationUrl(value: unknown): string | null {
  return typeof value === "string" ? canonicalizeHhVacancyUrl(value) : null;
}

/** Open a canonical HH vacancy in a user-initiated browser action. */
export function openHhVacancy(value: unknown): boolean {
  const url = getHhVacancyNavigationUrl(value);
  if (!url || typeof window === "undefined") return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
