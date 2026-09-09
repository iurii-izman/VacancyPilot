import { defineBackground } from "wxt/utils/define-background";
import {
  quickSaveSearchCard,
  quickRejectSearchCard,
} from "@/services/search-actions";
import { jobRepo } from "@/db/repositories";
import { createStatusChange } from "@/services/status-transitions";
import {
  checkGuidedApplyGate,
  recordLabsAction,
} from "@/services/labs-control";
import type { RawSearchItemDTO } from "@/adapters/types";
import { upsertApplicationFromJob } from "@/services/hr-timeline-sync";
import { recordVacancyVisit } from "@/services/visit-marks";
import {
  ensureMigrationsBootstrapped,
  getStoredVersion,
  CURRENT_VERSION,
} from "@/db";
import { loadSettings } from "@/db/settings-bridge";
import { applyToolbarBehaviorFromSettings } from "@/services/toolbar-behavior";
import {
  getSearchHighlightStates,
  resolveSearchHighlightControls,
} from "@/services/search-highlights";
import {
  contextMatchesTab,
  contextStorageKey,
  extractVacancyIdFromUrl,
  sidePanelBindingStorageKey,
  type VacancyContext,
} from "@/services/vacancy-context";

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
}

async function bootBackground(): Promise<void> {
  try {
    const storedVersion = await getStoredVersion();
    console.log(
      `[VacancyPilot] schema version: stored=${storedVersion}, current=${CURRENT_VERSION}`,
    );
    await ensureMigrationsBootstrapped();
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
    const tab = sender.tab;
    const vacancyId = typeof message.vacancyId === "string" ? message.vacancyId : "";
    if (!tab?.id || tab.id <= 0 || !tab.windowId || tab.windowId <= 0) return false;
    if (
      message.pageKind !== "vacancy" ||
      !vacancyId
    ) {
      return false;
    }
    const context: VacancyContext = {
      tabId: tab.id,
      windowId: tab.windowId,
      vacancyId,
      pageKind: "vacancy",
      timestamp: Date.now(),
    };
    await chrome.storage.session.set({ [contextStorageKey(tab.id)]: context });
    return true;
  }

  async function resolveSidePanelContext(
    requestedWindowId?: unknown,
  ): Promise<SidePanelContext | null> {
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
        const context: VacancyContext = {
          tabId: targetTabId,
          windowId: targetWindowId,
          vacancyId: vacancyId ?? "",
          pageKind: "vacancy",
          timestamp: Date.now(),
        };
        if (live.pageKind === "vacancy" && vacancyId) {
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
      // A short reload race can leave the content script unavailable.
    }

    const stored = await chrome.storage.session.get(contextStorageKey(targetTabId));
    const context = stored[contextStorageKey(targetTabId)] as VacancyContext | undefined;
    if (contextMatchesTab(context, targetTabId, targetWindowId)) {
      return {
        tabId: targetTabId,
        windowId: targetWindowId,
        vacancyId: context.vacancyId,
        pageKind: "vacancy",
      };
    }
    await clearTabContext(targetTabId);
    return null;
  }

  /** Persist the context without opening the side panel (used by popup). */
  function persistContext(
    message: { tabId?: number; windowId?: number; vacancyId?: string },
    sender: chrome.runtime.MessageSender,
  ): void {
    const nextTabId = message.tabId ?? sender.tab?.id ?? -1;
    const vacancyId = message.vacancyId ?? null;
    if (nextTabId <= 0 || !vacancyId) return;
    const windowId = message.windowId ?? sender.tab?.windowId;
    if (!windowId || windowId <= 0) return;
    const context: VacancyContext = {
      tabId: nextTabId,
      windowId,
      vacancyId,
      pageKind: "vacancy",
      timestamp: Date.now(),
    };
    void chrome.storage.session.set({
      [contextStorageKey(nextTabId)]: context,
      [sidePanelBindingStorageKey(windowId)]: { tabId: nextTabId, windowId },
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // ── SET_SIDE_PANEL_CONTEXT (from popup) ──
    // Popup persists context here and opens the side panel directly.
    if (message.type === "SET_SIDE_PANEL_CONTEXT") {
      persistContext(message, sender);
      sendResponse({ success: true });
      return false; // sync
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
      persistContext(message, sender);
      const tabId = sender.tab?.id;
      const windowId = sender.tab?.windowId;
      const vacancyId = typeof message.vacancyId === "string" ? message.vacancyId : null;
      if (!tabId || tabId <= 0 || !windowId || windowId <= 0 || !vacancyId) {
        console.warn("[VacancyPilot] side panel open skipped: sender tab unavailable");
        sendResponse({ success: false, error: "Explicit vacancy tab gesture required" });
        return false;
      }
      const context: VacancyContext = {
        tabId,
        windowId,
        vacancyId,
        pageKind: "vacancy",
        timestamp: Date.now(),
      };
      // Keep storage persistence non-blocking so this handler retains the
      // content-script click's user-gesture association.
      void chrome.storage.session.set({
        [contextStorageKey(tabId)]: context,
        [sidePanelBindingStorageKey(windowId)]: { tabId, windowId },
      });
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
      if (!card?.sourceId) {
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
      if (!card?.sourceId) {
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
          const gate = await checkGuidedApplyGate();
          if (!gate.allowed) {
            sendResponse({ success: false, error: gate.reason });
            return;
          }
          const job = await jobRepo.getById(jobId);
          if (!job) {
            sendResponse({ success: false, error: "Job not found" });
            return;
          }
          const change = createStatusChange(
            job.status,
            "applied",
            "user",
            "Marked as applied via guided apply",
          );
          job.status = "applied";
          job.statusHistory = [...job.statusHistory, change];
          job.updatedAt = new Date().toISOString();
          await jobRepo.save(job);
          await upsertApplicationFromJob(job, "guided");
          await recordLabsAction("guided_apply_completed", {
            jobId,
            vacancyUrl: job.sourceUrl,
            countsTowardBudget: true,
          });
          sendResponse({ success: true });
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
      if (!sourceId) {
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
            sourceUrl: message.sourceUrl as string | undefined,
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
