/**
 * Search page content script — ITER-034 / ITER-035.
 *
 * Runs on HH.ru search result pages and injects lightweight triage badges
 * onto visible search cards. Badges show score, status, and work mode hints
 * from local data (chrome.storage.local badge state) and visible-card parsing.
 *
 * ITER-035 addition: quick save/reject action buttons on each badge.
 *
 * Rules:
 * - No hidden fetches, no auto-click, no form fill.
 * - Read-first, local-only data presentation.
 * - Lightweight DOM — no React, minimal per-card footprint.
 * - Quick actions affect only local data via background messages.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import { HHAdapter } from "@/adapters/hh/hh-adapter";
import { BADGE_KEY_PREFIX, badgeStorageKey } from "@/services/badge-state";
import type { SearchBadgeState } from "@/services/search-badge-render";
import {
  applySearchCardState,
  injectSearchBadgeStyles,
  createBadgeHost,
  attachBadgeToCard,
  findSearchCardElements,
  buildCardElementMap,
  appendActionButtons,
  clearSearchBadgeRenderState,
  canRunSearchQuickAction,
} from "@/services/search-badge-render";
import type { SearchHighlightControls } from "@/services/search-highlights";
import type { RawSearchItemDTO } from "@/adapters/types";
import {
  createRenderScheduler,
  observeDynamicSearchList,
} from "@/services/search-page-sync";
import {
  createFallbackSearchCardDTO,
  discoverSearchCardsFromLinks,
} from "@/services/search-card-discovery";

export default defineContentScript({
  matches: ["https://hh.ru/search/vacancy*", "https://*.hh.ru/search/vacancy*"],
  main() {
    installResetListener();
    void startSearchBadgeSync();
  },
});

let searchListObserver: MutationObserver | null = null;
let searchBadgeRenderGeneration = 0;
let resetListenerInstalled = false;

const SEARCH_HIGHLIGHTS_DEBUG_OVERLAY_ID = "vp-search-debug-overlay";

async function startSearchBadgeSync(): Promise<void> {
  await injectSearchBadges();

  if (searchListObserver) return;

  const scheduleRefresh = createRenderScheduler(() => injectSearchBadges());
  searchListObserver = observeDynamicSearchList(document, scheduleRefresh);

  window.addEventListener(
    "pagehide",
    () => {
      searchListObserver?.disconnect();
      searchListObserver = null;
    },
    { once: true },
  );
}

function installResetListener(): void {
  if (resetListenerInstalled) return;
  resetListenerInstalled = true;
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "VACANCYPILOT_RESET") return false;
    searchBadgeRenderGeneration += 1;
    searchListObserver?.disconnect();
    searchListObserver = null;
    clearSearchBadgeRenderState(document);
    return false;
  });
}

/**
 * Main orchestration: parse cards, load badge state, render badges.
 */
async function injectSearchBadges(): Promise<void> {
  const generation = ++searchBadgeRenderGeneration;
  const debugEnabled = isSearchHighlightsDebugEnabled();
  let errorsCount = 0;

  // ── Parse visible search cards ─────────────────────────────────────
  const adapter = new HHAdapter();
  const adapterCards = adapter.extractSearchList(document);
  const discoveredCards = discoverSearchCardsFromLinks(document);
  const cardByVacancyId = buildUnifiedSearchCardMap(
    adapterCards,
    discoveredCards.map((card) => createFallbackSearchCardDTO(card)),
  );
  const vacancyIds = Array.from(cardByVacancyId.keys());

  if (adapterCards.length === 0 && discoveredCards.length === 0) {
    clearSearchBadgeRenderState(document);
    updateSearchHighlightsDebugOverlay(debugEnabled, {
      adapterCardsCount: 0,
      discoveredCardsCount: 0,
      vacancyIdsCount: 0,
      statesCount: 0,
      legacyStatesCount: 0,
      attachedCount: 0,
      hiddenCount: 0,
      controls: null,
      errorsCount,
    });
    return;
  }

  // ── Batch-load highlight state from background and legacy storage ──────
  const [highlightSnapshot, badgeStates] = await Promise.all([
    loadSearchHighlightSnapshot(vacancyIds),
    loadLegacyBadgeStates(vacancyIds),
  ]);
  if (generation !== searchBadgeRenderGeneration) return;

  // ── Map DOM elements to vacancy IDs ─────────────────────────────────
  const cardElements = findSearchCardElements(document);
  const legacyCardMap = buildCardElementMap(cardElements);
  const discoveredCardMap = new Map(
    discoveredCards.map((card) => [card.vacancyId, card.cardElement] as const),
  );

  const controls = highlightSnapshot.controls;
  let attachedCount = 0;
  let hiddenCount = 0;

  if (!controls.enabled) {
    clearSearchBadgeRenderState(document);
    updateSearchHighlightsDebugOverlay(debugEnabled, {
      adapterCardsCount: adapterCards.length,
      discoveredCardsCount: discoveredCards.length,
      vacancyIdsCount: vacancyIds.length,
      statesCount: Object.keys(highlightSnapshot.states).length,
      legacyStatesCount: Object.keys(badgeStates).length,
      attachedCount,
      hiddenCount,
      controls,
      errorsCount,
    });
    return;
  }

  injectSearchBadgeStyles(document);

  // ── Attach badges with quick action buttons ─────────────────────────
  for (const [vacancyId, card] of cardByVacancyId) {
    if (generation !== searchBadgeRenderGeneration) return;

    try {
      const cardEl =
        discoveredCardMap.get(vacancyId) ?? legacyCardMap.get(vacancyId);
      if (!cardEl) continue;

      const badgeControls = {
        showViewed: controls.showViewed,
        showSavedRejected: controls.showSavedRejected,
        showScore: controls.showScore,
        showViewCount: controls.showViewCount,
      };
      const state: SearchBadgeState = {
        ...badgeStates[vacancyId],
        ...highlightSnapshot.states[vacancyId],
      };
      applySearchCardState(cardEl, state, true);

      if (state.hidden) hiddenCount += 1;

      const badge = createBadgeHost(card, state, badgeControls);
      if (!badge) {
        continue;
      }

      // Append quick action buttons.
      const { saveBtn, rejectBtn } = appendActionButtons(badge);

      // Wire click handlers — each sends a message to the background.
      saveBtn.addEventListener("click", (e) => {
        if (!canRunSearchQuickAction(e, card.sourceId, card.url)) return;
        e.stopPropagation();
        e.preventDefault();
        void handleQuickSave(card);
      });

      rejectBtn.addEventListener("click", (e) => {
        if (!canRunSearchQuickAction(e, card.sourceId, card.url)) return;
        e.stopPropagation();
        e.preventDefault();
        void handleQuickReject(card);
      });

      attachBadgeToCard(cardEl, badge);
      attachedCount += 1;
    } catch {
      // One malformed card must not break badges for the rest.
      errorsCount += 1;
      continue;
    }
  }

  updateSearchHighlightsDebugOverlay(debugEnabled, {
    adapterCardsCount: adapterCards.length,
    discoveredCardsCount: discoveredCards.length,
    vacancyIdsCount: vacancyIds.length,
    statesCount: Object.keys(highlightSnapshot.states).length,
    legacyStatesCount: Object.keys(badgeStates).length,
    attachedCount,
    hiddenCount,
    controls,
    errorsCount,
  });
}

interface SearchHighlightsDebugStats {
  adapterCardsCount: number;
  discoveredCardsCount: number;
  vacancyIdsCount: number;
  statesCount: number;
  legacyStatesCount: number;
  attachedCount: number;
  hiddenCount: number;
  controls: SearchHighlightControls | null;
  errorsCount: number;
}

function buildUnifiedSearchCardMap(
  adapterCards: RawSearchItemDTO[],
  fallbackCards: RawSearchItemDTO[],
): Map<string, RawSearchItemDTO> {
  const map = new Map<string, RawSearchItemDTO>();

  for (const card of adapterCards) {
    if (card.sourceId.length > 0) {
      map.set(card.sourceId, card);
    }
  }

  for (const card of fallbackCards) {
    if (card.sourceId.length > 0 && !map.has(card.sourceId)) {
      map.set(card.sourceId, card);
    }
  }

  return map;
}

function isSearchHighlightsDebugEnabled(): boolean {
  try {
    return (
      new URLSearchParams(window.location.search).has("vpDebug") ||
      window.localStorage.getItem("vpDebugSearchHighlights") === "1"
    );
  } catch {
    return false;
  }
}

function updateSearchHighlightsDebugOverlay(
  enabled: boolean,
  stats: SearchHighlightsDebugStats,
): void {
  if (!enabled) {
    document.getElementById(SEARCH_HIGHLIGHTS_DEBUG_OVERLAY_ID)?.remove();
    return;
  }

  console.info("[VacancyPilot][SearchHighlights] started", {
    url: location.href,
    adapterCardsCount: stats.adapterCardsCount,
    discoveredCardsCount: stats.discoveredCardsCount,
    vacancyIdsCount: stats.vacancyIdsCount,
    statesCount: stats.statesCount,
    legacyStatesCount: stats.legacyStatesCount,
    attachedCount: stats.attachedCount,
    hiddenCount: stats.hiddenCount,
    controls: stats.controls,
    errorsCount: stats.errorsCount,
  });

  const overlay =
    document.getElementById(SEARCH_HIGHLIGHTS_DEBUG_OVERLAY_ID) ??
    document.createElement("div");

  overlay.id = SEARCH_HIGHLIGHTS_DEBUG_OVERLAY_ID;
  overlay.textContent =
    `VP Search: adapter ${stats.adapterCardsCount} · ` +
    `discovered ${stats.discoveredCardsCount} · ` +
    `states ${stats.statesCount + stats.legacyStatesCount} · ` +
    `attached ${stats.attachedCount}`;
  overlay.style.cssText = [
    "position: fixed",
    "right: 12px",
    "bottom: 12px",
    "z-index: 2147483647",
    "padding: 6px 8px",
    "border: 1px solid #cbd5e1",
    "border-radius: 6px",
    "background: rgba(255, 255, 255, 0.96)",
    "color: #334155",
    "font: 11px/1.3 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    "box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12)",
    "pointer-events: none",
  ].join(";");

  if (!overlay.isConnected) {
    document.body.appendChild(overlay);
  }
}

// ── Quick action handlers ──────────────────────────────────────────────

interface QuickActionResponse {
  success: boolean;
  jobId?: string;
  status?: string;
  score?: number;
  error?: string;
}

async function handleQuickSave(
  card: RawSearchItemDTO,
): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "QUICK_SAVE_SEARCH_CARD",
      card,
    })) as QuickActionResponse;

    if (response.success) {
      void injectSearchBadges();
    }
  } catch {
    // Silently ignore — quick actions are non-critical.
  }
}

async function handleQuickReject(
  card: RawSearchItemDTO,
): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "QUICK_REJECT_SEARCH_CARD",
      card,
    })) as QuickActionResponse;

    if (response.success) {
      void injectSearchBadges();
    }
  } catch {
    // Silently ignore.
  }
}

async function loadLegacyBadgeStates(
  vacancyIds: string[],
): Promise<Record<string, SearchBadgeState>> {
  const states: Record<string, SearchBadgeState> = {};

  try {
    const keys = vacancyIds.map((vacancyId) => badgeStorageKey(vacancyId));
    const raw = await chrome.storage.local.get(keys);
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith(BADGE_KEY_PREFIX) && value) {
        const state = value as SearchBadgeState;
        const vacancyId = key.slice(BADGE_KEY_PREFIX.length);
        states[vacancyId] = state;
      }
    }
  } catch {
    // Non-critical — badges will fall back to background-derived state.
  }

  return states;
}

interface SearchHighlightMessageResponse {
  success?: boolean;
  states?: Record<string, SearchBadgeState>;
  controls?: SearchHighlightControls;
  error?: string;
}

interface SearchHighlightSnapshot {
  states: Record<string, SearchBadgeState>;
  controls: SearchHighlightControls;
}

async function loadSearchHighlightSnapshot(
  vacancyIds: string[],
): Promise<SearchHighlightSnapshot> {
  if (vacancyIds.length === 0) {
    return {
      states: {},
      controls: {
        enabled: true,
        showViewed: true,
        showSavedRejected: true,
        showScore: true,
        showViewCount: true,
        rejectedSearchCardBehavior: "dim",
      },
    };
  }

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "GET_SEARCH_HIGHLIGHT_STATES",
      vacancyIds,
    })) as SearchHighlightMessageResponse;

    if (response?.success && response.states && response.controls) {
      return {
        states: response.states,
        controls: response.controls,
      };
    }
  } catch {
    // Non-critical — badges fall back to legacy state and work mode.
  }

  return {
    states: {},
    controls: {
      enabled: true,
      showViewed: true,
      showSavedRejected: true,
      showScore: true,
      showViewCount: true,
      rejectedSearchCardBehavior: "dim",
    },
  };
}
