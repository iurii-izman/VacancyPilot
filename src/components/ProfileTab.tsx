import { useState, useCallback, useEffect, type ReactNode } from "react";
import { jobRepo, profileRepo, resumeRepo } from "@/db/repositories";
import { loadSettings, saveSettings } from "@/db/settings-bridge";
import { recomputeScoreForJob } from "@/services/score-recompute";
import type { Job } from "@/models/job";
import type { Profile } from "@/models/profile";
import type { Resume } from "@/models/resume";
import type { AppSettings } from "@/models/settings";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { ErrorState } from "./ErrorState";

interface ProfileTabProps {
  jobId?: string;
  job?: Job;
  profileId?: string;
  resumeId?: string;
  onProfileChange?: (profileId: string) => void;
  onResumeChange?: (resumeId: string) => void;
}

export function ProfileTab({
  jobId,
  job: initialJob,
  profileId: initialProfileId,
  resumeId: initialResumeId,
  onProfileChange,
  onResumeChange,
}: ProfileTabProps): ReactNode {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [defaultProfileId, setDefaultProfileId] = useState<
    string | undefined
  >();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Local tracking of selected IDs so UI updates immediately
  const [selectedProfileId, setSelectedProfileId] = useState<
    string | undefined
  >(initialProfileId);
  const [selectedResumeId, setSelectedResumeId] = useState<string | undefined>(
    initialResumeId,
  );

  // Sync external changes
  useEffect(() => {
    setSelectedProfileId(initialProfileId);
  }, [initialProfileId]);

  useEffect(() => {
    setSelectedResumeId(initialResumeId);
  }, [initialResumeId]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [profileList, resumeList, settings] = await Promise.all([
        profileRepo.list(),
        resumeRepo.list(),
        loadSettings(),
      ]);
      setProfiles(profileList);
      setResumes(resumeList);
      setDefaultProfileId(settings.general.defaultProfileId);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSelectProfile = useCallback(
    async (profileId: string) => {
      if (!jobId) return;
      setSaving(true);
      setError(null);
      setSelectedProfileId(profileId);
      try {
        const job = initialJob ?? (await jobRepo.getById(jobId));
        if (!job) {
          setError("Job not found in local database. Save the vacancy first.");
          return;
        }
        // Save the profile selection first.
        const updated: Job = {
          ...job,
          selectedProfileId: profileId,
          selectedResumeId: undefined,
          updatedAt: new Date().toISOString(),
        };
        await jobRepo.save(updated);

        // Recompute score with the newly selected profile.
        // This also persists badge state so the content script picks up the new score.
        await recomputeScoreForJob(jobId, profileId);

        setSelectedResumeId(undefined);
        onProfileChange?.(profileId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to select profile");
      } finally {
        setSaving(false);
      }
    },
    [jobId, initialJob, onProfileChange],
  );

  const handleSelectResume = useCallback(
    async (resumeId: string) => {
      if (!jobId) return;
      setSaving(true);
      setError(null);
      setSelectedResumeId(resumeId);
      try {
        const job = initialJob ?? (await jobRepo.getById(jobId));
        if (!job) {
          setError("Job not found in local database. Save the vacancy first.");
          return;
        }
        const updated: Job = {
          ...job,
          selectedResumeId: resumeId,
          updatedAt: new Date().toISOString(),
        };
        await jobRepo.save(updated);
        onResumeChange?.(resumeId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to select resume");
      } finally {
        setSaving(false);
      }
    },
    [jobId, initialJob, onResumeChange],
  );

  const handleSetDefaultProfile = useCallback(async (profileId: string) => {
    try {
      const settings: AppSettings = await loadSettings();
      settings.general.defaultProfileId = profileId;
      await saveSettings(settings);
      setDefaultProfileId(profileId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set default");
    }
  }, []);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);
  const profileResumes = resumes.filter(
    (r) => r.profileId === selectedProfileId,
  );

  if (loading) return <LoadingState message="Loading profiles..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  if (profiles.length === 0) {
    return (
      <EmptyState
        icon="👤"
        message="No profiles yet"
        description="Create a profile here to enable local scoring and letter workflows."
      />
    );
  }

  if (!jobId) {
    return (
      <EmptyState
        icon="👤"
        message="Open a vacancy page"
        description="Navigate to an HH.ru vacancy to assign a profile."
      />
    );
  }

  return (
    <div>
      {/* Current profile */}
      <div
        style={{
          padding: "10px 12px",
          border: "1px solid #e0e0e0",
          borderRadius: 6,
          background: "#f9f9f9",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#888",
            marginBottom: 4,
          }}
        >
          CURRENT PROFILE
        </div>
        {selectedProfile ? (
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {selectedProfile.name}
            </div>
            {selectedProfile.targetTitles.length > 0 && (
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                {selectedProfile.targetTitles.slice(0, 3).join(", ")}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#999" }}>No profile selected</div>
        )}
      </div>

      {/* Profile selector */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#555",
            marginBottom: 6,
          }}
        >
          Select profile
        </div>
        {profiles.map((p) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 10px",
              border:
                p.id === selectedProfileId
                  ? "1px solid #4a90d9"
                  : "1px solid #e0e0e0",
              borderRadius: 4,
              marginBottom: 4,
              background: p.id === selectedProfileId ? "#f0f6ff" : "#fff",
              cursor: "pointer",
            }}
            onClick={() => handleSelectProfile(p.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleSelectProfile(p.id);
            }}
          >
            <div style={{ flex: 1 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: p.id === selectedProfileId ? 600 : 400,
                }}
              >
                {p.name}
              </span>
              {p.id === defaultProfileId && (
                <span
                  style={{
                    display: "inline-block",
                    padding: "1px 5px",
                    fontSize: 9,
                    fontWeight: 600,
                    borderRadius: 3,
                    background: "#e6f7e6",
                    color: "#2a8",
                    marginLeft: 6,
                  }}
                >
                  default
                </span>
              )}
            </div>
            {p.id !== defaultProfileId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSetDefaultProfile(p.id);
                }}
                style={{
                  padding: "2px 6px",
                  fontSize: 10,
                  cursor: "pointer",
                  border: "1px solid #ddd",
                  borderRadius: 3,
                  background: "#fff",
                  color: "#888",
                }}
              >
                Set default
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Resume selector */}
      {selectedProfileId && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#555",
              marginBottom: 6,
            }}
          >
            Select resume
          </div>
          {profileResumes.length === 0 ? (
            <p style={{ fontSize: 12, color: "#888" }}>
              No resumes for this profile. Add one in Candidate → Resume.
            </p>
          ) : (
            profileResumes.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "6px 10px",
                  border:
                    r.id === selectedResumeId
                      ? "1px solid #4a90d9"
                      : "1px solid #e0e0e0",
                  borderRadius: 4,
                  marginBottom: 4,
                  background: r.id === selectedResumeId ? "#f0f6ff" : "#fff",
                  cursor: "pointer",
                }}
                onClick={() => handleSelectResume(r.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    handleSelectResume(r.id);
                }}
              >
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: r.id === selectedResumeId ? 600 : 400,
                    }}
                  >
                    {r.title}
                  </span>
                  <span style={{ fontSize: 10, color: "#888", marginLeft: 6 }}>
                    {r.language === "ru"
                      ? "Рус"
                      : r.language === "en"
                        ? "Eng"
                        : "Ro"}
                  </span>
                  {r.isDefault && (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "1px 5px",
                        fontSize: 9,
                        fontWeight: 600,
                        borderRadius: 3,
                        background: "#e6f0ff",
                        color: "#4a90d9",
                        marginLeft: 6,
                      }}
                    >
                      default
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {saving && (
        <div style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}>
          Saving...
        </div>
      )}
    </div>
  );
}
