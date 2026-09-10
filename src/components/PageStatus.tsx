import { useEffect, useState, type ReactNode } from "react";
import { parseCanonicalHhVacancyUrl } from "@/services/hh-vacancy-url";
import { colors, fontSizes } from "../styles";

export type PageStatusInfo =
  | { kind: "loading" }
  | { kind: "vacancy"; url: string; tabId: number; vacancyId: string }
  | { kind: "not-detected" };

/**
 * Synchronous check whether a URL looks like an HH.ru vacancy page.
 */
/**
 * Show whether the active browser tab is on a recognized vacancy page.
 * Used in the popup to display "page detected / not detected" status.
 */
export function usePageStatus(): PageStatusInfo {
  const [info, setInfo] = useState<PageStatusInfo>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function detect(): Promise<void> {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (cancelled) return;

        const canonical = tab?.url
          ? parseCanonicalHhVacancyUrl(tab.url)
          : null;
        if (tab?.id !== undefined && canonical) {
          setInfo({
            kind: "vacancy",
            url: canonical.url,
            tabId: tab.id,
            vacancyId: canonical.vacancyId,
          });
        } else {
          setInfo({ kind: "not-detected" });
        }
      } catch {
        if (!cancelled) {
          setInfo({ kind: "not-detected" });
        }
      }
    }

    detect();

    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}

interface PageStatusProps {
  info: PageStatusInfo;
}

/**
 * Presentational component for page detection status in the popup.
 */
export function PageStatus({ info }: PageStatusProps): ReactNode {
  if (info.kind === "loading") {
    return (
      <span style={{ color: colors.textPlaceholder, fontSize: fontSizes.md }}>
        Detecting page…
      </span>
    );
  }

  if (info.kind === "vacancy") {
    return (
      <span style={{ color: colors.green, fontSize: fontSizes.md }}>
        Vacancy page detected
      </span>
    );
  }

  return (
    <span style={{ color: colors.textPlaceholder, fontSize: fontSizes.md }}>
      Not a vacancy page
    </span>
  );
}
