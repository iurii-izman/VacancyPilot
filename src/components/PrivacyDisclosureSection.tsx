import type { ReactNode } from "react";
import {
  sectionHeading,
  sectionDesc,
  card,
  cardHeading,
  listStyle,
  muted,
  colors,
  fontSizes,
  fontWeights,
} from "@/styles";

/**
 * Privacy disclosure surface explaining what data is collected, stored,
 * and sent externally. Matches the privacy-policy-checklist and the
 * permissions declared in the manifest.
 */
export function PrivacyDisclosureSection(): ReactNode {
  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={sectionHeading}>Privacy Disclosure</h2>
      <p style={sectionDesc}>
        VacancyPilot is designed to keep your data local and under your control.
        Here is exactly what happens with your data.
      </p>

      {/* ── What is stored ── */}
      <div style={card}>
        <h3 style={cardHeading}>Data Stored Locally</h3>
        <p style={muted}>
          In Standalone Mode, the following is stored in the browser (IndexedDB
          + chrome.storage.local). In Ops Mode, operational records are
          canonical in the paired local companion SQLite database:
        </p>
        <ul style={listStyle}>
          <li>
            <strong>Vacancy data</strong> — title, company, salary, description,
            skills, URL, HH vacancy ID
          </li>
          <li>
            <strong>Status history</strong> — your application statuses with
            timestamps
          </li>
          <li>
            <strong>Profiles</strong> — skills, experience, preferences you
            enter
          </li>
          <li>
            <strong>Cover letters</strong> — drafted and saved text
          </li>
          <li>
            <strong>Resume metadata</strong> — summary/highlights you provide
          </li>
          <li>
            <strong>Settings</strong> — your preferences (scoring, privacy, UI)
          </li>
          <li>
            <strong>Event log</strong> — timestamps of your actions (status
            changes, exports, AI requests)
          </li>
          <li>
            <strong>AI cache</strong> — cached AI responses (can be cleared)
          </li>
        </ul>

        <h4
          style={{
            fontSize: fontSizes.body,
            fontWeight: fontWeights.semibold,
            margin: "10px 0 4px",
            color: colors.navy,
          }}
        >
          Local Ops Companion (optional)
        </h4>
        <ul style={listStyle}>
          <li>
            When you explicitly enable and pair Ops Mode, a sanitized backup
            and operational records are sent only to the companion on your own
            computer at <code>127.0.0.1:8765</code>.
          </li>
          <li>
            Migration always provides a preview and requires confirmation;
            offline writes remain in a visible local outbox until reconnect.
          </li>
          <li>
            Pairing tokens are isolated from exports and migration payloads.
          </li>
          <li>
            Companion secrets use the OS keyring; the private V4 engine package
            remains on local disk and is not part of this repository.
          </li>
        </ul>
      </div>

      {/* ── What is NOT stored ── */}
      <div style={card}>
        <h3 style={cardHeading}>Data NOT Stored</h3>
        <ul style={listStyle}>
          <li>HH.ru login credentials or session cookies</li>
          <li>Browsing history beyond the active vacancy page</li>
          <li>Personal identity beyond what you enter in profiles</li>
          <li>Location data beyond what is on the vacancy page</li>
          <li>Device identifiers or fingerprints</li>
          <li>Data from non-HH.ru websites</li>
        </ul>
      </div>

      {/* ── What is sent externally ── */}
      <div style={card}>
        <h3 style={cardHeading}>Data Sent Externally (Opt-in Only)</h3>

        <h4
          style={{
            fontSize: fontSizes.body,
            fontWeight: fontWeights.semibold,
            margin: "10px 0 4px",
            color: colors.navy,
          }}
        >
          AI Provider (your API key required)
        </h4>
        <ul style={listStyle}>
          <li>
            <strong>Sent</strong>: redacted vacancy text (title, company,
            skills, requirements). In Standard Privacy: cleaned description. In
            Strict Privacy: description excluded.
          </li>
          <li>
            <strong>NOT sent</strong>: raw HTML, user identity, emails, phones,
            URLs, cookies, tokens, resume full text.
          </li>
          <li>
            <strong>Payload preview</strong>: you see the exact payload before
            sending and can cancel.
          </li>
        </ul>

        <h4
          style={{
            fontSize: fontSizes.body,
            fontWeight: fontWeights.semibold,
            margin: "10px 0 4px",
            color: colors.navy,
          }}
        >
          n8n Webhook (Labs, your n8n instance required)
        </h4>
        <ul style={listStyle}>
          <li>
            <strong>Sent</strong>: event type, job ID, title, company, score,
            status, URL, timestamp.
          </li>
          <li>
            <strong>NOT sent</strong>: cover letter text, resume text, AI
            analysis, profile details.
          </li>
        </ul>
      </div>

      {/* ── What is NEVER sent ── */}
      <div style={card}>
        <h3 style={cardHeading}>No Other External Communication</h3>
        <ul style={listStyle}>
          <li>No analytics, crash reporting, or telemetry of any kind</li>
          <li>No hidden browser-side HH requests; official HH API reads are companion-side and read-only</li>
          <li>No developer-operated cloud backend or sync API</li>
          <li>No third-party advertising or tracking</li>
          <li>No CDN, external fonts, or remote scripts</li>
        </ul>
      </div>

      {/* ── Data minimization ── */}
      <div style={card}>
        <h3 style={cardHeading}>Data Minimization</h3>
        <ul style={listStyle}>
          <li>
            <strong>Redaction</strong> — emails, phones, URLs are stripped
            before any external request
          </li>
          <li>
            <strong>Strict Privacy mode</strong> — excludes description and
            resume highlights from AI payloads (on by default)
          </li>
          <li>
            <strong>HTML stripping</strong> — only plain text is extracted; raw
            HTML is never stored or sent
          </li>
          <li>
            <strong>AI cache</strong> — responses are cached by content hash,
            can be cleared anytime
          </li>
        </ul>
      </div>

      {/* ── User controls ── */}
      <div style={card}>
        <h3 style={cardHeading}>Your Controls</h3>
        <ul style={listStyle}>
          <li>
            <strong>Export</strong> — export all data as CSV or JSON at any time
          </li>
          <li>
            <strong>Delete all</strong> — delete all local data with one action
          </li>
          <li>
            <strong>AI cache clear</strong> — clear cached AI responses
            independently
          </li>
          <li>
            <strong>AI disable</strong> — AI can be fully disabled (no key = no
            requests)
          </li>
          <li>
            <strong>n8n disable</strong> — n8n is off by default, toggled in
            Labs
          </li>
          <li>
            <strong>Labs kill switch</strong> — disable all experimental
            features with one toggle
          </li>
          <li>
            <strong>Permission management</strong> — review the installed
            manifest in browser extension settings and remove the extension to
            revoke its granted access
          </li>
        </ul>
      </div>

      {/* ── Security ── */}
      <div style={card}>
        <h3 style={cardHeading}>Security</h3>
        <ul style={listStyle}>
          <li>
            Data is protected by the browser&apos;s security model and your OS
            user account
          </li>
          <li>
            Standalone API keys are stored in <code>chrome.storage.local</code>{" "}
            in plaintext; companion provider and HH secrets use the OS keyring.
            Use a dedicated key with minimal permissions.
          </li>
          <li>API keys are never exported, synced, or sent to developer</li>
          <li>No remote code is loaded or executed at runtime</li>
          <li>Manifest V3 with enhanced security model</li>
        </ul>
      </div>
    </div>
  );
}
