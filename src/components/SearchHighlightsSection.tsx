import { useCallback, useEffect, useState, type ReactNode } from "react";
import { loadSettings, saveSettings } from "@/db/settings-bridge";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import {
  card,
  cardHeading,
  colors,
  fontSizes,
  sectionDesc,
  sectionHeading,
} from "@/styles";

export function SearchHighlightsSection(): ReactNode {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [showViewed, setShowViewed] = useState(true);
  const [showSavedRejected, setShowSavedRejected] = useState(true);
  const [showScore, setShowScore] = useState(true);
  const [showViewCount, setShowViewCount] = useState(true);
  const controlItems = [
    {
      key: "searchHighlightsEnabled",
      label: "Enable search highlights",
      value: enabled,
      hint: "Turn the highlight layer on or off without changing local data.",
    },
    {
      key: "searchHighlightsShowViewed",
      label: "Show viewed vacancies",
      value: showViewed,
      hint: "Render the viewed chip for cards with local visit marks.",
    },
    {
      key: "searchHighlightsShowSavedRejected",
      label: "Show saved/rejected statuses",
      value: showSavedRejected,
      hint: "Render saved/rejected status chips when known locally.",
    },
    {
      key: "searchHighlightsShowScore",
      label: "Show score chips",
      value: showScore,
      hint: "Render local score chips when a score is already available.",
    },
    {
      key: "searchHighlightsShowViewCount",
      label: "Show view count",
      value: showViewCount,
      hint: "Render the local count of HH vacancy opens.",
    },
  ] as const;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const settings = await loadSettings();
      setEnabled(settings.general.searchHighlightsEnabled !== false);
      setShowViewed(settings.general.searchHighlightsShowViewed !== false);
      setShowSavedRejected(
        settings.general.searchHighlightsShowSavedRejected !== false,
      );
      setShowScore(settings.general.searchHighlightsShowScore !== false);
      setShowViewCount(settings.general.searchHighlightsShowViewCount !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persistBooleanSetting = useCallback(
    async (
      key:
        | "searchHighlightsEnabled"
        | "searchHighlightsShowViewed"
        | "searchHighlightsShowSavedRejected"
        | "searchHighlightsShowScore"
        | "searchHighlightsShowViewCount",
      nextValue: boolean,
    ) => {
      setSaving(true);
      setError(null);
      try {
        const settings = await loadSettings();
        settings.general[key] = nextValue;
        await saveSettings(settings);
        if (key === "searchHighlightsEnabled") setEnabled(nextValue);
        if (key === "searchHighlightsShowViewed") setShowViewed(nextValue);
        if (key === "searchHighlightsShowSavedRejected")
          setShowSavedRejected(nextValue);
        if (key === "searchHighlightsShowScore") setShowScore(nextValue);
        if (key === "searchHighlightsShowViewCount")
          setShowViewCount(nextValue);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to update search highlights",
        );
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  if (loading) return <LoadingState />;

  if (error) {
    return (
      <ErrorState
        message="Failed to load search highlight settings"
        details={error}
        onRetry={() => {
          setError(null);
          void load();
        }}
      />
    );
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <h2 style={sectionHeading}>Search Highlights</h2>
      <p style={sectionDesc}>
        Local job data and visit marks are used to render an extension-owned
        badge beside HH search cards. The page's own cards and controls are
        never hidden, dimmed, or rewritten.
      </p>

      <div style={card}>
        <h3 style={cardHeading}>Rejected vacancies</h3>
        <p
          style={{
            fontSize: fontSizes.sm,
            color: colors.textFaint,
            margin: "0 0 12px",
          }}
        >
          Rejected status remains visible in the VacancyPilot badge. Older
          stored dim/hide preferences are retained for compatibility but do
          not mutate HH page DOM.
        </p>

        <p
          style={{
            fontSize: fontSizes.sm,
            color: colors.textSecondary,
            margin: 0,
          }}
        >
          Search-page presentation is isolated inside a closed extension
          shadow root and applies on the next search-page refresh.
        </p>
      </div>

      <div style={{ height: 16 }} />

      <div style={card}>
        <h3 style={cardHeading}>Card visibility controls</h3>
        <p
          style={{
            fontSize: fontSizes.sm,
            color: colors.textFaint,
            margin: "0 0 12px",
          }}
        >
          These toggles affect only the extension-owned chip layer on HH search
          cards.
        </p>

        {controlItems.map((item) => (
          <label
            key={item.key}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "8px 0",
              borderBottom: "1px solid #eee",
            }}
          >
            <input
              type="checkbox"
              checked={item.value}
              onChange={(event) =>
                void persistBooleanSetting(item.key, event.target.checked)
              }
              disabled={saving}
              style={{ marginTop: 2 }}
            />
            <span>
              <span
                style={{
                  display: "block",
                  fontSize: fontSizes.md,
                  color: colors.text,
                  fontWeight: 600,
                }}
              >
                {item.label}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: fontSizes.sm,
                  color: colors.textFaint,
                  marginTop: 2,
                }}
              >
                {item.hint}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
