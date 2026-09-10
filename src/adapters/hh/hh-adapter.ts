// --- HHAdapter — safe, read-only parser ---
// Phase 0–1: vacancy page extraction.
// Phase 2: search card extraction (extractSearchList).
// Phase 5: HR timeline extraction (extractHrTimeline).
// Uses versioned selectors with graceful degradation.
// Never makes network requests, never modifies the page.

import type {
  SiteAdapter,
  PageKind,
  RawSearchItemDTO,
  ApplicationStatusSync,
} from "../types";
import type { RawVacancyDTO, ParserWarning } from "./types";
import type { RawHrTimelineDTO } from "@/models/hr-timeline";
import { SELECTORS_V1, SELECTOR_VERSION } from "./selectors-v1";
import { SEARCH_SELECTORS_V1 } from "./search-selectors-v1";
import { HR_SELECTORS } from "./hr-selectors";
import { classifyHrReply } from "@/services/hr-classification";
import {
  canonicalizeHhVacancyUrl,
  extractHhVacancyIdFromHref,
  extractHhVacancyIdFromUrl,
  isSupportedHhPageUrl,
} from "@/services/hh-vacancy-url";

export class HHAdapter implements SiteAdapter {
  readonly siteId = "hh" as const;

  // ── URL matching ──────────────────────────────────────────────

  matchUrl(url: string): PageKind {
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        parsed.port ||
        !isSupportedHhPageUrl(parsed.href)
      ) {
        return null;
      }

      const path = parsed.pathname;

      if (extractHhVacancyIdFromUrl(parsed.href)) return "vacancy";
      if (/^\/search\/vacancy\/?$/i.test(path)) return "search";
      if (/^\/applicant\/responses/i.test(path)) return "applications";
      if (/^\/applicant\/resumes/i.test(path)) return "applications";
      if (/^\/negotiations/i.test(path)) return "messages";

      return null;
    } catch {
      return null;
    }
  }

  // ── Vacancy extraction ────────────────────────────────────────

  extractVacancy(doc: Document): RawVacancyDTO | null {
    const warnings: ParserWarning[] = [];
    const now = new Date().toISOString();
    const sourceUrl = canonicalizeHhVacancyUrl(doc.URL);
    if (!sourceUrl) return null;

    // Check that page looks like a vacancy
    if (!this.looksLikeVacancyPage(doc)) {
      warnings.push({
        field: "_page",
        message: "Document does not appear to be an HH vacancy page",
        severity: "warn",
      });
      return null;
    }

    const sourceVacancyId = this.extractVacancyId(doc);
    if (!sourceVacancyId) {
      warnings.push({
        field: "sourceVacancyId",
        message: "Could not extract vacancy ID from URL or DOM",
        severity: "warn",
      });
    }

    const title = this.tryExtract(doc, "title");
    const companyName = this.tryExtract(doc, "companyName");
    const salaryRaw = this.tryExtract(doc, "salary");
    const city = this.tryExtract(doc, "city");
    const experienceRaw = this.tryExtract(doc, "experience");
    const employmentType = this.tryExtract(doc, "employmentType");
    const schedule = this.tryExtract(doc, "schedule");
    // Extract description separately — we need both HTML (innerHTML) and text
    const descEl = this.tryExtractElement(doc, "description");
    const descriptionHtml = descEl?.innerHTML?.trim() ?? null;
    const descriptionText = descEl?.textContent?.trim() ?? null;

    const workModeRaw = this.tryExtract(doc, "workMode");

    // Extract employer/source company ID from company link (e.g. /employer/12345)
    const sourceCompanyId = this.extractEmployerId(doc);

    // Collect warnings for missing fields
    const nullableFields: Array<{ key: keyof RawVacancyDTO; value: unknown }> =
      [
        { key: "title", value: title },
        { key: "companyName", value: companyName },
        { key: "salaryRaw", value: salaryRaw },
        { key: "city", value: city },
        { key: "experienceRaw", value: experienceRaw },
        { key: "employmentType", value: employmentType },
        { key: "schedule", value: schedule },
        { key: "descriptionHtml", value: descriptionHtml },
        { key: "descriptionText", value: descriptionText },
        { key: "skills", value: this.extractSkills(doc) },
      ];

    for (const { key, value } of nullableFields) {
      if (value === null || value === undefined) {
        warnings.push({
          field: String(key),
          message: `Field "${key}" could not be extracted`,
          severity: "info",
        });
      }
    }

    const dto: RawVacancyDTO = {
      sourceVacancyId,
      sourceUrl,
      title: title ?? null,
      companyName: companyName ?? null,
      salaryRaw: salaryRaw ?? null,
      salaryMin: this.tryParseSalaryMin(salaryRaw),
      salaryMax: this.tryParseSalaryMax(salaryRaw),
      salaryCurrency: this.tryParseSalaryCurrency(salaryRaw),
      city: city ?? null,
      workMode: this.normalizeWorkMode(workModeRaw, descriptionText),
      experienceRaw: experienceRaw ?? null,
      employmentType: employmentType ?? null,
      schedule: schedule ?? null,
      descriptionHtml: descriptionHtml,
      descriptionText: descriptionText,
      skills: this.extractSkills(doc),
      sourceCompanyId,
      extractedAt: now,
      selectorVersion: SELECTOR_VERSION,
      warnings,
    };

    return dto;
  }

  // ── Search list — Phase 2 card extraction ────────────────────

  extractSearchList(doc: Document): RawSearchItemDTO[] {
    const cardElements = this.findSearchCards(doc);
    if (cardElements.length === 0) return [];

    const results: RawSearchItemDTO[] = [];
    const pageUrl = doc.URL;

    for (const card of cardElements) {
      try {
        const dto = this.extractSingleSearchCard(card, pageUrl);
        if (dto) results.push(dto);
      } catch {
        // Skip cards that cause unexpected errors — never crash on bad DOM.
        continue;
      }
    }

    return results;
  }

  // ── Application status sync ──────────────────────────────────

  extractVisibleApplicationStatus?(
    doc: Document,
  ): Partial<ApplicationStatusSync> | null {
    // Passive status extraction — DOM-only, no network requests.
    // Looks for visible status indicators on the vacancy page.
    // Only returns statuses that are clearly labeled by HH.

    const now = new Date().toISOString();
    const result: Partial<ApplicationStatusSync> = {
      detectedAt: now,
    };

    let found = false;

    // Check for common HH response status badges
    const statusSelectors = [
      '[data-qa="vacancy-response-status"]',
      '[data-qa="negotiation-status"]',
      ".vacancy-response-status",
      ".negotiations-status",
      '[data-qa="response-status-viewed"]',
      '[data-qa="response-status-invitation"]',
      '[data-qa="response-status-rejected"]',
    ];

    for (const selector of statusSelectors) {
      try {
        const el = doc.querySelector(selector);
        if (el?.textContent) {
          const label = el.textContent.trim().toLowerCase();

          if (
            /вы откликнулись|отклик отправлен|откликнулись|applied|sent/i.test(
              label,
            )
          ) {
            result.detectedApplied = true;
            result.rawLabel = el.textContent.trim();
            found = true;
          }
          if (/просмотрен|просмотр|viewed/i.test(label)) {
            result.detectedViewedByEmployer = true;
            if (!result.rawLabel) result.rawLabel = el.textContent.trim();
            found = true;
          }
          if (/приглашен|приглашение|invitation|invited/i.test(label)) {
            result.detectedInvitation = true;
            if (!result.rawLabel) result.rawLabel = el.textContent.trim();
            found = true;
          }
          if (/отказ|отклонен|rejected|declined/i.test(label)) {
            result.detectedRejected = true;
            if (!result.rawLabel) result.rawLabel = el.textContent.trim();
            found = true;
          }

          if (found) break;
        }
      } catch {
        continue;
      }
    }

    return found ? result : null;
  }

  // ── HR timeline extraction — Phase 5 ─────────────────────────

  /**
   * Extract visible HR communication entries from user-opened
   * application / negotiation pages.
   *
   * Read-only DOM parsing. No network requests. No DOM writes.
   * Returns sanitized, classified timeline DTOs.
   */
  extractHrTimeline?(doc: Document): RawHrTimelineDTO[] {
    const now = new Date().toISOString();
    const sourceUrl = doc.URL;

    // Determine page kind from URL for sourcePage tagging
    const sourcePage = this.detectHrPageKind(doc.URL);

    const results: RawHrTimelineDTO[] = [];

    // Try to find message/communication blocks
    const messageElements = this.findHrMessageBlocks(doc);

    if (messageElements.length > 0) {
      for (const el of messageElements) {
        try {
          const dto = this.extractSingleHrMessage(
            el,
            sourceUrl,
            sourcePage,
            now,
          );
          if (dto) results.push(dto);
        } catch {
          // Skip entries that cause errors — never crash on bad DOM.
          continue;
        }
      }
    }

    // If no message blocks found, try response cards (applications list)
    if (results.length === 0) {
      const responseElements = this.findHrResponseCards(doc);
      for (const el of responseElements) {
        try {
          const dto = this.extractSingleHrResponse(
            el,
            sourceUrl,
            sourcePage,
            now,
          );
          if (dto) results.push(dto);
        } catch {
          continue;
        }
      }
    }

    return results;
  }

  extractLinkedVacancyIdFromHrPage?(doc: Document): string | null {
    for (const selector of HR_SELECTORS.responseLink) {
      try {
        const link = doc.querySelector(selector);
        const href = link?.getAttribute("href") ?? null;
        const fromSelector = this.extractVacancyIdFromHref(href);
        if (fromSelector) return fromSelector;
      } catch {
        continue;
      }
    }

    const allLinks = Array.from(doc.querySelectorAll('a[href*="/vacancy/"]'));
    for (const link of allLinks) {
      const href = link.getAttribute("href") ?? null;
      const vacancyId = this.extractVacancyIdFromHref(href);
      if (vacancyId) return vacancyId;
    }

    return null;
  }

  // ── HR timeline private helpers ───────────────────────────────

  /**
   * Detect which HR page kind we're on from the URL.
   */
  private detectHrPageKind(
    url: string,
  ): "applications" | "messages" | "negotiations" {
    try {
      const path = new URL(url).pathname;
      if (/\/negotiations\/\d+/i.test(path)) return "messages";
      if (/\/negotiations/i.test(path)) return "negotiations";
      if (/\/applicant\/responses/i.test(path)) return "applications";
    } catch {
      // fall through
    }
    return "negotiations";
  }

  /**
   * Find all message/communication blocks using hr-selectors.
   */
  private findHrMessageBlocks(doc: Document): Element[] {
    const selectors = HR_SELECTORS.messageBlocks;
    for (const selector of selectors) {
      try {
        const elements = Array.from(doc.querySelectorAll(selector));
        if (elements.length > 0) return elements;
      } catch {
        continue;
      }
    }
    return [];
  }

  /**
   * Find all response cards using hr-selectors.
   */
  private findHrResponseCards(doc: Document): Element[] {
    const selectors = HR_SELECTORS.responseCards;
    for (const selector of selectors) {
      try {
        const elements = Array.from(doc.querySelectorAll(selector));
        if (elements.length > 0) return elements;
      } catch {
        continue;
      }
    }
    return [];
  }

  /**
   * Extract a single HR message DTO from a message block element.
   * Stores plain text only (textContent) — no HTML markup.
   */
  private extractSingleHrMessage(
    el: Element,
    sourceUrl: string,
    sourcePage: "applications" | "messages" | "negotiations",
    now: string,
  ): RawHrTimelineDTO | null {
    // Extract text content (plain text only — textContent, not innerHTML)
    const textEl = this.tryExtractHrElement(el, "messageText");
    const text = textEl?.textContent?.trim() ?? null;

    // Extract status badge
    const badge = this.tryExtractHrText(el, "statusBadge");

    // Extract timestamp
    const timestampText = this.tryExtractHrText(el, "timestamp");

    // Classify based on badge + text
    const classification = classifyHrReply({
      text: text ?? "",
      statusBadge: badge,
    });

    return {
      text,
      type: classification.type,
      statusBadge: badge,
      timestampText,
      sourceUrl,
      sourcePage,
      extractedAt: now,
    };
  }

  /**
   * Extract a single HR response DTO from a response card element.
   * Stores plain text only — no HTML markup.
   */
  private extractSingleHrResponse(
    el: Element,
    sourceUrl: string,
    sourcePage: "applications" | "messages" | "negotiations",
    now: string,
  ): RawHrTimelineDTO | null {
    // Extract status badge
    const badge = this.tryExtractHrText(el, "statusBadge");

    // Extract text from the response content (plain text only)
    const textEl = this.tryExtractHrElement(el, "messageText");
    const text = textEl?.textContent?.trim() ?? null;

    // If no message text, try to use the response title + status as text
    const effectiveText = text ?? this.tryExtractHrText(el, "responseTitle");

    // Extract timestamp
    const timestampText = this.tryExtractHrText(el, "timestamp");

    // Classify based on badge + text
    const classification = classifyHrReply({
      text: effectiveText ?? "",
      statusBadge: badge,
    });

    return {
      text: effectiveText,
      type: classification.type,
      statusBadge: badge,
      timestampText,
      sourceUrl,
      sourcePage,
      extractedAt: now,
    };
  }

  /**
   * Try each selector within a scoped element.
   * Returns the first matching Element, or null.
   */
  private tryExtractHrElement(
    scope: Element,
    field: keyof typeof HR_SELECTORS,
  ): Element | null {
    const selectors = HR_SELECTORS[field];
    for (const selector of selectors) {
      try {
        const el = scope.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Try each selector within a scoped element.
   * Returns the text content of the first matching element, or null.
   */
  private tryExtractHrText(
    scope: Element,
    field: keyof typeof HR_SELECTORS,
  ): string | null {
    const el = this.tryExtractHrElement(scope, field);
    return el?.textContent?.trim() ?? null;
  }

  // ── Search card extraction helpers ───────────────────────────

  /**
   * Find all search result card containers in the document.
   * Returns the matching elements from the first successful selector group.
   */
  private findSearchCards(doc: Document): Element[] {
    const selectors = SEARCH_SELECTORS_V1.card;
    for (const selector of selectors) {
      try {
        const elements = Array.from(doc.querySelectorAll(selector));
        if (elements.length > 0) return elements;
      } catch {
        continue;
      }
    }
    return [];
  }

  /**
   * Extract a single search card DTO from a card container element.
   * All queries are scoped to the card element — only visible card DOM.
   * Returns null if sourceId cannot be determined.
   */
  private extractSingleSearchCard(
    card: Element,
    pageUrl: string,
  ): RawSearchItemDTO | null {
    // Title link — required for source ID and URL
    const titleLink = this.tryExtractCardElement(card, "title");
    if (!titleLink) return null;

    const titleText = titleLink?.textContent?.trim() ?? null;
    const href = titleLink?.getAttribute("href") ?? null;

    // Resolve relative URL to absolute
    const fullUrl = canonicalizeHhVacancyUrl(href, pageUrl);

    // Extract vacancy ID from href (e.g. /vacancy/12345678?query=...)
    const sourceId = this.extractVacancyIdFromHref(href);
    if (!sourceId) return null;

    // Company name
    const companyName = this.tryExtractCardText(card, "companyName");

    // Salary
    const salaryRaw = this.tryExtractCardText(card, "salary");

    // City
    const city = this.tryExtractCardText(card, "city");

    // Experience
    const experienceRaw = this.tryExtractCardText(card, "experience");

    // Work mode badge
    const workModeRaw = this.tryExtractCardText(card, "workMode");
    const workMode = this.normalizeWorkMode(workModeRaw, null);

    // Publication date
    const publicationDate = this.tryExtractCardText(card, "publicationDate");

    return {
      sourceId,
      title: titleText,
      companyName,
      url: fullUrl,
      salaryRaw,
      city,
      experienceRaw,
      workMode,
      publicationDate,
    };
  }

  /**
   * Try each selector within the card element scope.
   * Returns the first matching Element, or null.
   */
  private tryExtractCardElement(
    card: Element,
    field: keyof typeof SEARCH_SELECTORS_V1,
  ): Element | null {
    const selectors = SEARCH_SELECTORS_V1[field];
    // Skip the "card" field — it's used to find containers, not to extract within.
    if (field === "card") return null;

    for (const selector of selectors) {
      try {
        const el = card.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Try each selector within the card element scope.
   * Returns the text content of the first matching element, or null.
   */
  private tryExtractCardText(
    card: Element,
    field: keyof typeof SEARCH_SELECTORS_V1,
  ): string | null {
    const el = this.tryExtractCardElement(card, field);
    return el?.textContent?.trim() ?? null;
  }

  /**
   * Extract a numeric vacancy ID from an href like "/vacancy/12345678".
   */
  private extractVacancyIdFromHref(href: string | null): string | null {
    return extractHhVacancyIdFromHref(href);
  }

  // ── Vacancy page helpers ─────────────────────────────────────

  private looksLikeVacancyPage(doc: Document): boolean {
    // Require BOTH a vacancy URL AND at least one known HH vacancy DOM marker.
    // This correctly rejects archived/removed vacancy pages that still match
    // the URL pattern but no longer contain vacancy content.
    const hasVacancyUrl = Boolean(extractHhVacancyIdFromUrl(doc.URL));
    if (!hasVacancyUrl) return false;
    const hasVacancyTitle = doc.querySelector('[data-qa="vacancy-title"]');
    const hasDescription = doc.querySelector('[data-qa="vacancy-description"]');
    return !!(hasVacancyTitle || hasDescription);
  }

  private extractVacancyId(doc: Document): string | null {
    // Try URL first: https://hh.ru/vacancy/12345678
    const fromUrl = extractHhVacancyIdFromUrl(doc.URL);
    if (fromUrl) return fromUrl;

    // Try data attribute
    const el = doc.querySelector("[data-vacancy-id]");
    if (el) return el.getAttribute("data-vacancy-id");

    return null;
  }

  /**
   * Extract employer ID from the company link element.
   * HH.ru company links look like: <a href="/employer/12345">Company Name</a>
   * Returns the numeric employer ID as a string, or null.
   */
  private extractEmployerId(doc: Document): string | null {
    const selectors = SELECTORS_V1.companyLink;
    for (const selector of selectors) {
      try {
        const el = doc.querySelector(selector);
        if (!el) continue;
        const href = el.getAttribute("href");
        if (!href) continue;
        const match = href.match(/\/employer\/(\d+)/i);
        if (match) return match[1];
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Try each selector in the ordered fallback list.
   * Returns the first matching Element, or null.
   */
  private tryExtractElement(
    doc: Document,
    field: keyof typeof SELECTORS_V1,
  ): Element | null {
    const selectors = SELECTORS_V1[field];
    for (const selector of selectors) {
      try {
        const el = doc.querySelector(selector);
        if (el?.textContent?.trim()) {
          return el;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Try each selector in the ordered fallback list.
   * Returns the text content of the first matching element, or null.
   */
  private tryExtract(
    doc: Document,
    field: keyof typeof SELECTORS_V1,
  ): string | null {
    const el = this.tryExtractElement(doc, field);
    return el?.textContent?.trim() ?? null;
  }

  private extractSkills(doc: Document): string[] | null {
    const selectors = SELECTORS_V1.skills;
    for (const selector of selectors) {
      try {
        const elements = doc.querySelectorAll(selector);
        if (elements.length > 0) {
          const skills = Array.from(elements)
            .map((el) => el.textContent?.trim() ?? "")
            .filter(Boolean);
          if (skills.length > 0) return skills;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  // ── Normalizers ────────────────────────────────────────────────

  private normalizeWorkMode(
    raw: string | null,
    descriptionText: string | null,
  ): RawVacancyDTO["workMode"] {
    // Combine the explicit workMode badge with description text hints.
    // The badge takes priority.
    // If the badge is missing, scan the description for mode keywords.
    const primary = raw?.toLowerCase() ?? "";
    const secondary = descriptionText?.toLowerCase() ?? "";

    // If there is no data at all, return null (not "unknown").
    if (!primary && !secondary) return null;

    // Hybrid indicators — check BEFORE remote/office, because hybrid
    // descriptions often mention both "office" and "remote" together.
    if (
      primary.includes("гибрид") ||
      primary.includes("hybrid") ||
      secondary.includes("гибридный") ||
      secondary.includes("hybrid") ||
      secondary.includes("офис + удалён") ||
      secondary.includes("офис + удален") ||
      secondary.includes("office + remote") ||
      (secondary.includes("офис") && secondary.includes("удалён")) ||
      (secondary.includes("офис") && secondary.includes("удален")) ||
      (secondary.includes("office") && secondary.includes("remote"))
    )
      return "hybrid";

    // Remote indicators
    if (
      primary.includes("удалён") ||
      primary.includes("удален") ||
      primary.includes("remote") ||
      secondary.includes("удалённая работа") ||
      secondary.includes("удаленная работа") ||
      secondary.includes("можно удалённо") ||
      secondary.includes("можно удаленно") ||
      secondary.includes("полностью удалён") ||
      secondary.includes("полностью удален") ||
      secondary.includes("fully remote") ||
      secondary.includes("100% remote")
    )
      return "remote";

    // Office indicators
    if (
      primary.includes("офис") ||
      primary.includes("office") ||
      primary.includes("на месте") ||
      secondary.includes("работа в офисе") ||
      secondary.includes("офис в") ||
      secondary.includes("on-site") ||
      secondary.includes("onsite")
    )
      return "office";

    // If we have a badge value but couldn't classify it, mark as unknown.
    // If we only had description text and found nothing, return null.
    if (!primary) return null;
    return "unknown";
  }

  private tryParseSalaryMin(raw: string | null): number | null {
    if (!raw) return null;
    const cleaned = raw.replace(/\u00A0/g, " ").replace(/\s/g, " ");
    const fromMatch = cleaned.match(/(?:от|с)\s*([\d\s]+)/i);
    if (fromMatch) return this.parseNumber(fromMatch[1]);
    const rangeMatch = cleaned.match(/([\d\s]+)\s*[–\-—]\s*([\d\s]+)/);
    if (rangeMatch) return this.parseNumber(rangeMatch[1]);
    return null;
  }

  private tryParseSalaryMax(raw: string | null): number | null {
    if (!raw) return null;
    const cleaned = raw.replace(/\u00A0/g, " ").replace(/\s/g, " ");
    const toMatch = cleaned.match(/(?:до)\s*([\d\s]+)/i);
    if (toMatch) return this.parseNumber(toMatch[1]);
    const rangeMatch = cleaned.match(/([\d\s]+)\s*[–\-—]\s*([\d\s]+)/);
    if (rangeMatch) return this.parseNumber(rangeMatch[2]);
    return null;
  }

  private tryParseSalaryCurrency(raw: string | null): string | null {
    if (!raw) return null;
    const currencyMap: Record<string, string> = {
      "₽": "RUB",
      руб: "RUB",
      rub: "RUB",
      $: "USD",
      usd: "USD",
      "€": "EUR",
      eur: "EUR",
    };
    const lower = raw.toLowerCase();
    for (const [symbol, code] of Object.entries(currencyMap)) {
      if (lower.includes(symbol)) return code;
    }
    return null;
  }

  private parseNumber(str: string): number | null {
    const num = parseInt(str.replace(/\s/g, ""), 10);
    return Number.isNaN(num) ? null : num;
  }
}
