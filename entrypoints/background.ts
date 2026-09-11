import { defineBackground } from "wxt/utils/define-background";
import {
  quickSaveSearchCard,
  quickRejectSearchCard,
  isValidQuickActionCard,
} from "@/services/search-actions";
import type { RawSearchItemDTO } from "@/adapters/types";
import { recordVacancyVisit } from "@/services/visit-marks";
import {
  ensureMigrationsBootstrapped,
  getStoredVersion,
  CURRENT_VERSION,
} from "@/db";
import { loadSettings } from "@/db/settings-bridge";
import { applyToolbarBehaviorFromSettings } from "@/services/toolbar-behavior";
import { reconcileOperatingMode } from "@/services/operating-mode";
import { confirmGuidedApplyMutation } from "@/services/guided-apply-mutation";
import {
  getSearchHighlightStates,
  resolveSearchHighlightControls,
} from "@/services/search-highlights";
import {
  contextStorageKey,
  extractVacancyIdFromUrl,
  sidePanelBindingStorageKey,
  type VacancyContext,
} from "@/services/vacancy-context";
import {
  canonicalizeHhVacancyUrl,
  isCanonicalHhVacancyReference,
  isHhSearchUrl,
} from "@/services/hh-vacancy-url";

interface SidePanelContext {
  tabId: number;
  windowId: number;
  vacancyId: string | null;
  pageKind: "vacancy" | "applications" | "messages" | "other";
}

interface PageContext {
  success: boolean;
  pageKind?: SidePanelContext["pageKind"];
  vacancyId?: string;
  url?: string;
}

async function bootBackground(): Promise<void> {
  try {
    const storedVersion = await getStoredVersion();
    console.log(
      `[VacancyPilot] schema version: stored=${storedVersion}, current=${CURRENT_VERSION}`,
    );
    await ensureMigrationsBootstrapped();
    await reconcileOperatingMode();
    if (storedVersion < CURRENT_VERSION) {
      console.log(
        `[VacancyPilot] migration applied: v${storedVersion} → v${CURRENT_VERSION}`,
      );
    }

    const settings = await loadSettings();
    await applyToolbarBehaviorFromSettings(settings);
  } catch (error) {
    console.error("[VacancyPilot] background boot failed:", error);
  }
}

export default defineBackground(() => {
  console.log("[VacancyPilot] background service worker started");

  // ── Async boot (fire-and-forget, outside sync listener registration) ──
  void bootBackground();

  // ── First-install onboarding ──
  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
      try {
        const settings = await loadSettings();
        if (!settings.onboardingCompleted) {
          console.log("[VacancyPilot] first install detected — opening onboarding");
          await chrome.tabs.create({
            url: chrome.runtime.getURL("options.html#onboarding"),
          });
        }
      } catch (err) {
        console.error("[VacancyPilot] failed to open onboarding tab:", err);
      }
    }

    try {
      const settings = await loadSettings();
      await applyToolbarBehaviorFromSettings(settings);
    } catch (error) {
      console.error("[VacancyPilot] failed to apply toolbar behavior:", error);
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.app_settings_v1) {
      return;
    }

    void loadSettings()
      .then((settings) => applyToolbarBehaviorFromSettings(settings))
      .catch((error) => {
        console.error(
          "[VacancyPilot] failed to refresh toolbar behavior from settings:",
          error,
        );
      });
  });

  // ── Side panel explicit context ──
  // Context is set via SET_SIDE_PANEL_CONTEXT (popup) or OPEN_SIDE_PANEL (badge).
  // Side panel reads it via GET_SIDE_PANEL_CONTEXT.
  // Popup opens the side panel directly to preserve the user-gesture path.

  async function clearTabContext(tabId: number): Promise<void> {
    await chrome.storage.session.remove(contextStorageKey(tabId));
  }

  // A reset can race with an already-started context refresh or popup write.
  // Keep a worker-local generation so those stale promises cannot repopulate
  // session state after the reset has cleared it.
  let sessionResetGeneration = 0;

  async function notifyContentScriptsOfReset(): Promise<void> {
    sessionResetGeneration += 1;
    if (typeof chrome.storage.session.clear === "function") {
      await chrome.storage.session.clear();
    }
    try {
      const tabs = await chrome.tabs.query({});
      await Promise.all(
        tabs
          .map((tab) => tab.id)
          .filter((tabId): tabId is number => typeof tabId === "number" && tabId > 0)
          .map(async (tabId) => {
            try {
              await chrome.tabs.sendMessage(tabId, { type: "VACANCYPILOT_RESET" });
            } catch {
              // Tabs without a VacancyPilot content script are expected.
            }
          }),
      );
    } catch {
      // Session state is still cleared even when tab enumeration is unavailable.
    }
  }

  chrome.tabs.onRemoved.addListener((tabId) => {
    void clearTabContext(tabId).catch(() => undefined);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
      const nextVacancyId = extractVacancyIdFromUrl(changeInfo.url);
      void chrome.storage.session.get(contextStorageKey(tabId)).then((stored) => {
        const context = stored[contextStorageKey(tabId)] as VacancyContext | undefined;
        if (!nextVacancyId || context?.vacancyId !== nextVacancyId) {
          return clearTabContext(tabId);
        }
      }).catch(() => undefined);
    }
  });

  async function registerVacancyContext(
    message: { vacancyId?: unknown; pageKind?: unknown },
    sender: chrome.runtime.MessageSender,
  ): Promise<boolean> {
    const generation = sessionResetGeneration;
    const tab = sender.tab;
    const vacancyId = typeof message.vacancyId === "string" ? message.vacancyId : "";
    if (!tab?.id || tab.id <= 0 || !tab.windowId || tab.windowId <= 0) return false;
    if (message.pageKind !== "vacancy" || !vacancyId) {
      return false;
    }
    if (!isCanonicalHhVacancyReference(vacancyId, tab.url)) {
      return false;
    }
    const context: VacancyContext = {
      tabId: tab.id,
      windowId: tab.windowId,
      vacancyId,
      pageKind: "vacancy",
      timestamp: Date.now(),
    };
    if (generation !== sessionResetGeneration) return false;
    await chrome.storage.session.set({ [contextStorageKey(tab.id)]: context });
    return true;
  }

  async function resolveSidePanelContext(
    requestedWindowId?: unknown,
  ): Promise<SidePanelContext | null> {
    const generation = sessionResetGeneration;
    const windowId =
      typeof requestedWindowId === "number" && requestedWindowId > 0
        ? requestedWindowId
        : undefined;
    // A badge click records the exact tab that opened the panel. Prefer this
    // binding over an active-tab guess so a side-panel reload cannot drift to
    // another tab in the same window. The active-tab query remains only the
    // fallback for direct toolbar/popup opens that have no binding yet.
    let targetTabId: number | undefined;
    let targetWindowId = windowId;
    if (targetWindowId) {
      const bindingResult = await chrome.storage.session.get(
        sidePanelBindingStorageKey(targetWindowId),
      );
      const binding = bindingResult[sidePanelBindingStorageKey(targetWindowId)] as
        | { tabId?: unknown; windowId?: unknown }
        | undefined;
      if (
        typeof binding?.tabId === "number" &&
        binding.tabId > 0 &&
        binding.windowId === targetWindowId
      ) {
        targetTabId = binding.tabId;
      }
    }

    if (!targetTabId) {
      const [tab] = await chrome.tabs.query(
        windowId ? { active: true, windowId } : { active: true, lastFocusedWindow: true },
      );
      targetTabId = tab?.id;
      targetWindowId = tab?.windowId ?? windowId;
    }

    if (!targetTabId || targetTabId <= 0 || !targetWindowId || targetWindowId <= 0) {
      return null;
    }

    try {
      const live = (await chrome.tabs.sendMessage(targetTabId, {
        type: "GET_PAGE_CONTEXT",
      })) as PageContext | undefined;
      if (live?.success && live.pageKind) {
        const vacancyId =
          typeof live.vacancyId === "string" ? live.vacancyId : null;
        const canonicalUrl =
          typeof live.url === "string"
            ? canonicalizeHhVacancyUrl(live.url)
            : null;
        if (
          live.pageKind === "vacancy" &&
          (!vacancyId || !canonicalUrl || !isCanonicalHhVacancyReference(vacancyId, canonicalUrl))
        ) {
          await clearTabContext(targetTabId);
          return null;
        }
        const context: VacancyContext = {
          tabId: targetTabId,
          windowId: targetWindowId,
          vacancyId: vacancyId ?? "",
          pageKind: "vacancy",
          timestamp: Date.now(),
        };
        if (live.pageKind === "vacancy" && vacancyId) {
          if (generation !== sessionResetGeneration) return null;
          await chrome.storage.session.set({ [contextStorageKey(targetTabId)]: context });
        }
        return {
          tabId: targetTabId,
          windowId: targetWindowId,
          vacancyId,
          pageKind: live.pageKind,
        };
      }
    } catch {
      // A short reload race is not permission to reuse an old vacancy.
    }
    await clearTabContext(targetTabId);
    return null;
  }

  /** Persist the context without opening the side panel (used by popup). */
  async function persistContext(
    message: { tabId?: number; windowId?: number; vacancyId?: string; url?: string },
    sender: chrome.runtime.MessageSender,
  ): Promise<boolean> {
    const generation = sessionResetGeneration;
    const nextTabId = message.tabId ?? sender.tab?.id ?? -1;
    const vacancyId = message.vacancyId ?? null;
    if (nextTabId <= 0) return false;
    const windowId = message.windowId ?? sender.tab?.windowId;
    if (!windowId || windowId <= 0) return false;
    if (!vacancyId) {
      if (generation !== sessionResetGeneration) return false;
      await chrome.storage.session.remove([
        contextStorageKey(nextTabId),
        sidePanelBindingStorageKey(windowId),
      ]);
      return true;
    }
    const sourceUrl = sender.tab?.url ?? message.url;
    if (!isCanonicalHhVacancyReference(vacancyId, sourceUrl)) return false;
    if (generation !== sessionResetGeneration) return false;
    const context: VacancyContext = {
      tabId: nextTabId,
      windowId,
      vacancyId,
      pageKind: "vacancy",
      timestamp: Date.now(),
    };
    await chrome.storage.session.set({
      [contextStorageKey(nextTabId)]: context,
      [sidePanelBindingStorageKey(windowId)]: { tabId: nextTabId, windowId },
    });
    return true;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "VACANCYPILOT_RESET") {
      if (message.broadcast === true) return false;
      void notifyContentScriptsOfReset().then(
        async () => {
          try {
            // Notify extension pages (Options/Side Panel) as well as the
            // content scripts sent the tab-scoped message above.
            await chrome.runtime.sendMessage({
              type: "VACANCYPILOT_RESET",
              broadcast: true,
            });
          } catch {
            // No other extension page may be open.
          }
          sendResponse({ success: true });
        },
        () => sendResponse({ success: false }),
      );
      return true;
    }

    // ── SET_SIDE_PANEL_CONTEXT (from popup) ──
    // Popup persists context here and opens the side panel directly.
    if (message.type === "SET_SIDE_PANEL_CONTEXT") {
      void persistContext(message, sender).then(
        (success) => sendResponse({ success }),
        () => sendResponse({ success: false }),
      );
      return true;
    }

    if (message.type === "REGISTER_VACANCY_CONTEXT") {
      void registerVacancyContext(message, sender).then(
        (success) => sendResponse({ success }),
        () => sendResponse({ success: false }),
      );
      return true;
    }

    // ── OPEN_SIDE_PANEL (from content badge) ──
    // Badge click path: call open synchronously while Chrome still associates
    // this message with the user's click. Do not await tab/window lookup.
    if (message.type === "OPEN_SIDE_PANEL") {
      const tabId = sender.tab?.id;
      const windowId = sender.tab?.windowId;
      const vacancyId = typeof message.vacancyId === "string" ? message.vacancyId : null;
      if (
        !tabId ||
        tabId <= 0 ||
        !windowId ||
        windowId <= 0 ||
        !vacancyId ||
        !isCanonicalHhVacancyReference(vacancyId, sender.tab?.url)
      ) {
        console.warn("[VacancyPilot] side panel open skipped: sender tab unavailable");
        sendResponse({ success: false, error: "Explicit vacancy tab gesture required" });
        return false;
      }
      const generation = sessionResetGeneration;
      const context: VacancyContext = {
        tabId,
        windowId,
        vacancyId,
        pageKind: "vacancy",
        timestamp: Date.now(),
      };
      // Keep storage persistence non-blocking so this handler retains the
      // content-script click's user-gesture association.
      if (generation === sessionResetGeneration) {
        void chrome.storage.session.set({
          [contextStorageKey(tabId)]: context,
          [sidePanelBindingStorageKey(windowId)]: { tabId, windowId },
        });
      }
      let openPromise: Promise<void>;
      try {
        openPromise = chrome.sidePanel.open({ tabId });
      } catch (error: unknown) {
        console.error("[VacancyPilot] Failed to open side panel:", error);
        sendResponse({ success: false, error: "Could not open side panel" });
        return false;
      }
      void openPromise.then(
        () => sendResponse({ success: true }),
        (error: unknown) => {
          console.error("[VacancyPilot] Failed to open side panel:", error);
          sendResponse({ success: false, error: "Could not open side panel" });
        },
      );
      return true;
    }

    // ── GET_SIDE_PANEL_CONTEXT ──
    if (message.type === "GET_SIDE_PANEL_CONTEXT") {
      void resolveSidePanelContext(message.windowId)
        .then((context) => sendResponse(context))
        .catch(() => sendResponse(null));
      return true;
    }

    // ── Search quick actions (ITER-035) ──

    if (message.type === "QUICK_SAVE_SEARCH_CARD") {
      const card = message.card as RawSearchItemDTO | undefined;
      if (
        !isValidQuickActionCard(card) ||
        !sender.tab?.url ||
        !isHhSearchUrl(sender.tab.url)
      ) {
        sendResponse({ success: false, error: "Invalid search card data" });
        return false;
      }
      void quickSaveSearchCard(card).then(
        (result) => sendResponse({ success: true, ...result }),
        (err: unknown) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }),
      );
      return true; // async response
    }

    if (message.type === "QUICK_REJECT_SEARCH_CARD") {
      const card = message.card as RawSearchItemDTO | undefined;
      if (
        !isValidQuickActionCard(card) ||
        !sender.tab?.url ||
        !isHhSearchUrl(sender.tab.url)
      ) {
        sendResponse({ success: false, error: "Invalid search card data" });
        return false;
      }
      void quickRejectSearchCard(card).then(
        (result) => sendResponse({ success: true, ...result }),
        (err: unknown) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }),
      );
      return true; // async response
    }

    if (message.type === "GET_SEARCH_HIGHLIGHT_STATES") {
      const vacancyIds = Array.isArray(message.vacancyIds)
        ? message.vacancyIds.filter(
            (vacancyId: unknown): vacancyId is string =>
              typeof vacancyId === "string",
          )
        : [];

      void Promise.all([
        getSearchHighlightStates(vacancyIds),
        loadSettings(),
      ]).then(
        ([states, settings]) =>
          sendResponse({
            success: true,
            states,
            controls: resolveSearchHighlightControls(settings),
          }),
        (err: unknown) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }),
      );
      return true;
    }

    // ── Guided Apply: mark job as applied ──

    if (message.type === "MARK_APPLIED") {
      const jobId = message.jobId as string | undefined;
      if (!jobId) {
        sendResponse({ success: false, error: "Missing jobId" });
        return false;
      }
      void (async () => {
        try {
          const result = await confirmGuidedApplyMutation({
            jobId,
            preparationComplete: message.preparationComplete === true,
            nativeSubmissionConfirmed: message.nativeSubmissionConfirmed,
          });
          sendResponse(result);
        } catch (err: unknown) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true; // async response
    }

    if (message.type === "RECORD_VACANCY_VISIT") {
      const sourceId = message.sourceId as string | undefined;
      if (!sourceId || !isCanonicalHhVacancyReference(sourceId, sender.tab?.url)) {
        sendResponse({ success: false, error: "Missing sourceId" });
        return false;
      }

      void (async () => {
        try {
          const settings = await loadSettings();
          if (settings.general.trackVisitMarks === false) {
            sendResponse({ success: true, skipped: true });
            return;
          }

          const visitMark = await recordVacancyVisit({
            sourceId,
            sourceUrl: canonicalizeHhVacancyUrl(sender.tab?.url) ?? undefined,
            title: message.title as string | undefined,
            companyName: message.companyName as string | undefined,
            companyId: message.companyId as string | null | undefined,
          });
          sendResponse({ success: true, visitMark });
        } catch (err: unknown) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true;
    }

    // Return false — no async response.
    return false;
  });
});
