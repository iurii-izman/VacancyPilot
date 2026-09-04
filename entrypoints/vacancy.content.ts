import { defineContentScript } from "wxt/utils/define-content-script";
import { HHAdapter } from "@/adapters/hh/hh-adapter";
import { extractVacancyIdFromUrl as extractVacancyIdFromPageUrl } from "@/services/vacancy-context";

export default defineContentScript({
  // Covers vacancy pages plus read-only HR workflow pages.
  // Visible badge is injected only on vacancy pages; HR pages only expose
  // read-only extraction handlers for the side panel.
  matches: [
    "https://hh.ru/vacancy/*",
    "https://*.hh.ru/vacancy/*",
    "https://hh.ru/negotiations*",
    "https://*.hh.ru/negotiations*",
    "https://hh.ru/applicant/responses*",
    "https://*.hh.ru/applicant/responses*",
  ],
  main() {
    setupRuntimeBridge();

    const adapter = new HHAdapter();
    if (adapter.matchUrl(document.location.href) === "vacancy") {
      void registerVacancyContext();
      void recordVacancyVisit();
      void createBadge().catch(() => {
        console.warn("[VacancyPilot] badge creation skipped: exception");
      });
    }
  },
});

let badgeContainer: HTMLElement | null = null;
let runtimeBridgeInstalled = false;

function setupRuntimeBridge(): void {
  if (runtimeBridgeInstalled) return;
  runtimeBridgeInstalled = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "UPDATE_BADGE" && badgeContainer) {
      updateBadgeContent(badgeContainer, message.payload);
      sendResponse({ success: true });
      return false;
    }

    if (message.type === "GET_PAGE_VACANCY_CONTEXT") {
      const vacancyId = extractVacancyIdFromPageUrl(document.location.href);
      sendResponse(
        vacancyId
          ? { success: true, vacancyId, pageKind: "vacancy" }
          : { success: false },
      );
      return false;
    }

    if (message.type === "EXTRACT_VACANCY") {
      try {
        const adapter = new HHAdapter();
        const dto = adapter.extractVacancy(document);
        const passiveStatus =
          adapter.extractVisibleApplicationStatus?.(document) ?? undefined;
        if (dto) {
          sendResponse({ success: true, dto, passiveStatus });
        } else {
          sendResponse({
            success: false,
            error: "Could not extract vacancy data from this page",
            passiveStatus,
          });
        }
      } catch (e) {
        sendResponse({
          success: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      return false;
    }

    if (message.type === "EXTRACT_HR_TIMELINE") {
      try {
        const adapter = new HHAdapter();
        const timeline = adapter.extractHrTimeline?.(document) ?? [];
        const sourceVacancyId =
          adapter.extractLinkedVacancyIdFromHrPage?.(document) ?? null;
        sendResponse({ success: true, timeline, sourceVacancyId });
      } catch (e) {
        sendResponse({
          success: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      return false;
    }

    return false;
  });
}

async function registerVacancyContext(): Promise<void> {
  const vacancyId = extractVacancyIdFromPageUrl(document.location.href);
  if (!vacancyId) {
    console.debug("[VacancyPilot] vacancy context registration skipped: unsupported page");
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      type: "REGISTER_VACANCY_CONTEXT",
      vacancyId,
      pageKind: "vacancy",
    });
    if (!response?.success) {
      console.warn("[VacancyPilot] vacancy context registration rejected");
    }
  } catch {
    console.warn("[VacancyPilot] vacancy context registration failed");
  }
}

async function recordVacancyVisit(): Promise<void> {
  try {
    const result = await chrome.storage.local.get("app_settings_v1");
    const settings = result["app_settings_v1"] as
      | { general?: { trackVisitMarks?: boolean } }
      | undefined;
    if (settings?.general?.trackVisitMarks === false) {
      return;
    }
  } catch {
    // On read failure, record by default.
  }

  const sourceId = extractVacancyIdFromUrl();
  if (!sourceId) return;

  let dto:
    | {
        title: string | null;
        companyName: string | null;
        sourceCompanyId: string | null;
      }
    | null = null;
  try {
    dto = new HHAdapter().extractVacancy(document);
  } catch {
    // Keep the visit mark path alive even if extraction fails.
  }

  try {
    await chrome.runtime.sendMessage({
      type: "RECORD_VACANCY_VISIT",
      sourceId,
      sourceUrl: document.location.href,
      title: dto?.title ?? undefined,
      companyName: dto?.companyName ?? undefined,
      companyId: dto?.sourceCompanyId ?? undefined,
    });
  } catch {
    // Non-critical: visit marks are best-effort local state.
  }
}

/**
 * Create a lightweight badge in Shadow DOM on HH.ru vacancy pages.
 *
 * Rules (spec 17.1):
 * - Small, does not interfere with HH layout.
 * - Does not cover HH buttons.
 * - No heavy UI.
 * - Shadow DOM isolates styles.
 * - Click opens the side panel.
 */
async function createBadge(): Promise<void> {
  // Check settings — only show badge if enabled.
  try {
    const result = await chrome.storage.local.get("app_settings_v1");
    const settings = result["app_settings_v1"] as
      | { general?: { showPageBadge?: boolean } }
      | undefined;
    if (settings?.general?.showPageBadge === false) {
      return;
    }
  } catch {
    // On read failure, show badge by default.
  }

  const body = await waitForDocumentBody();
  if (!body) {
    console.debug("[VacancyPilot] badge creation skipped: document body unavailable");
    return;
  }

  // Prevent duplicate injection.
  if (document.getElementById("vp-badge-host")) return;

  const host = document.createElement("div");
  host.id = "vp-badge-host";
  // Position in top-right corner, below the HH fixed header (~52px).
  // 56px keeps the badge clear of header overlap on real vacancy pages.
  host.style.cssText =
    "position:fixed;top:56px;right:16px;z-index:9000;pointer-events:auto;";

  const shadow = host.attachShadow({ mode: "open" });

  // ── Styles (isolated, no global leakage) ──
  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
    }
    .vp-badge {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      padding: 5px 10px;
      background: #fff;
      border: 1px solid #d0d0d0;
      border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      cursor: pointer;
      user-select: none;
      transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
    }
    .vp-badge:hover {
      border-color: #4a90d9;
      box-shadow: 0 2px 8px rgba(74,144,217,0.18), 0 1px 3px rgba(0,0,0,0.06);
      transform: translateY(-1px);
    }
    .vp-badge:active {
      transform: translateY(0);
    }
    .vp-score {
      background: #4a90d9;
      color: #fff;
      border-radius: 10px;
      padding: 0 6px;
      font-size: 12px;
      font-weight: 600;
      line-height: 20px;
      min-width: 22px;
      text-align: center;
    }
    .vp-score--high {
      background: #2a8;
    }
    .vp-score--mid {
      background: #e6a817;
      color: #333;
    }
    .vp-score--low {
      background: #b08080;
    }
    .vp-status {
      font-size: 12px;
      color: #555;
      line-height: 20px;
    }
    .vp-label {
      font-size: 11px;
      color: #aaa;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
  `;

  // ── Markup ──
  const container = document.createElement("div");
  container.className = "vp-badge";
  container.title = "Open VacancyPilot side panel";
  container.setAttribute("role", "button");
  container.setAttribute("tabindex", "0");
  container.setAttribute("aria-label", "Open VacancyPilot side panel");
  // Placeholder: "VP" label with dash.
  container.innerHTML = `
    <span class="vp-label">VP</span>
    <span class="vp-score">—</span>
    <span class="vp-status">—</span>
  `;

  // ── Click → Open side panel ──
  function openSidePanelFromBadge(): void {
    const vacancyId = extractVacancyIdFromUrl();
    void chrome.runtime.sendMessage({
      type: "OPEN_SIDE_PANEL",
      vacancyId,
    });
  }

  container.addEventListener("click", openSidePanelFromBadge);
  container.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openSidePanelFromBadge();
    }
  });

  shadow.appendChild(style);
  shadow.appendChild(container);
  body.appendChild(host);
  badgeContainer = container;

  // Try to restore badge state from chrome.storage.local (set by popup on save).
  await restoreBadgeState(container);
}

/** Content scripts can run before the document body exists during a reload. */
async function waitForDocumentBody(): Promise<HTMLElement | null> {
  if (document.body) return document.body;
  await new Promise<void>((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
  return document.body;
}

interface BadgePayload {
  score?: number;
  status?: string;
}

/**
 * Extract vacancy ID from the current document URL.
 * Returns null if not on a vacancy page.
 */
function extractVacancyIdFromUrl(): string | null {
  return extractVacancyIdFromPageUrl(document.location.href);
}

/**
 * Restore badge content from chrome.storage.local if previously saved.
 * This ensures the badge shows correct state when the page is loaded/reloaded.
 */
async function restoreBadgeState(container: HTMLElement): Promise<void> {
  try {
    const match = document.location.href.match(/\/vacancy\/(\d+)/);
    if (!match) return;
    const key = `badge_v1_hh_${match[1]}`;
    const result = await chrome.storage.local.get(key);
    const state = result[key] as BadgePayload | undefined;
    if (state && (state.score !== undefined || state.status)) {
      updateBadgeContent(container, state);
    }
  } catch {
    // Non-critical.
  }
}

/**
 * Update badge DOM safely (no React, no heavy render).
 */
function updateBadgeContent(
  container: HTMLElement,
  payload: BadgePayload,
): void {
  const scoreEl = container.querySelector(".vp-score");
  const statusEl = container.querySelector(".vp-status");

  if (scoreEl) {
    const score = payload.score;
    if (score !== undefined && score !== null) {
      scoreEl.textContent = String(score);

      // Reset color classes
      scoreEl.className = "vp-score";
      if (score >= 80) {
        scoreEl.classList.add("vp-score--high");
      } else if (score >= 50) {
        scoreEl.classList.add("vp-score--mid");
      } else {
        scoreEl.classList.add("vp-score--low");
      }
    }
  }

  if (statusEl && payload.status) {
    statusEl.textContent = payload.status;
  }
}
