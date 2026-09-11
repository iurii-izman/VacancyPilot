import type { RawSearchItemDTO } from "@/adapters/types";
import {
  canonicalizeHhVacancyUrl,
  extractHhVacancyIdFromHref,
} from "./hh-vacancy-url";

const VACANCY_LINK_SELECTOR =
  'a[href*="/vacancy/"], a[href*="%2Fvacancy%2F"], a[href*="%2fvacancy%2f"]';

const LEGACY_CARD_SELECTOR =
  '[data-qa="vacancy-serp-item"], .serp-item, [data-qa="vacancy-serp"], div.vacancy-serp-item';

const BLOCK_CONTAINER_TAGS = new Set([
  "ARTICLE",
  "SECTION",
  "DIV",
  "LI",
  "MAIN",
]);

const INLINE_WRAPPER_TAGS = new Set([
  "A",
  "SPAN",
  "B",
  "I",
  "STRONG",
  "EM",
  "SMALL",
  "SVG",
  "PATH",
  "IMG",
]);

export interface DiscoveredSearchCard {
  vacancyId: string;
  link: HTMLAnchorElement;
  cardElement: Element;
}

export function extractVacancyIdFromHref(
  href: string | null | undefined,
  baseUrl = "https://hh.ru",
): string | null {
  return extractHhVacancyIdFromHref(href, baseUrl);
}

export function discoverSearchCardsFromLinks(
  doc: Document,
): DiscoveredSearchCard[] {
  const links = findVacancyLinks(doc);
  const seen = new Set<string>();
  const discovered: DiscoveredSearchCard[] = [];

  for (const link of links) {
    const vacancyId = extractVacancyIdFromHref(link.getAttribute("href"));
    if (!vacancyId || seen.has(vacancyId)) continue;

    const cardElement = findCardElementForLink(doc, link);
    if (!cardElement) continue;

    seen.add(vacancyId);
    discovered.push({ vacancyId, link, cardElement });
  }

  return discovered;
}

export function createFallbackSearchCardDTO(
  discovered: DiscoveredSearchCard,
): RawSearchItemDTO {
  return {
    sourceId: discovered.vacancyId,
    title: normalizeText(discovered.link.textContent),
    companyName: null,
    url: resolveLinkHref(discovered.link),
    salaryRaw: null,
    city: null,
    experienceRaw: null,
    workMode: "unknown",
    publicationDate: null,
  };
}

export function scoreSearchCardCandidate(
  element: Element,
  link: HTMLAnchorElement,
): number {
  if (!isUsableCardCandidate(element, link)) return Number.NEGATIVE_INFINITY;

  const rect = safeRect(element);
  const text = normalizeText(element.textContent) ?? "";
  const uniqueVacancyIds = countUniqueVacancyIds(element);
  const hasLayoutSize = rect.width > 0 || rect.height > 0;
  let score = 0;

  if (BLOCK_CONTAINER_TAGS.has(element.tagName)) score += 35;
  if (text.length >= 20) score += 20;
  if (text.length >= 60) score += 10;
  if (uniqueVacancyIds <= 1) score += 25;
  if (hasLayoutSize) {
    if (rect.width > 250) score += 25;
    if (rect.height > 60) score += 25;
    if (rect.width <= 180 || rect.height <= 30) score -= 40;
  } else {
    score += 15;
  }

  return score;
}

function findVacancyLinks(doc: Document): HTMLAnchorElement[] {
  const links = new Set<HTMLAnchorElement>();

  try {
    for (const link of Array.from(
      doc.querySelectorAll<HTMLAnchorElement>(VACANCY_LINK_SELECTOR),
    )) {
      links.add(link);
    }
  } catch {
    // Fall back below.
  }

  if (links.size === 0) {
    for (const link of Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
      if (extractVacancyIdFromHref(link.getAttribute("href"))) {
        links.add(link);
      }
    }
  }

  return Array.from(links);
}

function findCardElementForLink(
  doc: Document,
  link: HTMLAnchorElement,
): Element | null {
  const legacy = link.closest(LEGACY_CARD_SELECTOR);
  if (legacy && isUsableCardCandidate(legacy, link)) {
    return legacy;
  }

  let best: Element | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let current = link.parentElement;

  for (let depth = 0; current && depth < 8; depth += 1) {
    if (current === doc.body || current === doc.documentElement) break;

    const score = scoreSearchCardCandidate(current, link) - depth * 2;
    if (score > bestScore) {
      best = current;
      bestScore = score;
    }

    current = current.parentElement;
  }

  return bestScore > 0 ? best : null;
}

function isUsableCardCandidate(
  element: Element,
  link: HTMLAnchorElement,
): boolean {
  const owner = element.ownerDocument;
  if (
    element === owner.body ||
    element === owner.documentElement ||
    INLINE_WRAPPER_TAGS.has(element.tagName) ||
    !element.contains(link)
  ) {
    return false;
  }

  const text = normalizeText(element.textContent);
  if (!text) return false;

  const uniqueVacancyIds = countUniqueVacancyIds(element);
  if (uniqueVacancyIds > 1 && !element.matches(LEGACY_CARD_SELECTOR)) {
    return false;
  }

  const rect = safeRect(element);
  const hasLayoutSize = rect.width > 0 || rect.height > 0;
  if (hasLayoutSize && (rect.width <= 180 || rect.height <= 30)) {
    return false;
  }

  return true;
}

function countUniqueVacancyIds(element: Element): number {
  const ids = new Set<string>();
  const links = Array.from(element.querySelectorAll<HTMLAnchorElement>("a[href]"));

  for (const link of links) {
    const vacancyId = extractVacancyIdFromHref(link.getAttribute("href"));
    if (vacancyId) ids.add(vacancyId);
    if (ids.size > 1) break;
  }

  return ids.size;
}

function resolveLinkHref(link: HTMLAnchorElement): string | null {
  const href = link.getAttribute("href");
  if (!href) return null;

  return canonicalizeHhVacancyUrl(
    href,
    link.ownerDocument.URL || "https://hh.ru",
  );
}

function safeRect(element: Element): DOMRect {
  try {
    return element.getBoundingClientRect();
  } catch {
    return {
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  }
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}
