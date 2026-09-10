import {
  useState,
  useCallback,
  useEffect,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  profileRepo,
  jobRepo,
  coverLetterRepo,
  resumeRepo,
} from "@/db/repositories";
import { db } from "@/db/database";
import { loadSettings, saveSettings } from "@/db/settings-bridge";
import { withWriteGuard } from "@/services/reset-guard";
import type { Profile, SeniorityLevel } from "@/models/profile";
import { SENIORITY_LEVELS } from "@/models/profile";
import type { AppSettings } from "@/models/settings";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

// ── ID generation ──

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Form data type ──

interface ProfileFormData {
  name: string;
  summary: string;
  targetTitlesRaw: string;
  mustHaveSkillsRaw: string;
  niceToHaveSkillsRaw: string;
  avoidKeywordsRaw: string;
  workModeRemote: boolean;
  workModeHybrid: boolean;
  workModeOffice: boolean;
  preferredCitiesRaw: string;
  salaryExpectationMin: string;
  salaryCurrency: string;
  experienceYears: string;
  seniority: SeniorityLevel | "";
}

const EMPTY_FORM: ProfileFormData = {
  name: "",
  summary: "",
  targetTitlesRaw: "",
  mustHaveSkillsRaw: "",
  niceToHaveSkillsRaw: "",
  avoidKeywordsRaw: "",
  workModeRemote: true,
  workModeHybrid: true,
  workModeOffice: false,
  preferredCitiesRaw: "",
  salaryExpectationMin: "",
  salaryCurrency: "RUB",
  experienceYears: "",
  seniority: "",
};

function profileToForm(p: Profile): ProfileFormData {
  return {
    name: p.name,
    summary: p.summary,
    targetTitlesRaw: p.targetTitles.join(", "),
    mustHaveSkillsRaw: p.mustHaveSkills.join(", "),
    niceToHaveSkillsRaw: p.niceToHaveSkills.join(", "),
    avoidKeywordsRaw: p.avoidKeywords.join(", "),
    workModeRemote: p.preferredWorkModes.includes("remote"),
    workModeHybrid: p.preferredWorkModes.includes("hybrid"),
    workModeOffice: p.preferredWorkModes.includes("office"),
    preferredCitiesRaw: (p.preferredCities ?? []).join(", "),
    salaryExpectationMin: p.salaryExpectationMin?.toString() ?? "",
    salaryCurrency: p.salaryCurrency ?? "RUB",
    experienceYears: p.experienceYears?.toString() ?? "",
    seniority: p.seniority ?? "",
  };
}

function formToProfile(form: ProfileFormData, existing?: Profile): Profile {
  const now = new Date().toISOString();
  const workModes: ("remote" | "hybrid" | "office")[] = [];
  if (form.workModeRemote) workModes.push("remote");
  if (form.workModeHybrid) workModes.push("hybrid");
  if (form.workModeOffice) workModes.push("office");

  const parseList = (raw: string): string[] =>
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  return {
    id: existing?.id ?? generateId("profile"),
    name: form.name.trim(),
    summary: form.summary.trim(),
    targetTitles: parseList(form.targetTitlesRaw),
    mustHaveSkills: parseList(form.mustHaveSkillsRaw),
    niceToHaveSkills: parseList(form.niceToHaveSkillsRaw),
    avoidKeywords: parseList(form.avoidKeywordsRaw),
    preferredWorkModes: workModes,
    preferredCities: parseList(form.preferredCitiesRaw),
    salaryExpectationMin: form.salaryExpectationMin.trim()
      ? (() => {
          const n = Number(form.salaryExpectationMin.trim());
          return Number.isNaN(n) || n < 0 ? undefined : n;
        })()
      : undefined,
    salaryCurrency: form.salaryCurrency || undefined,
    experienceYears: form.experienceYears.trim()
      ? (() => {
          const n = Number(form.experienceYears.trim());
          return Number.isNaN(n) || n < 0 ? undefined : n;
        })()
      : undefined,
    seniority: (SENIORITY_LEVELS as readonly string[]).includes(form.seniority)
      ? (form.seniority as SeniorityLevel)
      : undefined,
    defaultResumeId: existing?.defaultResumeId,
    letterPrefs: existing?.letterPrefs ?? {
      defaultMode: "tg_short",
      defaultConstraints: {
        noEmoji: false,
        noMarkdown: false,
        noSpecialChars: false,
      },
    },
    scoringWeights: existing?.scoringWeights,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

// ── Styles ──

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 4,
};

const sectionDesc: React.CSSProperties = {
  fontSize: 12,
  color: "#888",
  marginBottom: 16,
};

const listItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 10px",
  border: "1px solid #e0e0e0",
  borderRadius: 4,
  marginBottom: 6,
  background: "#fafafa",
  flexWrap: "wrap",
  gap: 6,
};

const btnSmall: React.CSSProperties = {
  padding: "3px 8px",
  fontSize: 11,
  cursor: "pointer",
  border: "1px solid #ddd",
  borderRadius: 3,
  background: "#fff",
  color: "#555",
  marginLeft: 4,
};

const btnPrimary: React.CSSProperties = {
  ...btnSmall,
  background: "#4a90d9",
  color: "#fff",
  border: "1px solid #4a90d9",
};

const btnDanger: React.CSSProperties = {
  ...btnSmall,
  color: "#c44",
  border: "1px solid #fcc",
};

const formGroup: React.CSSProperties = {
  marginBottom: 10,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#555",
  marginBottom: 3,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  padding: "5px 8px",
  fontSize: 12,
  border: "1px solid #ddd",
  borderRadius: 3,
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 96,
  resize: "vertical",
};

const checkboxLabel: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  marginRight: 12,
  cursor: "pointer",
};

const badge: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 6px",
  fontSize: 10,
  fontWeight: 600,
  borderRadius: 3,
  background: "#e6f7e6",
  color: "#2a8",
  marginLeft: 6,
};

// ── Component ──

export function ProfileManager(): ReactNode {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [defaultProfileId, setDefaultProfileId] = useState<
    string | undefined
  >();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [list, settings] = await Promise.all([
        profileRepo.list(),
        loadSettings(),
      ]);
      setProfiles(list);
      setDefaultProfileId(settings.general.defaultProfileId);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profiles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSetDefault = useCallback(async (id: string) => {
    try {
      const settings: AppSettings = await loadSettings();
      settings.general.defaultProfileId = id;
      await saveSettings(settings);
      setDefaultProfileId(id);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to set default profile",
      );
    }
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      if (
        !confirm(
          "Delete this profile? This will also remove linked resumes and clear profile references from saved vacancies.",
        )
      )
        return;
      try {
        // 1. Delete linked resumes (they depend on the profile).
        const linkedResumes = await resumeRepo.listByProfile(id);
        for (const resume of linkedResumes) {
          await resumeRepo.delete(resume.id);
        }

        // 2. Clear selectedProfileId on jobs that reference this profile.
        const allJobs = await jobRepo.list();
        for (const job of allJobs) {
          if (job.selectedProfileId === id) {
            job.selectedProfileId = undefined;
            await jobRepo.save(job);
          }
        }

        // 3. Clear profileId on cover letters that reference this profile.
        //    Cover letters without a valid profile are still editable.
        const allLetters = await db.coverLetters.toArray();
        for (const letter of allLetters) {
          if (letter.profileId === id) {
            letter.profileId = undefined;
            await coverLetterRepo.save(letter);
          }
        }

        // 4. Clear profileId on applications that reference this profile.
        const allApplications = await db.applications.toArray();
        for (const app of allApplications) {
          if (app.profileId === id) {
            app.profileId = undefined;
            app.updatedAt = new Date().toISOString();
            await withWriteGuard(() => db.applications.put(app));
          }
        }

        // 5. Delete the profile itself.
        await profileRepo.delete(id);

        // 6. Clear default profile in settings if it was this one.
        if (defaultProfileId === id) {
          const settings = await loadSettings();
          settings.general.defaultProfileId = undefined;
          await saveSettings(settings);
          setDefaultProfileId(undefined);
        }

        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete profile");
      }
    },
    [defaultProfileId, load],
  );

  const startEdit = useCallback((p: Profile) => {
    setEditingId(p.id);
    setForm(profileToForm(p));
    setShowNewForm(false);
  }, []);

  const startNew = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowNewForm(true);
  }, []);

  const cancelForm = useCallback(() => {
    setEditingId(null);
    setShowNewForm(false);
    setForm(EMPTY_FORM);
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!form.name.trim()) return;

      setSaving(true);
      setError(null);

      try {
        const existing = editingId
          ? profiles.find((p) => p.id === editingId)
          : undefined;
        const profile = formToProfile(form, existing);
        await profileRepo.save(profile);
        await load();
        cancelForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save profile");
      } finally {
        setSaving(false);
      }
    },
    [form, editingId, profiles, load, cancelForm],
  );

  const updateField = useCallback(
    (field: keyof ProfileFormData, value: string | boolean) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  // ── Render ──

  if (loading) return <LoadingState message="Loading profiles..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <h2 style={sectionTitle}>Profiles</h2>
      <p style={sectionDesc}>
        Manage profiles used for scoring and cover letters.
      </p>

      {/* Profile list */}
      {profiles.length === 0 && !showNewForm ? (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 10 }}>
            No profiles yet. Create your first profile to enable scoring.
          </p>
          <button type="button" onClick={startNew} style={btnPrimary}>
            + New Profile
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {profiles.map((p) => (
            <div key={p.id} style={listItem}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                {p.id === defaultProfileId && (
                  <span style={badge}>default</span>
                )}
                {p.targetTitles.length > 0 && (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                    {p.targetTitles.slice(0, 3).join(", ")}
                    {p.targetTitles.length > 3 && " ..."}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                {p.id !== defaultProfileId && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(p.id)}
                    style={btnSmall}
                  >
                    Set default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => startEdit(p)}
                  style={btnSmall}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  style={btnDanger}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!showNewForm && !editingId && (
            <button
              type="button"
              onClick={startNew}
              style={{ ...btnPrimary, marginTop: 4 }}
            >
              + New Profile
            </button>
          )}
        </div>
      )}

      {/* Edit / New form */}
      {(showNewForm || editingId) && (
        <form
          onSubmit={handleSubmit}
          style={{
            padding: 14,
            border: "1px solid #e0e0e0",
            borderRadius: 6,
            background: "#f9f9f9",
            marginBottom: 16,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>
            {editingId ? "Edit Profile" : "New Profile"}
          </h3>

          <div style={formGroup}>
            <label style={labelStyle}>Name *</label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="e.g. Senior Frontend Dev"
              required
            />
          </div>

          <div style={formGroup}>
            <label style={labelStyle}>Summary</label>
            <textarea
              style={textareaStyle}
              value={form.summary}
              onChange={(e) => updateField("summary", e.target.value)}
              placeholder="Brief professional summary..."
            />
          </div>

          <div style={formGroup}>
            <label style={labelStyle}>Target titles (comma-separated)</label>
            <input
              style={inputStyle}
              value={form.targetTitlesRaw}
              onChange={(e) => updateField("targetTitlesRaw", e.target.value)}
              placeholder="Frontend Developer, React Developer"
            />
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ ...formGroup, flex: 1 }}>
              <label style={labelStyle}>
                Must-have skills (comma-separated)
              </label>
              <input
                style={inputStyle}
                value={form.mustHaveSkillsRaw}
                onChange={(e) =>
                  updateField("mustHaveSkillsRaw", e.target.value)
                }
                placeholder="React, TypeScript, CSS"
              />
            </div>
            <div style={{ ...formGroup, flex: 1 }}>
              <label style={labelStyle}>Nice-to-have skills</label>
              <input
                style={inputStyle}
                value={form.niceToHaveSkillsRaw}
                onChange={(e) =>
                  updateField("niceToHaveSkillsRaw", e.target.value)
                }
                placeholder="GraphQL, Docker"
              />
            </div>
          </div>

          <div style={formGroup}>
            <label style={labelStyle}>Avoid keywords (comma-separated)</label>
            <input
              style={inputStyle}
              value={form.avoidKeywordsRaw}
              onChange={(e) => updateField("avoidKeywordsRaw", e.target.value)}
              placeholder="1C, Bitrix"
            />
          </div>

          <div style={formGroup}>
            <label style={labelStyle}>Preferred work modes</label>
            <div>
              <label style={checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.workModeRemote}
                  onChange={(e) =>
                    updateField("workModeRemote", e.target.checked)
                  }
                />
                Remote
              </label>
              <label style={checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.workModeHybrid}
                  onChange={(e) =>
                    updateField("workModeHybrid", e.target.checked)
                  }
                />
                Hybrid
              </label>
              <label style={checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.workModeOffice}
                  onChange={(e) =>
                    updateField("workModeOffice", e.target.checked)
                  }
                />
                Office
              </label>
            </div>
          </div>

          <div style={formGroup}>
            <label style={labelStyle}>Preferred cities (comma-separated)</label>
            <input
              style={inputStyle}
              value={form.preferredCitiesRaw}
              onChange={(e) =>
                updateField("preferredCitiesRaw", e.target.value)
              }
              placeholder="Москва, Санкт-Петербург"
            />
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ ...formGroup, flex: 1 }}>
              <label style={labelStyle}>Min salary expectation</label>
              <input
                style={inputStyle}
                type="number"
                value={form.salaryExpectationMin}
                onChange={(e) =>
                  updateField("salaryExpectationMin", e.target.value)
                }
                placeholder="150000"
              />
            </div>
            <div style={{ ...formGroup, flex: 1 }}>
              <label style={labelStyle}>Currency</label>
              <select
                style={inputStyle}
                value={form.salaryCurrency}
                onChange={(e) => updateField("salaryCurrency", e.target.value)}
              >
                <option value="RUB">RUB</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ ...formGroup, flex: 1 }}>
              <label style={labelStyle}>Years of experience</label>
              <input
                style={inputStyle}
                type="number"
                min="0"
                step="1"
                value={form.experienceYears}
                onChange={(e) => updateField("experienceYears", e.target.value)}
                placeholder="e.g. 5"
              />
            </div>
            <div style={{ ...formGroup, flex: 1 }}>
              <label style={labelStyle}>Seniority level</label>
              <select
                style={inputStyle}
                value={form.seniority}
                onChange={(e) => updateField("seniority", e.target.value)}
              >
                <option value="">— Not set —</option>
                {SENIORITY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              style={btnPrimary}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={cancelForm} style={btnSmall}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
