/**
 * Search badge rendering helpers.
 *
 * Search cards belong to HH's page DOM, so local VacancyPilot state is never
 * written to the card itself. The production badge is a generic host with a
 * closed shadow root; score/status/view text and action controls live only in
 * that extension-owned root.
 */

import type { RawSearchItemDTO } from "@/adapters/types";
import {
  extractHhVacancyIdFromHref,
  isCanonicalHhVacancyReference,
} from "./hh-vacancy-url";

export interface SearchBadgeState {
  score?: number;
  status?: string;
  viewCount?: number;
  dimmed?: boolean;
  hidden?: boolean;
}

export interface SearchBadgeControls {
  showViewed?: boolean;
  showSavedRejected?: boolean;
  showScore?: boolean;
  showViewCount?: boolean;
}

interface SearchBadgePart {
  className: string;
  text: string;
  title?: string;
  ariaLabel?: string;
  role?: string;
}

const WORK_MODE_LABELS: Record<string, string> = {
  remote: "УД",
  hybrid: "Гиб",
  office: "Оф",
};

const WORK_MODE_CSS: Record<string, string> = {
  remote: "vp-sb-wm--remote",
  hybrid: "vp-sb-wm--hybrid",
  office: "vp-sb-wm--office",
};

const STATUS_LABELS: Record<string, string> = {
  saved: "VP saved",
  viewed: "VP viewed",
  letter_ready: "VP letter",
  applied: "VP applied",
  rejected_by_me: "VP rejected",
  rejected_by_company: "VP rejected",
  interview: "VP interview",
  offer: "VP offer",
  hr_replied: "VP replied",
  test_task: "VP test",
  new: "VP new",
  blacklist: "VP rejected",
};

const STATUS_LABELS_FULL: Record<string, string> = {
  saved: "Saved",
  viewed: "Viewed",
  letter_ready: "Letter ready",
  applied: "Applied",
  rejected_by_me: "Rejected by me",
  rejected_by_company: "Rejected by company",
  interview: "Interview",
  offer: "Offer",
  hr_replied: "HR replied",
  test_task: "Test task",
  new: "New",
  blacklist: "Blacklisted",
};

const SEARCH_BADGE_SHADOW_CSS = `
  :host {
    display: inline-flex;
    align-items: center;
    margin-left: 6px;
    vertical-align: middle;
  }
  .vp-sb-container {
    display: inline-flex;
    gap: 3px;
    align-items: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 10px;
    line-height: 1;
    white-space: nowrap;
  }
  .vp-sb-score {
    background: #4a90d9;
    color: #fff;
    border-radius: 8px;
    padding: 1px 5px;
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
    min-width: 18px;
    text-align: center;
  }
  .vp-sb-score--high { background: #2a8; }
  .vp-sb-score--mid { background: #e6a817; color: #333; }
  .vp-sb-score--low { background: #c44; }
  .vp-sb-status {
    font-size: 10px;
    color: #666;
    max-width: 86px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .vp-sb-neutral {
    color: #6b7280;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1px 5px;
    font-size: 10px;
    line-height: 14px;
  }
  .vp-sb-view-count {
    font-size: 9px;
    color: #4a90d9;
    border: 1px solid #cfe0f6;
    background: #f4f8fd;
    border-radius: 8px;
    padding: 0 4px;
    line-height: 14px;
  }
  .vp-sb-wm {
    font-size: 9px;
    color: #999;
    border: 1px solid #ddd;
    border-radius: 3px;
    padding: 0 3px;
    line-height: 14px;
  }
  .vp-sb-wm--remote { color: #2a8; border-color: #2a8; }
  .vp-sb-wm--hybrid { color: #e6a817; border-color: #e6a817; }
  .vp-sb-wm--office { color: #888; border-color: #ccc; }
  .vp-sb-actions {
    display: inline-flex;
    gap: 2px;
    margin-left: 2px;
  }
  .vp-sb-action {
    all: initial;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: 1px solid transparent;
    border-radius: 3px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease;
    color: #666;
    background: transparent;
  }
  :host(:hover) .vp-sb-action,
  .vp-sb-action:focus-visible { opacity: 1; }
  .vp-sb-action:hover { background: #f0f0f0; border-color: #ccc; }
  .vp-sb-action--save:hover { color: #2a8; border-color: #2a8; }
  .vp-sb-action--reject:hover { color: #c44; border-color: #c44; }
  .vp-sb-action:focus-visible {
    outline: 2px solid #4a90d9;
    outline-offset: 1px;
  }
`;

const badgeRoots = new WeakMap<HTMLElement, ShadowRoot>();

/**
 * Gate privileged search-card actions at the extension-owned event boundary.
 * Synthetic page events have isTrusted=false and must never reach the runtime
 * message path, even when their payload looks like a valid card.
 */
export function canRunSearchQuickAction(
  event: Pick<Event, "isTrusted">,
  sourceId: string,
  sourceUrl: string | null | undefined,
): boolean {
  return event.isTrusted === true && isCanonicalHhVacancyReference(sourceId, sourceUrl);
}

function shouldShowStatus(
  status: string,
  controls?: SearchBadgeControls,
): boolean {
  if (status === "viewed") return controls?.showViewed !== false;
  if (
    status === "saved" ||
    status === "rejected_by_me" ||
    status === "rejected_by_company" ||
    status === "blacklist"
  ) {
    return controls?.showSavedRejected !== false;
  }
  return true;
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function scoreClass(score: number): string {
  if (score >= 80) return "vp-sb-score--high";
  if (score >= 50) return "vp-sb-score--mid";
  return "vp-sb-score--low";
}

function hasKnownState(state: SearchBadgeState | undefined): boolean {
  return (
    state?.status !== undefined ||
    state?.score !== undefined ||
    state?.viewCount !== undefined
  );
}

function buildSearchBadgeParts(
  card: RawSearchItemDTO,
  state: SearchBadgeState | undefined,
  controls?: SearchBadgeControls,
): SearchBadgePart[] {
  const parts: SearchBadgePart[] = [];

  if (!hasKnownState(state)) {
    parts.push({
      className: "vp-sb-neutral",
      text: "VP new",
      title: "New to VacancyPilot",
      ariaLabel: "New to VacancyPilot",
    });
  }

  if (state?.status && shouldShowStatus(state.status, controls)) {
    const label = STATUS_LABELS[state.status] ?? `VP ${state.status}`;
    const fullLabel = STATUS_LABELS_FULL[state.status] ?? state.status;
    parts.push({
      className: "vp-sb-status",
      text: label,
      title: fullLabel,
      ariaLabel: fullLabel,
    });
  }

  if (
    controls?.showScore !== false &&
    state?.score !== undefined &&
    state.score !== null
  ) {
    parts.push({
      className: `vp-sb-score ${scoreClass(state.score)}`,
      text: String(state.score),
      role: "status",
      ariaLabel: `Score ${state.score}`,
    });
  }

  if (
    controls?.showViewCount !== false &&
    state?.viewCount !== undefined &&
    state.viewCount !== null
  ) {
    parts.push({
      className: "vp-sb-view-count",
      text: `${state.viewCount}×`,
      title: `Viewed ${state.viewCount} time(s)`,
      ariaLabel: `Viewed ${state.viewCount} time(s)`,
    });
  }

  if (card.workMode && card.workMode !== "unknown" && card.workMode !== null) {
    const wmLabel = WORK_MODE_LABELS[card.workMode] ?? card.workMode;
    const cls = WORK_MODE_CSS[card.workMode] ?? "";
    parts.push({
      className: `vp-sb-wm ${cls}`.trim(),
      text: wmLabel,
      ariaLabel: `Work mode: ${card.workMode}`,
    });
  }

  return parts;
}

function createBadgeContainer(
  card: RawSearchItemDTO,
  state: SearchBadgeState | undefined,
  controls: SearchBadgeControls | undefined,
  doc: Document,
): HTMLElement | null {
  const parts = buildSearchBadgeParts(card, state, controls);
  if (parts.length === 0) return null;

  const container = doc.createElement("span");
  container.className = "vp-sb-container";
  for (const part of parts) {
    const piece = doc.createElement("span");
    piece.className = part.className;
    piece.textContent = part.text;
    if (part.title) piece.title = part.title;
    if (part.ariaLabel) piece.setAttribute("aria-label", part.ariaLabel);
    if (part.role) piece.setAttribute("role", part.role);
    container.appendChild(piece);
  }
  return container;
}

export function buildSearchBadgeHTML(
  card: RawSearchItemDTO,
  state: SearchBadgeState | undefined,
  controls?: SearchBadgeControls,
): string {
  const parts = buildSearchBadgeParts(card, state, controls).map((part) => {
    const attrs = [
      `class="${escapeHtml(part.className)}"`,
      part.title ? `title="${escapeHtml(part.title)}"` : null,
      part.ariaLabel ? `aria-label="${escapeHtml(part.ariaLabel)}"` : null,
      part.role ? `role="${escapeHtml(part.role)}"` : null,
    ].filter((attr): attr is string => attr !== null);
    return `<span ${attrs.join(" ")}>${escapeHtml(part.text)}</span>`;
  });
  return parts.length === 0
    ? ""
    : `<span class="vp-sb-container">${parts.join("")}</span>`;
}

/** Compatibility no-op: production styles are scoped inside closed roots. */
export function injectSearchBadgeStyles(_doc: Document): void {
  // Intentionally empty.
  void _doc;
}

/** Create a generic, state-independent host with an extension-owned closed root. */
export function createBadgeHost(
  card: RawSearchItemDTO,
  state: SearchBadgeState | undefined,
  controls?: SearchBadgeControls,
  doc: Document = document,
): HTMLElement | null {
  const container = createBadgeContainer(card, state, controls, doc);
  if (!container) return null;

  const host = doc.createElement("span");
  host.className = "vp-sb-host";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = doc.createElement("style");
  style.textContent = SEARCH_BADGE_SHADOW_CSS;
  shadow.append(style, container);
  badgeRoots.set(host, shadow);
  return host;
}

export function attachBadgeToCard(
  cardEl: Element | null,
  badge: HTMLElement,
): void {
  if (!cardEl) return;
  const titleLink = cardEl.querySelector(
    'a[href*="/vacancy/"], a[href*="%2Fvacancy%2F"], a[href*="%2fvacancy%2f"]',
  );
  const titleHeader = titleLink?.closest(
    ".serp-item__header, .vacancy-serp-item__header, h3",
  );
  const target =
    titleHeader ??
    cardEl.querySelector(".serp-item__header") ??
    cardEl.querySelector("h3") ??
    cardEl.querySelector(".vacancy-serp-item__header") ??
    cardEl;
  if (!target) return;

  const existing = cardEl.querySelector(".vp-sb-host");
  if (existing) existing.replaceWith(badge);
  else target.appendChild(badge);
}

/** Remove legacy card mutations; never add private state to HH card DOM. */
export function applySearchCardState(
  cardEl: Element | null,
  _state: SearchBadgeState | undefined,
  _enabled = true,
): void {
  void _state;
  void _enabled;
  cardEl?.classList.remove("vp-sb-card--dimmed", "vp-sb-card--hidden");
}

export function clearSearchBadgeRenderState(doc: Document): void {
  for (const host of Array.from(doc.querySelectorAll(".vp-sb-host"))) {
    host.remove();
  }
  for (const card of Array.from(
    doc.querySelectorAll(".vp-sb-card--dimmed, .vp-sb-card--hidden"),
  )) {
    card.classList.remove("vp-sb-card--dimmed", "vp-sb-card--hidden");
  }
}

export function buildCardElementMap(elements: Element[]): Map<string, Element> {
  const map = new Map<string, Element>();
  const titleSelectors = [
    '[data-qa="serp-item__title"]',
    "a.serp-item__title",
    ".serp-item__title a",
    '[data-qa="vacancy-serp__title"]',
    ".vacancy-serp-item__title a",
  ];

  for (const el of elements) {
    for (const selector of titleSelectors) {
      try {
        const link = el.querySelector(selector);
        const id = extractHhVacancyIdFromHref(link?.getAttribute("href"));
        if (id) {
          map.set(id, el);
          break;
        }
      } catch {
        continue;
      }
    }
  }
  return map;
}

export function findSearchCardElements(doc: Document): Element[] {
  const selectors = [
    '[data-qa="vacancy-serp-item"]',
    ".serp-item",
    '[data-qa="vacancy-serp"]',
    "div.vacancy-serp-item",
  ];
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

export function createSaveButton(doc: Document = document): HTMLButtonElement {
  const btn = doc.createElement("button");
  btn.className = "vp-sb-action vp-sb-action--save";
  btn.textContent = "⊕";
  btn.title = "Save vacancy";
  btn.setAttribute("type", "button");
  btn.setAttribute("aria-label", "Save vacancy");
  return btn;
}

export function createRejectButton(
  doc: Document = document,
): HTMLButtonElement {
  const btn = doc.createElement("button");
  btn.className = "vp-sb-action vp-sb-action--reject";
  btn.textContent = "⊗";
  btn.title = "Reject vacancy";
  btn.setAttribute("type", "button");
  btn.setAttribute("aria-label", "Reject vacancy");
  return btn;
}

export function appendActionButtons(
  badgeHost: HTMLElement,
  doc: Document = document,
): {
  wrapper: HTMLElement;
  saveBtn: HTMLButtonElement;
  rejectBtn: HTMLButtonElement;
} {
  const wrapper = doc.createElement("span");
  wrapper.className = "vp-sb-actions";
  const saveBtn = createSaveButton(doc);
  const rejectBtn = createRejectButton(doc);
  wrapper.append(saveBtn, rejectBtn);

  // The fallback is only for isolated unit callers that construct a plain
  // host. Production hosts always use the closed root stored above.
  const target: ShadowRoot | HTMLElement = badgeRoots.get(badgeHost) ?? badgeHost;
  target.appendChild(wrapper);
  return { wrapper, saveBtn, rejectBtn };
}
