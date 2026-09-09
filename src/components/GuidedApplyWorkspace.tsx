import { useState, useCallback, useEffect, type ReactNode } from "react";
import {
  checkGuidedApplyGate,
  checkGuidedApplyMutationGate,
  recordLabsAction,
} from "@/services/labs-control";
import { NATIVE_HH_SUBMISSION_CONFIRMATION } from "@/services/applied-confirmation";
import { profileRepo, resumeRepo, coverLetterRepo } from "@/db/repositories";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import type { Job } from "@/models/job";
import type { Profile } from "@/models/profile";
import type { Resume } from "@/models/resume";
import type { CoverLetter } from "@/models/cover-letter";

// ── Types ──────────────────────────────────────────────────────────────────

type StepId =
  | "open-form"
  | "copy-letter"
  | "paste-letter"
  | "select-resume"
  | "review-application";

interface ApplyStep {
  id: StepId;
  label: string;
  description: string;
}

const APPLY_STEPS: ApplyStep[] = [
  {
    id: "open-form",
    label: "1. Open the HH application form",
    description:
      'On the vacancy page, click the native HH "Откликнуться" button to open the application form.',
  },
  {
    id: "copy-letter",
    label: "2. Copy your cover letter",
    description:
      "Use the copy button below to prepare your cover letter text for pasting.",
  },
  {
    id: "paste-letter",
    label: "3. Paste into HH form",
    description:
      "Paste your cover letter into the HH cover letter field manually. The extension does not fill forms for you.",
  },
  {
    id: "select-resume",
    label: "4. Select your resume on HH",
    description:
      "Choose the recommended resume from the HH resume selector dropdown.",
  },
  {
    id: "review-application",
    label: "5. Review the application on HH",
    description:
      'Review the completed form, then click the native HH "Откликнуться" button yourself. VacancyPilot cannot see or click it.',
  },
];

// ── Clipboard helper ───────────────────────────────────────────────────────

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers or insecure contexts
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}

// ── Component ──────────────────────────────────────────────────────────────

interface GuidedApplyWorkspaceProps {
  jobId: string;
  job?: Job;
  profileId?: string;
  resumeId?: string;
  onRefresh: () => void;
}

export function GuidedApplyWorkspace({
  jobId,
  job,
  profileId,
  resumeId,
  onRefresh,
}: GuidedApplyWorkspaceProps): ReactNode {
  const [loading, setLoading] = useState(true);
  const [labsAllowed, setLabsAllowed] = useState(false);
  const [labsReason, setLabsReason] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [letter, setLetter] = useState<CoverLetter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());
  const [copySuccess, setCopySuccess] = useState(false);
  const [markingApplied, setMarkingApplied] = useState(false);
  const [markedApplied, setMarkedApplied] = useState(false);

  // ── Init: check Labs gate + load data ──

  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      try {
        // 1. Check Labs gate
        const result = await checkGuidedApplyMutationGate();
        if (cancelled) return;
        setLabsAllowed(result.allowed);

        if (!result.allowed) {
          setLabsReason(result.reason);
          setLoading(false);
          return;
        }

        // 2. Load profile
        if (profileId) {
          const p = await profileRepo.getById(profileId);
          if (!cancelled) setProfile(p ?? null);
        }

        // 3. Load resume
        if (resumeId) {
          const r = await resumeRepo.getById(resumeId);
          if (!cancelled) setResume(r ?? null);
        }

        // 4. Load latest cover letter for this job
        const letters = await coverLetterRepo.listByJob(jobId);
        if (!cancelled) {
          const finalLetter = letters.find((l) => l.isFinal);
          setLetter(finalLetter ?? letters[0] ?? null);
        }

        // 5. Log workspace open
        void recordLabsAction("guided_apply_started", {
          jobId,
          vacancyUrl: job?.sourceUrl,
        });
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load apply workspace",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [jobId, profileId, resumeId, job?.sourceUrl]);

  // ── Toggle step completion ──

  const handleToggleStep = useCallback(
    (stepId: StepId) => {
      setCompletedSteps((prev) => {
        const next = new Set(prev);
        if (next.has(stepId)) {
          next.delete(stepId);
        } else {
          next.add(stepId);
          void recordLabsAction("guided_apply_step", {
            jobId,
            stepId,
          });
        }
        return next;
      });
    },
    [jobId],
  );

  // ── Copy cover letter ──

  const handleCopyLetter = useCallback(async () => {
    if (!letter?.bodyText) return;
    const gate = await checkGuidedApplyGate();
    if (!gate.allowed) {
      setError(gate.reason);
      return;
    }
    const ok = await copyToClipboard(letter.bodyText);
    if (ok) {
      setCopySuccess(true);
      setCompletedSteps((prev) => {
        const next = new Set(prev);
        next.add("copy-letter");
        return next;
      });
      void recordLabsAction("guided_apply_step", {
        jobId,
        stepId: "copy-letter",
        copiedToClipboard: true,
        countsTowardBudget: true,
      });
      setTimeout(() => setCopySuccess(false), 2500);
    }
  }, [letter?.bodyText, jobId]);

  // ── Confirm native submission and mark as applied ──

  const handleMarkApplied = useCallback(async () => {
    if (!jobId || markingApplied || markedApplied) return;
    if (!APPLY_STEPS.every((step) => completedSteps.has(step.id))) {
      setError("Complete the preparation checklist before confirming Applied.");
      return;
    }
    if (!window.confirm(`${NATIVE_HH_SUBMISSION_CONFIRMATION}. Confirm local tracking?`)) {
      return;
    }

    setMarkingApplied(true);
    try {
      const mutationGate = await checkGuidedApplyMutationGate();
      if (!mutationGate.allowed) {
        setError(mutationGate.reason);
        return;
      }
      // Update status via background service worker
      const response: { success: boolean; error?: string } =
        await chrome.runtime.sendMessage({
          type: "MARK_APPLIED",
          jobId,
          preparationComplete: true,
          nativeSubmissionConfirmed: true,
        });

      if (response?.success) {
        setMarkedApplied(true);
        // Refresh parent context
        setTimeout(onRefresh, 500);
      } else {
        setError(response?.error ?? "Failed to mark as applied");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark as applied");
    } finally {
      setMarkingApplied(false);
    }
  }, [completedSteps, jobId, markingApplied, markedApplied, onRefresh]);

  // ── Render states ──

  if (loading) return <LoadingState />;
  if (error)
    return <ErrorState message={error} onRetry={() => setError(null)} />;

  if (!labsAllowed) {
    return (
      <EmptyState
        icon="🧪"
        message="Guided Apply — Labs Feature"
        description={labsReason}
      />
    );
  }

  if (!job) {
    return (
      <EmptyState
        icon="📋"
        message="No vacancy loaded"
        description="Save this vacancy from the popup first."
      />
    );
  }

  // ── Already applied? ──

  if (markedApplied || job.status === "applied") {
    return (
      <div style={workspaceStyle}>
        <h2 style={headingStyle}>Guided Apply</h2>
        <div
          style={{
            padding: "14px 16px",
            background: "#e6f7e6",
            border: "1px solid #2a8",
            borderRadius: 6,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#2a8",
              marginBottom: 6,
            }}
          >
            ✅ Applied
          </div>
          <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>
            This vacancy has been marked as applied in your local tracker. You
            can track HR communication in the HR tab.
          </div>
        </div>
      </div>
    );
  }

  const allStepsDone = APPLY_STEPS.every((s) => completedSteps.has(s.id));
  const completedCount = completedSteps.size;
  const totalSteps = APPLY_STEPS.length;

  // ── Resume recommendation ──

  const recommendedResume = resume;
  const profilesResume = profile?.defaultResumeId;

  return (
    <div style={workspaceStyle}>
      <h2 style={headingStyle}>Guided Apply</h2>

      <p style={{ fontSize: 11, color: "#999", margin: "0 0 16px" }}>
        Clipboard-only workflow. The extension does not fill HH forms or click
        submit for you. Every HH action is manual and visible.
      </p>

      {/* ── Progress indicator ── */}
      <div
        style={{
          padding: "8px 12px",
          background: "#f0f7ff",
          border: "1px solid #d0e0f0",
          borderRadius: 6,
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "#4a90d9" }}>
          {completedCount} of {totalSteps} steps complete
        </span>
        <div
          style={{
            flex: 1,
            height: 6,
            background: "#e0e0e0",
            borderRadius: 3,
            marginLeft: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.round((completedCount / totalSteps) * 100)}%`,
              background: "#2a8",
              borderRadius: 3,
              transition: "width 0.3s",
            }}
          />
        </div>
      </div>

      {/* ── Resume Recommendation ── */}
      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>📄 Resume Recommendation</div>
        {recommendedResume ? (
          <div style={{ fontSize: 12, color: "#333", marginTop: 6 }}>
            <strong>{recommendedResume.title}</strong>
            {recommendedResume.hhResumeId && (
              <span style={{ color: "#999", marginLeft: 8 }}>
                HH ID: {recommendedResume.hhResumeId}
              </span>
            )}
            {recommendedResume.skills.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {recommendedResume.skills.slice(0, 5).map((s) => (
                  <span
                    key={s}
                    style={{
                      display: "inline-block",
                      padding: "2px 7px",
                      borderRadius: 3,
                      fontSize: 10,
                      background: "#e6f0ff",
                      color: "#4a90d9",
                      marginRight: 4,
                      marginBottom: 2,
                    }}
                  >
                    {s}
                  </span>
                ))}
                {recommendedResume.skills.length > 5 && (
                  <span style={{ fontSize: 10, color: "#999" }}>
                    +{recommendedResume.skills.length - 5} more
                  </span>
                )}
              </div>
            )}
          </div>
        ) : profilesResume ? (
          <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>
            Profile recommends a resume. Set it up in the Profile tab.
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>
            No resume selected. Choose one in the Profile tab.
          </div>
        )}
      </div>

      {/* ── Cover Letter Copy Block ── */}
      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>✉️ Cover Letter</div>
        {letter?.bodyText ? (
          <div>
            <div
              style={{
                maxHeight: 120,
                overflow: "auto",
                padding: "8px 10px",
                background: "#f9f9f9",
                border: "1px solid #e0e0e0",
                borderRadius: 4,
                fontSize: 11,
                color: "#555",
                whiteSpace: "pre-wrap",
                margin: "8px 0",
                lineHeight: 1.5,
              }}
            >
              {letter.bodyText.slice(0, 500)}
              {letter.bodyText.length > 500 && "…"}
            </div>
            <button
              type="button"
              onClick={handleCopyLetter}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                cursor: "pointer",
                border: "1px solid #4a90d9",
                borderRadius: 4,
                background: copySuccess ? "#e6f7e6" : "#4a90d9",
                color: copySuccess ? "#2a8" : "#fff",
                fontWeight: 600,
              }}
            >
              {copySuccess ? "✓ Copied!" : "📋 Copy to clipboard"}
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>
            No cover letter yet. Generate one in the Letter tab first.
          </div>
        )}
      </div>

      {/* ── Field Guidance ── */}
      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>💡 Field Guidance</div>
        <div
          style={{ fontSize: 11, color: "#666", marginTop: 6, lineHeight: 1.5 }}
        >
          <p style={{ margin: "4px 0" }}>
            <strong>Cover Letter field:</strong> Usually a textarea below the
            resume selector. Paste your letter there.
          </p>
          <p style={{ margin: "4px 0" }}>
            <strong>Resume selector:</strong> Dropdown at the top of the form.
            Select your most relevant resume.
          </p>
          <p style={{ margin: "4px 0" }}>
            <strong>Submit button:</strong> The native HH "Откликнуться" button
            is at the bottom of the form. Only you click it.
          </p>
        </div>
      </div>

      {/* ── Apply Checklist ── */}
      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>
          ✅ Apply Checklist
          <span style={{ fontWeight: 400, color: "#999", marginLeft: 8 }}>
            {completedCount}/{totalSteps}
          </span>
        </div>
        <div style={{ marginTop: 8 }}>
          {APPLY_STEPS.map((step) => {
            const done = completedSteps.has(step.id);
            return (
              <div
                key={step.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid #f5f5f5",
                  cursor: "pointer",
                  opacity: done ? 0.7 : 1,
                }}
                onClick={() => {
                  handleToggleStep(step.id);
                }}
              >
                {/* Checkbox */}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    border: done ? "none" : "2px solid #ccc",
                    background: done ? "#2a8" : "#fff",
                    color: done ? "#fff" : "transparent",
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: 0,
                  }}
                >
                  {done ? "✓" : ""}
                </span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: done ? 400 : 600,
                      color: done ? "#999" : "#333",
                      textDecoration: done ? "line-through" : "none",
                    }}
                  >
                    {step.label}
                  </div>
                  <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                    {step.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Explicit native-submission confirmation ── */}
      <button
        type="button"
        onClick={handleMarkApplied}
        disabled={markingApplied || !allStepsDone}
        style={{
          width: "100%",
          padding: "10px 16px",
          fontSize: 13,
          cursor: markingApplied || !allStepsDone ? "not-allowed" : "pointer",
          border: "none",
          borderRadius: 6,
          background: markingApplied || !allStepsDone ? "#ccc" : "#2a8",
          color: "#fff",
          fontWeight: 700,
          marginTop: 8,
          opacity: markingApplied || !allStepsDone ? 0.6 : 1,
        }}
      >
        {markingApplied
          ? "Updating…"
          : markedApplied
            ? "✓ Marked as Applied"
            : "✅ I submitted this application on HH — mark Applied"}
      </button>

      <div
        style={{
          fontSize: 10,
          color: "#999",
          textAlign: "center",
          marginTop: 6,
        }}
      >
        This is a separate explicit confirmation. It only updates your local tracker and never interacts with HH.
      </div>

      {/* ── All done message ── */}
      {allStepsDone && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 16px",
            background: "#e6f7e6",
            border: "1px solid #2a8",
            borderRadius: 6,
            fontSize: 13,
            color: "#2a8",
          }}
        >
          Preparation complete. After you submit on HH, use the explicit confirmation above to record Applied locally.
        </div>
      )}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────

const workspaceStyle: React.CSSProperties = {
  padding: "0 4px",
};

const headingStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  margin: "0 0 4px",
  color: "#1a3a5c",
};

const sectionStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: "#fafafa",
  border: "1px solid #e8e8e8",
  borderRadius: 6,
  marginBottom: 10,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#555",
};
