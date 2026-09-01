import type { ReactNode } from "react";
import { card, cardHeading, listStyle, colors } from "@/styles";

export type TrustLevel = "compact" | "full";

interface TrustSafetySummaryProps {
  level?: TrustLevel;
}

const doItem: React.CSSProperties = { color: "#2a8" };

export function TrustSafetySummary({
  level = "full",
}: TrustSafetySummaryProps): ReactNode {
  const isCompact = level === "compact";

  return (
    <>
      {/* ── What it does ── */}
      <div style={card}>
        <h3 style={cardHeading}>What VacancyPilot Does</h3>
        <ul style={listStyle}>
          <li style={doItem}>
            Extracts vacancy data (title, company, salary, skills) from HH.ru
            pages you open
          </li>
          <li style={doItem}>
            Scores vacancies against your profile using local, rule-based
            scoring
          </li>
          <li style={doItem}>
            Tracks your application status history (Saved → Applied → Interview
            → Offer, etc.)
          </li>
          {!isCompact && (
            <>
              <li style={doItem}>
                Generates cover letters with AI assistance (opt-in, requires
                your own API key)
              </li>
              <li style={doItem}>
                Provides AI-powered vacancy analysis (opt-in, payload preview
                before every request)
              </li>
              <li style={doItem}>
                Exports your data as CSV or JSON at any time
              </li>
              <li style={doItem}>
                Sends optional notifications via your own n8n webhook (opt-in,
                Labs)
              </li>
            </>
          )}
        </ul>
      </div>

      {/* ── What it does NOT do ── */}
      <div style={card}>
        <h3 style={cardHeading}>What VacancyPilot Does NOT Do</h3>
        <ul style={{ ...listStyle, color: colors.red }}>
          <li>Does not auto-submit applications or fill HH.ru forms</li>
          <li>Does not auto-click HH.ru controls or simulate user actions</li>
          <li>Does not access your HH.ru login, cookies, or session</li>
          <li>Does not send data to a developer cloud backend or sync service</li>
          <li>Does not collect analytics, telemetry, or crash reports</li>
          {!isCompact && (
            <>
              <li>Does not bypass CAPTCHA or anti-bot protections</li>
              <li>
                Does not work on websites other than HH.ru (no multi-site in
                MVP)
              </li>
            </>
          )}
        </ul>
      </div>

      {/* ── Data storage (full only) ── */}
      {!isCompact && (
        <div style={card}>
          <h3 style={cardHeading}>Where Data Is Stored</h3>
          <ul style={listStyle}>
            <li>
              Standalone data is stored in your browser: IndexedDB for vacancy
              data and profiles, <code>chrome.storage.local</code> for settings
              and the standalone BYOK path. Optional Ops Mode stores canonical
              operational data in the local companion SQLite database.
            </li>
            <li>No developer cloud backend or sync service; companion secrets use the OS keyring</li>
            <li>
              You can export all data (CSV or JSON) and delete everything from
              the Dashboard at any time
            </li>
          </ul>
        </div>
      )}

      {/* ── Key principles ── */}
      <div style={card}>
        <h3 style={cardHeading}>Key Principles</h3>
        <ul style={listStyle}>
          <li>
            <strong>Local-first</strong> — Data stays on your device: browser
            storage in Standalone Mode, optional SQLite companion storage in Ops
            Mode. No developer cloud sync.
          </li>
          <li>
            <strong>Read-first</strong> — The extension reads vacancy pages you
            open. It never writes to HH.ru.
          </li>
          <li>
            <strong>User in control</strong> — You decide what to save, score,
            or send. Every AI and n8n request shows a payload preview.
          </li>
          <li>
            <strong>Works without AI</strong> — Scoring works with local rules.
            AI is optional and requires your own API key.
          </li>
          <li>
            <strong>Privacy by default</strong> — Strict Privacy mode is on by
            default. Contacts are redacted. No telemetry.
          </li>
          <li>
            <strong>Core vs Labs</strong> — Experimental features (Labs) are off
            by default. You enable them explicitly.
          </li>
        </ul>
      </div>
    </>
  );
}
