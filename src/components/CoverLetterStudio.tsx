import { useState, useCallback, useEffect, type ReactNode } from "react";
import type {
  CoverLetterMode,
  CoverLetterConstraints,
  CoverLetter,
  CoverLetterVersion,
  DraftProvenance,
  LetterLifecycleState,
} from "@/models";
import { coverLetterRepo } from "@/db/repositories";
import { validateCoverLetter } from "@/services/ai-validation";
import type { LetterValidationResult } from "@/services/ai-validation";
import type { CoverLetterVersion as CoverLetterVersionModel } from "@/models";
import type {
  PreparedCoverLetterAiRequest,
  CoverLetterAiGenerationResult,
} from "@/services";
import {
  previewCoverLetterPayload,
  buildCoverLetterAiCostSummary,
  generateCoverLetterDraft,
} from "@/services";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";

export interface CoverLetterStudioProps {
  jobId?: string;
  profileId?: string;
  resumeId?: string;
}

// ── Mode definitions ─────────────────────────────────────────────────────

interface ModeDef {
  id: CoverLetterMode;
  label: string;
  hint: string;
}

const MODES: ModeDef[] = [
  {
    id: "tg_short",
    label: "TG Short",
    hint: "Короткий Telegram-стиль",
  },
  {
    id: "hh_standard",
    label: "HH Standard",
    hint: "Стандартное письмо для HH",
  },
  {
    id: "confident",
    label: "Confident",
    hint: "Уверенный стиль",
  },
  {
    id: "very_short",
    label: "Very Short",
    hint: "Очень кратко",
  },
  {
    id: "en",
    label: "English",
    hint: "Английская версия",
  },
];

// ── Default constraints per mode ─────────────────────────────────────────

export function defaultConstraintsForMode(
  mode: CoverLetterMode,
): CoverLetterConstraints {
  const isShort = mode === "tg_short" || mode === "very_short";
  return {
    noEmoji: true,
    noMarkdown: true,
    noSpecialChars: false,
    maxChars: isShort ? 500 : 1000,
  };
}

// ── Version builder (pure, testable) ─────────────────────────────────────

export function buildLetterVersion(
  bodyText: string,
  options?: {
    source?: CoverLetterVersion["source"];
    aiProvider?: string;
    aiModel?: string;
    promptVersion?: string;
    lifecycleState?: LetterLifecycleState;
  },
): CoverLetterVersion {
  return {
    bodyText,
    createdAt: new Date().toISOString(),
    source: options?.source ?? "manual_edit",
    aiProvider: options?.aiProvider,
    aiModel: options?.aiModel,
    promptVersion: options?.promptVersion,
    lifecycleState: options?.lifecycleState,
  };
}

// ── Letter ID builder (pure, testable) ───────────────────────────────────

export function buildLetterId(jobId: string, profileId: string): string {
  return `cl_${jobId}_${profileId}_${Date.now()}`;
}

// ── Component ────────────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved" | "error";
type CopyStatus = "idle" | "copied" | "error";

// ── Provenance helpers (pure, exported for tests) ───────────────────────

export function computeProvenance(
  source: CoverLetter["source"],
  isFinal: boolean,
  hasEdits: boolean,
): DraftProvenance {
  if (isFinal) return "final";
  if (source === "ai" && !hasEdits) return "ai_generated";
  return "edited";
}

export function provenanceBadge(provenance: DraftProvenance): {
  label: string;
  color: string;
  bg: string;
  icon: string;
} {
  switch (provenance) {
    case "ai_generated":
      return {
        label: "AI-generated",
        color: "#7b4dff",
        bg: "#f3eeff",
        icon: "🤖",
      };
    case "edited":
      return {
        label: "Edited",
        color: "#e6a817",
        bg: "#fffbed",
        icon: "✏️",
      };
    case "final":
      return {
        label: "Final",
        color: "#2a8",
        bg: "#e8f5e9",
        icon: "✓",
      };
    case "sent":
      return {
        label: "Sent snapshot",
        color: "#2563eb",
        bg: "#eff6ff",
        icon: "✉️",
      };
  }
}

export function CoverLetterStudio({
  jobId,
  profileId,
  resumeId,
}: CoverLetterStudioProps): ReactNode {
  // ── State ──
  const [mode, setMode] = useState<CoverLetterMode>("hh_standard");
  const [constraints, setConstraints] = useState<CoverLetterConstraints>(
    defaultConstraintsForMode("hh_standard"),
  );
  const [bodyText, setBodyText] = useState("");
  const [existingLetter, setExistingLetter] = useState<CoverLetter | null>(
    null,
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [loaded, setLoaded] = useState(false);
  const [provenance, setProvenance] = useState<DraftProvenance>("edited");
  const [showReviewGate, setShowReviewGate] = useState(false);
  const [draftSource, setDraftSource] =
    useState<CoverLetterVersionModel["source"]>("manual_edit");
  const [draftAiProvider, setDraftAiProvider] = useState<string | undefined>();
  const [draftAiModel, setDraftAiModel] = useState<string | undefined>();
  const [draftPromptVersion, setDraftPromptVersion] = useState<
    string | undefined
  >();
  const [aiPreparing, setAiPreparing] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiPrepared, setAiPrepared] =
    useState<PreparedCoverLetterAiRequest | null>(null);
  // Track whether user has edited the text since loading (for provenance)
  const [userEdited, setUserEdited] = useState(false);

  // ── Load existing letter on mount ──
  useEffect(() => {
    if (!jobId || !profileId) {
      setLoaded(true);
      return;
    }

    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const letters = await coverLetterRepo.listByJob(jobId!);
        if (cancelled) return;

        const match = letters.find((l) => l.profileId === profileId) ?? null;
        if (match) {
          setExistingLetter(match);
          setMode(match.mode);
          setConstraints(match.constraints);
          setBodyText(match.bodyText);
          setProvenance(match.provenance ?? "edited");
          setDraftSource(match.source);
          setDraftAiProvider(match.aiProvider);
          setDraftAiModel(match.aiModel);
          setDraftPromptVersion(match.promptVersion);
          setUserEdited(false);
        }
      } catch {
        // Silently fail — user can start fresh
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [jobId, profileId]);

  // ── Validation ──
  const validation: LetterValidationResult = validateCoverLetter(
    bodyText,
    constraints,
  );

  // ── Update provenance when user edits ──
  useEffect(() => {
    if (userEdited && provenance === "ai_generated") {
      setProvenance("edited");
    }
  }, [userEdited, provenance]);

  // ── Mode change → update constraints ──
  const handleModeChange = useCallback((newMode: CoverLetterMode) => {
    setMode(newMode);
    setConstraints(defaultConstraintsForMode(newMode));
    setAiPrepared(null);
    setAiFeedback(null);
  }, []);

  // ── Constraint toggle (boolean constraints only; maxChars has its own handler) ──
  const handleConstraintToggle = useCallback(
    (key: "noEmoji" | "noMarkdown" | "noSpecialChars") => {
      setConstraints((prev) => ({ ...prev, [key]: !prev[key] }));
      setAiPrepared(null);
      setAiFeedback(null);
    },
    [],
  );

  // ── Max chars selector ──
  const handleMaxCharsChange = useCallback((value: 500 | 1000 | undefined) => {
    setConstraints((prev) => ({ ...prev, maxChars: value }));
    setAiPrepared(null);
    setAiFeedback(null);
  }, []);

  // ── Text change ──
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setBodyText(e.target.value);
      setUserEdited(true);
      // Clear copy status when user edits
      if (copyStatus !== "idle") setCopyStatus("idle");
      // Close review gate when user continues editing
      if (showReviewGate) setShowReviewGate(false);
      if (aiFeedback) setAiFeedback(null);
    },
    [aiFeedback, copyStatus, showReviewGate],
  );

  const handlePrepareAi = useCallback(async () => {
    if (!jobId || !profileId) return;

    setAiPreparing(true);
    setAiFeedback(null);

    try {
      const prepared = await previewCoverLetterPayload({
        jobId,
        profileId,
        resumeId,
        mode,
        constraints,
      });
      setAiPrepared(prepared);
    } catch (err: unknown) {
      setAiPrepared(null);
      setAiFeedback(
        err instanceof Error ? err.message : "Failed to prepare AI request.",
      );
    } finally {
      setAiPreparing(false);
    }
  }, [constraints, jobId, mode, profileId, resumeId]);

  const handleGenerateAi = useCallback(async () => {
    if (!jobId || !aiPrepared) return;

    setAiGenerating(true);
    setAiFeedback(null);

    try {
      const generated: CoverLetterAiGenerationResult =
        await generateCoverLetterDraft(aiPrepared, jobId);

      setBodyText(generated.bodyText);
      setDraftSource("ai");
      setDraftAiProvider(generated.provider);
      setDraftAiModel(generated.model);
      setDraftPromptVersion(generated.promptVersion);
      setProvenance("ai_generated");
      setUserEdited(false);
      setAiPrepared(null);
      setAiFeedback(
        generated.fromCache
          ? "AI draft loaded from local cache."
          : "AI draft generated. Review the text before saving or copying.",
      );
    } catch (err: unknown) {
      setAiFeedback(
        err instanceof Error ? err.message : "Failed to generate AI draft.",
      );
    } finally {
      setAiGenerating(false);
    }
  }, [aiPrepared, jobId]);

  // ── Save ──
  const handleSave = useCallback(
    async (isFinal: boolean, markSent = false) => {
      if (!jobId || !profileId) return;

      setSaveStatus("saving");
      setErrorMessage(null);

      try {
        const now = new Date().toISOString();
        const versionSource: CoverLetterVersion["source"] = userEdited
          ? "manual_edit"
          : draftSource;
        const version = buildLetterVersion(bodyText, {
          source: versionSource,
          aiProvider: draftSource === "ai" ? draftAiProvider : undefined,
          aiModel: draftSource === "ai" ? draftAiModel : undefined,
          promptVersion: draftSource === "ai" ? draftPromptVersion : undefined,
          lifecycleState: markSent
            ? "sent"
            : isFinal
              ? "final"
              : userEdited
                ? "edited"
                : draftSource === "ai"
                  ? "generated"
                  : "edited",
        });

        const base = existingLetter ?? {
          id: buildLetterId(jobId, profileId),
          jobId,
          profileId,
          resumeId,
          createdAt: now,
          versions: [] as CoverLetterVersion[],
          aiProvider: undefined,
          aiModel: undefined,
          promptVersion: undefined,
          sentText: undefined,
          sentAt: undefined,
        };

        const letter: CoverLetter = {
          ...base,
          mode,
          constraints,
          bodyText,
          isFinal,
          sentText: markSent ? bodyText : base.sentText,
          sentAt: markSent ? now : base.sentAt,
          source: draftSource,
          aiProvider: draftSource === "ai" ? draftAiProvider : undefined,
          aiModel: draftSource === "ai" ? draftAiModel : undefined,
          promptVersion: draftSource === "ai" ? draftPromptVersion : undefined,
          provenance: markSent ? "sent" : computeProvenance(draftSource, isFinal, userEdited),
          versions: [...base.versions, version],
          updatedAt: now,
        };

        await coverLetterRepo.save(letter);
        setExistingLetter(letter);
        setProvenance(letter.provenance);
        setSaveStatus("saved");

        // Reset status after delay
        setTimeout(() => {
          setSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
        }, 2000);
      } catch (err: unknown) {
        setSaveStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to save letter",
        );
      }
    },
    [
      bodyText,
      constraints,
      draftAiModel,
      draftAiProvider,
      draftPromptVersion,
      draftSource,
      existingLetter,
      jobId,
      mode,
      profileId,
      resumeId,
      userEdited,
    ],
  );

  // ── Copy ──
  const handleCopy = useCallback(async () => {
    if (!bodyText.trim()) return;

    try {
      await navigator.clipboard.writeText(bodyText);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("error");
      setErrorMessage("Failed to copy to clipboard");
    }
  }, [bodyText]);

  // ── Review gate: confirm copy/final when warnings exist ──
  const hasWarningsOrNotes =
    validation.warnings.length > 0 || validation.infoNotes.length > 0;
  const hasBlockers = validation.blockers.length > 0;
  const aiCostSummary = aiPrepared
    ? buildCoverLetterAiCostSummary(aiPrepared)
    : null;

  const handleSaveFinalWithReview = useCallback(() => {
    if (hasWarningsOrNotes && !showReviewGate) {
      setShowReviewGate(true);
      return;
    }
    handleSave(true);
    setShowReviewGate(false);
  }, [hasWarningsOrNotes, showReviewGate, handleSave]);

  const handleCopyWithReview = useCallback(() => {
    if (hasBlockers) return;
    if (hasWarningsOrNotes && !showReviewGate) {
      setShowReviewGate(true);
      return;
    }
    handleCopy();
    setShowReviewGate(false);
  }, [hasBlockers, hasWarningsOrNotes, showReviewGate, handleCopy]);

  const handleSaveSent = useCallback(() => {
    if (hasBlockers) return;
    if (hasWarningsOrNotes && !showReviewGate) {
      setShowReviewGate(true);
      return;
    }
    void handleSave(true, true);
    setShowReviewGate(false);
  }, [handleSave, hasBlockers, hasWarningsOrNotes, showReviewGate]);

  // ── No context → EmptyState ──
  if (!jobId || !profileId) {
    return (
      <EmptyState
        icon="✉️"
        message="Cover Letter Studio"
        description="Open a vacancy page and select a profile to start writing."
      />
    );
  }

  // ── Loading → LoadingState ──
  if (!loaded) {
    return <LoadingState message="Loading cover letter…" />;
  }

  // ── Main render ──
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontSize: 13,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Mode selector */}
      <fieldset
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: 4,
          padding: "8px 10px",
          margin: 0,
        }}
      >
        <legend
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#888",
            padding: "0 4px",
          }}
        >
          Mode
        </legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.hint}
              onClick={() => handleModeChange(m.id)}
              style={{
                padding: "3px 7px",
                fontSize: 11,
                cursor: "pointer",
                border:
                  mode === m.id ? "2px solid #4a90d9" : "2px solid transparent",
                borderRadius: 4,
                background: mode === m.id ? "#f0f6ff" : "#f5f5f5",
                color: mode === m.id ? "#4a90d9" : "#555",
                fontWeight: mode === m.id ? 600 : 400,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Constraints */}
      <fieldset
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: 4,
          padding: "8px 10px",
          margin: 0,
        }}
      >
        <legend
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#888",
            padding: "0 4px",
          }}
        >
          Constraints
        </legend>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          <ConstraintCheckbox
            label="No emoji"
            checked={constraints.noEmoji}
            onChange={() => handleConstraintToggle("noEmoji")}
          />
          <ConstraintCheckbox
            label="No markdown"
            checked={constraints.noMarkdown}
            onChange={() => handleConstraintToggle("noMarkdown")}
          />
          <ConstraintCheckbox
            label="No special chars"
            checked={constraints.noSpecialChars}
            onChange={() => handleConstraintToggle("noSpecialChars")}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <label
              style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap" }}
            >
              Max chars:
            </label>
            <select
              value={constraints.maxChars ?? "none"}
              onChange={(e) => {
                const val = e.target.value;
                handleMaxCharsChange(
                  val === "500" ? 500 : val === "1000" ? 1000 : undefined,
                );
              }}
              style={{
                fontSize: 11,
                padding: "2px 4px",
                border: "1px solid #ccc",
                borderRadius: 3,
                background: "#fff",
              }}
            >
              <option value="500">500</option>
              <option value="1000">1000</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>
      </fieldset>

      {/* Provenance badge */}
      {bodyText.trim() && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            background: provenanceBadge(provenance).bg,
            borderRadius: 4,
            fontSize: 11,
            color: provenanceBadge(provenance).color,
            fontWeight: 500,
          }}
        >
          <span>{provenanceBadge(provenance).icon}</span>
          <span>
            {provenanceBadge(provenance).label}
            {provenance === "ai_generated" &&
              " — отредактируйте перед сохранением"}
            {provenance === "edited" &&
              !existingLetter?.isFinal &&
              " — черновик редактируется"}
          </span>
        </div>
      )}

      <fieldset
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: 4,
          padding: "8px 10px",
          margin: 0,
        }}
      >
        <legend
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#888",
            padding: "0 4px",
          }}
        >
          AI Draft
        </legend>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void handlePrepareAi()}
            disabled={aiPreparing || aiGenerating}
            style={{
              padding: "5px 12px",
              fontSize: 12,
              cursor: aiPreparing || aiGenerating ? "not-allowed" : "pointer",
              border: "1px solid #7b4dff",
              borderRadius: 4,
              background: "#7b4dff",
              color: "#fff",
              fontWeight: 600,
              opacity: aiPreparing || aiGenerating ? 0.6 : 1,
            }}
          >
            {aiPreparing ? "Preparing…" : "Preview AI Payload"}
          </button>

          {aiPrepared && (
            <>
              <button
                type="button"
                onClick={() => void handleGenerateAi()}
                disabled={aiGenerating}
                style={{
                  padding: "5px 12px",
                  fontSize: 12,
                  cursor: aiGenerating ? "not-allowed" : "pointer",
                  border: "1px solid #2a8",
                  borderRadius: 4,
                  background: "#2a8",
                  color: "#fff",
                  fontWeight: 600,
                  opacity: aiGenerating ? 0.6 : 1,
                }}
              >
                {aiGenerating ? "Generating…" : "Generate Draft"}
              </button>

              <button
                type="button"
                onClick={() => setAiPrepared(null)}
                disabled={aiGenerating}
                style={{
                  padding: "5px 12px",
                  fontSize: 12,
                  cursor: aiGenerating ? "not-allowed" : "pointer",
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  background: "#fff",
                  color: "#555",
                }}
              >
                Cancel Preview
              </button>
            </>
          )}
        </div>

        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#666" }}>
          AI stays opt-in. VacancyPilot shows the payload summary before any
          external request and never writes into HH forms.
        </p>

        {aiFeedback && (
          <div
            style={{
              marginTop: 8,
              padding: "8px 10px",
              borderRadius: 4,
              background: aiFeedback.includes("failed") ? "#fff5f5" : "#f5f8ff",
              color: aiFeedback.includes("failed") ? "#c44" : "#345",
              fontSize: 11,
            }}
          >
            {aiFeedback}
          </div>
        )}

        {aiPrepared && (
          <div
            style={{
              marginTop: 10,
              border: "1px solid #d9e3f0",
              borderRadius: 4,
              padding: "8px 10px",
              background: "#f8fbff",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: 11,
            }}
          >
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span>
                <strong>Provider:</strong> {aiPrepared.providerLabel}
              </span>
              <span>
                <strong>Model:</strong> {aiPrepared.model}
              </span>
              <span>
                <strong>Cache:</strong>{" "}
                {aiPrepared.cacheEnabled ? "enabled" : "disabled"}
              </span>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span>
                <strong>Estimated tokens:</strong>{" "}
                {aiPrepared.preview.estimatedTokens}
              </span>
              <span>
                <strong>Estimated chars:</strong>{" "}
                {aiPrepared.preview.totalChars}
              </span>
              <span>
                <strong>Optional API access:</strong>{" "}
                {aiPrepared.optionalOriginGranted
                  ? "already granted"
                  : "browser may ask on confirm"}
              </span>
            </div>

            <div>
              <strong>Included:</strong>{" "}
              {aiPrepared.preview.includedFields
                .map((field) => field.label)
                .join(", ")}
            </div>
            <div>
              <strong>Excluded:</strong>{" "}
              {aiPrepared.preview.excludedFields.join(", ")}
            </div>
            <div>
              <strong>Estimated cost:</strong>{" "}
              {aiCostSummary?.costAvailable
                ? `$${aiCostSummary.totalCostUsd?.toFixed(4)}`
                : "not available for this provider/model"}
            </div>
          </div>
        )}
      </fieldset>

      {/* Text editor */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <textarea
          value={bodyText}
          onChange={handleTextChange}
          placeholder="Write or paste your cover letter here…"
          rows={8}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 10px",
            fontSize: 13,
            fontFamily: "system-ui, -apple-system, sans-serif",
            lineHeight: 1.5,
            border: "1px solid #ccc",
            borderRadius: 4,
            resize: "vertical",
            background: "#fff",
            color: "#333",
          }}
        />

        {/* Character count + validation */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            fontSize: 11,
            gap: 8,
          }}
        >
          <span
            style={{
              color:
                constraints.maxChars && bodyText.length > constraints.maxChars
                  ? "#c44"
                  : "#999",
            }}
          >
            {bodyText.length}
            {constraints.maxChars ? ` / ${constraints.maxChars}` : ""} chars
          </span>

          {/* Validation messages */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              textAlign: "right",
            }}
          >
            {validation.blockers.map((issue, i) => (
              <span key={`blocker-${i}`} style={{ color: "#c44" }}>
                ⛔ {issue}
              </span>
            ))}
            {validation.warnings.map((warn, i) => (
              <span key={`warn-${i}`} style={{ color: "#e6a817" }}>
                ⚡ {warn}
              </span>
            ))}
            {validation.infoNotes.map((note, i) => (
              <span key={`info-${i}`} style={{ color: "#4a90d9" }}>
                ℹ {note}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={saveStatus === "saving" || !bodyText.trim()}
          style={{
            padding: "5px 12px",
            fontSize: 12,
            cursor:
              saveStatus === "saving" || !bodyText.trim()
                ? "not-allowed"
                : "pointer",
            border: "1px solid #4a90d9",
            borderRadius: 4,
            background: "#4a90d9",
            color: "#fff",
            fontWeight: 600,
            opacity: saveStatus === "saving" || !bodyText.trim() ? 0.6 : 1,
          }}
        >
          {saveStatus === "saving" ? "Saving…" : "Save Draft"}
        </button>

        <button
          type="button"
          onClick={handleSaveSent}
          disabled={saveStatus === "saving" || !bodyText.trim() || hasBlockers || !!existingLetter?.sentAt}
          title="Явно сохранить текст, который был фактически отправлен. Копирование не меняет статус."
          style={{
            padding: "5px 12px", fontSize: 12,
            cursor: saveStatus === "saving" || !bodyText.trim() || hasBlockers || !!existingLetter?.sentAt ? "not-allowed" : "pointer",
            border: "1px solid #2563eb", borderRadius: 4, background: "#2563eb", color: "#fff", fontWeight: 600,
            opacity: saveStatus === "saving" || !bodyText.trim() || hasBlockers || !!existingLetter?.sentAt ? 0.6 : 1,
          }}
        >
          {existingLetter?.sentAt ? "Sent snapshot saved" : "Save as actually sent"}
        </button>

        <button
          type="button"
          onClick={handleSaveFinalWithReview}
          disabled={saveStatus === "saving" || !bodyText.trim() || hasBlockers}
          title={
            hasBlockers
              ? "Исправьте ошибки перед сохранением финальной версии"
              : hasWarningsOrNotes
                ? "Есть замечания — нажмите для просмотра"
                : "Сохранить как финальную версию"
          }
          style={{
            padding: "5px 12px",
            fontSize: 12,
            cursor:
              saveStatus === "saving" || !bodyText.trim() || hasBlockers
                ? "not-allowed"
                : "pointer",
            border: "1px solid #2a8",
            borderRadius: 4,
            background: "#2a8",
            color: "#fff",
            fontWeight: 600,
            opacity:
              saveStatus === "saving" || !bodyText.trim() || hasBlockers
                ? 0.6
                : 1,
          }}
        >
          Save Final
          {hasWarningsOrNotes && !hasBlockers && " ⚡"}
        </button>

        <button
          type="button"
          onClick={handleCopyWithReview}
          disabled={!bodyText.trim() || hasBlockers}
          title={
            hasBlockers
              ? "Исправьте ошибки перед копированием"
              : hasWarningsOrNotes
                ? "Есть замечания — нажмите для просмотра"
                : "Скопировать в буфер обмена"
          }
          style={{
            padding: "5px 12px",
            fontSize: 12,
            cursor: !bodyText.trim() || hasBlockers ? "not-allowed" : "pointer",
            border: "1px solid #ccc",
            borderRadius: 4,
            background: copyStatus === "copied" ? "#e8f5e9" : "#fff",
            color: copyStatus === "copied" ? "#2a8" : "#555",
            fontWeight: 500,
            opacity: !bodyText.trim() || hasBlockers ? 0.6 : 1,
          }}
        >
          {copyStatus === "copied" ? "✓ Copied" : "Copy"}
          {hasWarningsOrNotes && !hasBlockers && " ⚡"}
        </button>

        {/* Save status feedback */}
        {saveStatus === "saved" && (
          <span style={{ color: "#2a8", fontSize: 11, fontWeight: 500 }}>
            ✓ Saved
          </span>
        )}
        {saveStatus === "error" && errorMessage && (
          <span style={{ color: "#c44", fontSize: 11 }}>{errorMessage}</span>
        )}
        {copyStatus === "error" && errorMessage && (
          <span style={{ color: "#c44", fontSize: 11 }}>{errorMessage}</span>
        )}
      </div>

      {/* Review gate panel */}
      {showReviewGate && !hasBlockers && (
        <div
          style={{
            border: "1px solid #e6a817",
            borderRadius: 4,
            padding: "8px 10px",
            background: "#fffbed",
            fontSize: 12,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: "#8a6d14",
              marginBottom: 6,
            }}
          >
            ⚡ Перед продолжением проверьте замечания:
          </div>
          <ul
            style={{
              margin: "0 0 8px 0",
              paddingLeft: 18,
              color: "#8a6d14",
              fontSize: 11,
              lineHeight: 1.6,
            }}
          >
            {validation.warnings.map((w, i) => (
              <li key={`review-warn-${i}`}>{w}</li>
            ))}
            {validation.infoNotes.map((n, i) => (
              <li key={`review-info-${i}`} style={{ color: "#4a90d9" }}>
                {n}
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                handleSave(true);
                setShowReviewGate(false);
              }}
              style={{
                padding: "3px 10px",
                fontSize: 11,
                cursor: "pointer",
                border: "1px solid #2a8",
                borderRadius: 3,
                background: "#2a8",
                color: "#fff",
                fontWeight: 600,
              }}
            >
              Всё равно сохранить
            </button>
            <button
              type="button"
              onClick={() => setShowReviewGate(false)}
              style={{
                padding: "3px 10px",
                fontSize: 11,
                cursor: "pointer",
                border: "1px solid #ccc",
                borderRadius: 3,
                background: "#fff",
                color: "#555",
              }}
            >
              Вернуться к редактированию
            </button>
          </div>
        </div>
      )}

      {/* Existing letter indicator */}
      {existingLetter && (
        <div
          style={{
            padding: "4px 8px",
            background: "#f5f5f5",
            borderRadius: 4,
            fontSize: 11,
            color: "#888",
          }}
        >
          {existingLetter.isFinal
            ? `Final version saved at ${new Date(existingLetter.updatedAt).toLocaleString()}`
            : `Draft saved at ${new Date(existingLetter.updatedAt).toLocaleString()}`}
          {existingLetter.source === "ai" &&
            !existingLetter.isFinal &&
            ` · Source: AI`}
        </div>
      )}

      {existingLetter && existingLetter.versions.length > 0 && (
        <div style={{ fontSize: 11, color: "#666" }}>
          Versions: {existingLetter.versions.map((version) => version.lifecycleState ?? "edited").join(" → ")}
          {existingLetter.sentAt && " · Sent is immutable"}
        </div>
      )}
    </div>
  );
}

// ── Constraint checkbox helper ───────────────────────────────────────────

function ConstraintCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}): ReactNode {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        color: "#555",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ margin: 0, cursor: "pointer" }}
      />
      {label}
    </label>
  );
}
