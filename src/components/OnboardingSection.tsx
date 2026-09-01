import { useState, useCallback, type ReactNode, type FormEvent } from "react";
import { loadSettings, saveSettings } from "@/db/settings-bridge";
import { TrustSafetySummary } from "@/components/TrustSafetySummary";
import {
  sectionHeading,
  card,
  cardHeading,
  listStyle,
  primaryButton,
  colors,
  fontSizes,
  fontWeights,
  spacing,
  borderRadius,
} from "@/styles";

// ── Step types ──

interface StepDef {
  id: string;
  number: number;
  title: string;
  kind: "required" | "optional";
}

const STEPS: StepDef[] = [
  { id: "safety", number: 1, title: "Safety & Trust", kind: "required" },
  { id: "profile", number: 2, title: "Create Your Profile", kind: "required" },
  {
    id: "resume",
    number: 3,
    title: "Add Resume Highlights",
    kind: "required",
  },
  {
    id: "first-vacancy",
    number: 4,
    title: "Save Your First Vacancy",
    kind: "required",
  },
  { id: "ai", number: 5, title: "Configure AI (optional)", kind: "optional" },
  {
    id: "labs",
    number: 6,
    title: "Review Labs / n8n (deferred optional)",
    kind: "optional",
  },
];

// ── Styles ──

const stepRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: spacing.md,
};

const stepNumber: React.CSSProperties = {
  flexShrink: 0,
  width: 26,
  height: 26,
  borderRadius: "50%",
  background: colors.blue,
  color: colors.white,
  fontSize: fontSizes.md,
  fontWeight: fontWeights.bold,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
};

const stepNumberDone: React.CSSProperties = {
  ...stepNumber,
  background: colors.green,
};

const stepNumberOptional: React.CSSProperties = {
  ...stepNumber,
  background: colors.textFaint,
};

const stepTitle: React.CSSProperties = {
  fontSize: fontSizes.cardHeading,
  fontWeight: fontWeights.semibold,
  color: colors.navy,
  margin: "2px 0 0",
  cursor: "pointer",
};

const stepTitleDone: React.CSSProperties = {
  ...stepTitle,
  color: colors.textMuted,
  cursor: "default",
};

const stepBody: React.CSSProperties = {
  marginLeft: 34,
  marginTop: spacing.sm,
};

const stepDesc: React.CSSProperties = {
  fontSize: fontSizes.md,
  color: colors.textMuted,
  margin: "0 0 8px",
};

const chip: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 8px",
  borderRadius: borderRadius.sm,
  fontSize: fontSizes.xs,
  fontWeight: fontWeights.semibold,
  marginLeft: spacing.sm,
};

const chipDone: React.CSSProperties = {
  ...chip,
  background: colors.grantedBadgeBg,
  color: colors.green,
};

const chipOptional: React.CSSProperties = {
  ...chip,
  background: colors.neutralBg,
  color: colors.textFaint,
};

// ── Component ──

export function OnboardingSection(): ReactNode {
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(
    () => new Set(["safety"]),
  );
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());

  const toggleStep = useCallback((id: string) => {
    setExpandedSteps((prevExpanded) => {
      const nextExpanded = new Set(prevExpanded);
      const wasExpanded = nextExpanded.has(id);

      if (wasExpanded) {
        nextExpanded.delete(id);
        setDoneSteps((prevDone) => {
          const nextDone = new Set(prevDone);
          nextDone.add(id);
          return nextDone;
        });
      } else {
        nextExpanded.add(id);
      }

      return nextExpanded;
    });
  }, []);

  const handleComplete = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const settings = await loadSettings();
      settings.onboardingCompleted = true;
      await saveSettings(settings);
      setCompleted(true);
    } catch {
      // If saving fails, user can retry.
    } finally {
      setSaving(false);
    }
  }, []);

  if (completed) {
    return (
      <div style={{ maxWidth: 560 }}>
        <h2 style={sectionHeading}>Onboarding Complete ✓</h2>
        <div style={card}>
          <p
            style={{ fontSize: fontSizes.body, color: colors.green, margin: 0 }}
          >
            You&apos;re all set! Navigate to any HH.ru vacancy page to start
            using VacancyPilot.
          </p>
          <p
            style={{
              fontSize: fontSizes.md,
              color: colors.textMuted,
              margin: "10px 0 0",
            }}
          >
            Tip: open a vacancy like <code>https://hh.ru/vacancy/12345678</code>{" "}
            and look for the VacancyPilot badge.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={sectionHeading}>Welcome to VacancyPilot</h2>
      <p
        style={{
          fontSize: fontSizes.md,
          color: colors.textMuted,
          margin: "0 0 16px",
        }}
      >
        This guide walks you through setup in a few minutes. Skip anything
        marked optional — core features work without them.
      </p>

      {/* ── Step 1: Safety & Trust ── */}
      {renderStep({
        step: STEPS[0],
        isExpanded: expandedSteps.has("safety"),
        isDone: doneSteps.has("safety"),
        onToggle: () => toggleStep("safety"),
        children: (
          <>
            <TrustSafetySummary level="full" />

            <div style={card}>
              <h3 style={cardHeading}>Permissions Used</h3>
              <ul style={listStyle}>
                <li>
                  <strong>storage</strong> — Saves vacancy data, settings, and
                  profiles locally in your browser
                </li>
                <li>
                  <strong>sidePanel</strong> — Opens a side panel on HH.ru
                  vacancy pages for analysis and actions
                </li>
                <li>
                  <strong>activeTab</strong> — Reads the current vacancy page to
                  extract job data (title, company, salary, etc.)
                </li>
              </ul>
              <p
                style={{
                  fontSize: fontSizes.sm,
                  color: colors.textFaint,
                  margin: "8px 0 0",
                }}
              >
                This build declares only <strong>storage</strong>,{" "}
                <strong>sidePanel</strong>, and <strong>activeTab</strong>. It
                does not declare install-time host permissions. OpenAI host and
                loopback companion access are optional and requested only when
                you explicitly use those flows.
              </p>
            </div>

            {/* ── API key warning ── */}
            <div
              style={{
                ...card,
                border: `1px solid ${colors.keyWarningBorder}`,
                background: colors.keyWarningBg,
              }}
            >
              <h3 style={{ ...cardHeading, color: colors.keyWarningText }}>
                ⚠ Important: API Key Security
              </h3>
              <p
                style={{
                  fontSize: fontSizes.md,
                  color: colors.textSecondary,
                  margin: 0,
                }}
              >
                Standalone API keys are stored locally in{" "}
                <code>chrome.storage.local</code> in plaintext. This is{" "}
                <strong>not a secure vault</strong>. Anyone with access to your
                unlocked computer and browser profile could read them. Ops Mode
                provider and HH secrets use the local companion&apos;s OS keyring.
                Use an API key with minimal permissions and consider a
                dedicated key for VacancyPilot.
              </p>
            </div>
          </>
        ),
      })}

      {/* ── Step 2: Create Profile ── */}
      {renderStep({
        step: STEPS[1],
        isExpanded: expandedSteps.has("profile"),
        isDone: doneSteps.has("profile"),
        onToggle: () => toggleStep("profile"),
        children: (
          <div style={{ ...card, marginBottom: 0 }}>
            <p style={stepDesc}>
              Go to <strong>Profiles</strong> in the sidebar. Add your skills,
              role preferences, and experience level. The scoring engine uses
              this to evaluate vacancies.
            </p>
            <p style={{ ...stepDesc, margin: 0 }}>
              You can create multiple profiles for different roles (e.g.,
              &quot;Frontend Developer&quot;, &quot;Tech Lead&quot;).
            </p>
          </div>
        ),
      })}

      {/* ── Step 3: Add Resume Highlights ── */}
      {renderStep({
        step: STEPS[2],
        isExpanded: expandedSteps.has("resume"),
        isDone: doneSteps.has("resume"),
        onToggle: () => toggleStep("resume"),
        children: (
          <div style={{ ...card, marginBottom: 0 }}>
            <p style={stepDesc}>
              Go to <strong>Resumes</strong> in the sidebar. Add a brief summary
              of your experience. This helps AI generate targeted cover letters
              (if you enable AI later).
            </p>
            <p style={{ ...stepDesc, margin: 0 }}>
              Keep it short — 2–3 sentences about your background and strengths
              is enough.
            </p>
          </div>
        ),
      })}

      {/* ── Step 4: Save First Vacancy ── */}
      {renderStep({
        step: STEPS[3],
        isExpanded: expandedSteps.has("first-vacancy"),
        isDone: doneSteps.has("first-vacancy"),
        onToggle: () => toggleStep("first-vacancy"),
        children: (
          <div style={{ ...card, marginBottom: 0 }}>
            <p style={stepDesc}>
              Open any HH.ru vacancy page (e.g.{" "}
              <code>https://hh.ru/vacancy/12345678</code>) and click the
              VacancyPilot badge. The extension will extract and score the
              vacancy automatically.
            </p>
            <p style={{ ...stepDesc, margin: 0 }}>
              Save interesting vacancies to track them on the Dashboard →
              Vacancies board.
            </p>
          </div>
        ),
      })}

      {/* ── Step 5: Configure AI (optional) ── */}
      {renderStep({
        step: STEPS[4],
        isExpanded: expandedSteps.has("ai"),
        isDone: doneSteps.has("ai"),
        onToggle: () => toggleStep("ai"),
        children: (
          <div style={{ ...card, marginBottom: 0 }}>
            <div style={card}>
              <h3 style={cardHeading}>How AI Works</h3>
              <ul style={listStyle}>
                <li>
                  AI features are <strong>opt-in</strong> — you must provide
                  your own API key
                </li>
                <li>
                  AI is powered by your chosen provider. This build currently
                  supports OpenAI and Mock
                </li>
                <li>
                  Every AI request shows a <strong>payload preview</strong>{" "}
                  before sending — you review and confirm
                </li>
                <li>
                  <strong>Strict Privacy mode</strong> is on by default: vacancy
                  description text is excluded from AI payloads
                </li>
                <li>
                  Contacts (emails, phones, URLs) are redacted before any
                  external request
                </li>
                <li>You can fully disable AI at any time in Settings</li>
              </ul>
            </div>
            <p style={{ ...stepDesc, margin: 0 }}>
              Go to <strong>Settings</strong> → AI. Enter a standalone API key
              only if needed; Ops Mode Full V4 uses the paired companion&apos;s
              OS-keyring configuration.
            </p>
          </div>
        ),
      })}

      {/* ── Step 6: Enable Labs / n8n (optional) ── */}
      {renderStep({
        step: STEPS[5],
        isExpanded: expandedSteps.has("labs"),
        isDone: doneSteps.has("labs"),
        onToggle: () => toggleStep("labs"),
        children: (
          <div style={{ ...card, marginBottom: 0 }}>
            <div style={card}>
              <h3 style={cardHeading}>How n8n Integration Works</h3>
              <ul style={listStyle}>
                <li>
                  n8n is <strong>opt-in</strong> and part of{" "}
                  <strong>Labs</strong> (experimental features)
                </li>
                <li>
                  It sends event notifications (e.g., &quot;vacancy saved&quot;,
                  &quot;interview scheduled&quot;) to your own n8n webhook URL
                </li>
                <li>
                  n8n is <strong>off by default</strong> and deferred from the
                  current dogfood path — you must enable Labs
                  and configure a webhook URL
                </li>
                <li>
                  No data is sent until you configure and enable the integration
                </li>
              </ul>
            </div>

            <div style={card}>
              <h3 style={cardHeading}>Labs: Experimental Features</h3>
              <p
                style={{
                  fontSize: fontSizes.md,
                  color: colors.textSecondary,
                  margin: 0,
                }}
              >
                Labs features (n8n, guided apply) are{" "}
                <strong>off by default</strong> and not required for core
                functionality. You can ignore Labs completely. Core features —
                parsing, scoring, tracking, cover letters, and export — work
                without Labs.
              </p>
            </div>
            <p style={{ ...stepDesc, margin: 0 }}>
              Go to <strong>Labs</strong> in the sidebar to enable Labs, then
              configure your n8n webhook URL in Settings → n8n. Skip this if you
              don&apos;t use n8n.
            </p>
          </div>
        ),
      })}

      {/* ── Complete button ── */}
      <form onSubmit={handleComplete}>
        <button type="submit" disabled={saving} style={primaryButton}>
          {saving ? "Saving…" : "Got it — Start Using VacancyPilot"}
        </button>
      </form>
    </div>
  );
}

// ── Step render helper ──

function renderStep({
  step,
  isExpanded,
  isDone,
  onToggle,
  children,
}: {
  step: StepDef;
  isExpanded: boolean;
  isDone: boolean;
  onToggle: () => void;
  children: ReactNode;
}): ReactNode {
  const numStyle = isDone
    ? stepNumberDone
    : step.kind === "optional"
      ? stepNumberOptional
      : stepNumber;

  const titleStyle = isDone && !isExpanded ? stepTitleDone : stepTitle;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div style={{ marginBottom: spacing.xl }}>
      <div style={stepRow}>
        <span style={numStyle} aria-hidden="true">
          {isDone ? "✓" : step.number}
        </span>
        <div style={{ flex: 1 }}>
          <div
            role="button"
            tabIndex={0}
            onClick={onToggle}
            onKeyDown={handleKeyDown}
            style={titleStyle}
            aria-expanded={isExpanded}
          >
            {step.title}
            {step.kind === "optional" && !isDone && (
              <span style={chipOptional}>Optional</span>
            )}
            {isDone && !isExpanded && <span style={chipDone}>Done</span>}
          </div>
          {isExpanded && <div style={stepBody}>{children}</div>}
        </div>
      </div>
    </div>
  );
}
