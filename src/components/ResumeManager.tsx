import {
  useState,
  useCallback,
  useEffect,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  resumeRepo,
  profileRepo,
  jobRepo,
  coverLetterRepo,
} from "@/db/repositories";
import { db } from "@/db/database";
import { withWriteGuard } from "@/services/reset-guard";
import type { Resume } from "@/models/resume";
import type { Profile } from "@/models/profile";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";

// ── ID generation ──

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Form data ──

interface ResumeFormData {
  title: string;
  profileId: string;
  highlightsText: string;
  skillsRaw: string;
  language: "ru" | "en" | "ro";
  isDefault: boolean;
}

const EMPTY_FORM: ResumeFormData = {
  title: "",
  profileId: "",
  highlightsText: "",
  skillsRaw: "",
  language: "ru",
  isDefault: false,
};

function resumeToForm(r: Resume): ResumeFormData {
  return {
    title: r.title,
    profileId: r.profileId,
    highlightsText: r.highlightsText,
    skillsRaw: r.skills.join(", "),
    language: r.language,
    isDefault: r.isDefault ?? false,
  };
}

function formToResume(form: ResumeFormData, existing?: Resume): Resume {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? generateId("resume"),
    profileId: form.profileId,
    title: form.title.trim(),
    highlightsText: form.highlightsText.trim(),
    skills: form.skillsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    language: form.language,
    isDefault: form.isDefault,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

// ── Language labels ──

const LANG_LABELS: Record<Resume["language"], string> = {
  ru: "Русский",
  en: "English",
  ro: "Română",
};

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

const badge: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 6px",
  fontSize: 10,
  fontWeight: 600,
  borderRadius: 3,
  background: "#e6f0ff",
  color: "#4a90d9",
  marginLeft: 6,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
};

const checkboxLabel: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  cursor: "pointer",
};

// ── Component ──

export function ResumeManager(): ReactNode {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ResumeFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [resumeList, profileList] = await Promise.all([
        resumeRepo.list(),
        profileRepo.list(),
      ]);
      setResumes(resumeList);
      setProfiles(profileList);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load resumes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const getProfileName = useCallback(
    (profileId: string): string => {
      return profiles.find((p) => p.id === profileId)?.name ?? profileId;
    },
    [profiles],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (
        !confirm(
          "Delete this resume? Resume references in saved vacancies will be cleared.",
        )
      )
        return;
      try {
        // 1. Clear selectedResumeId on jobs that reference this resume.
        const allJobs = await jobRepo.list();
        for (const job of allJobs) {
          if (job.selectedResumeId === id) {
            job.selectedResumeId = undefined;
            await jobRepo.save(job);
          }
        }

        // 2. Clear resumeId on cover letters that reference this resume.
        const allLetters = await db.coverLetters.toArray();
        for (const letter of allLetters) {
          if (letter.resumeId === id) {
            letter.resumeId = undefined;
            await coverLetterRepo.save(letter);
          }
        }

        // 3. Clear resumeId on applications that reference this resume.
        const allApplications = await db.applications.toArray();
        for (const app of allApplications) {
          if (app.resumeId === id) {
            app.resumeId = undefined;
            app.updatedAt = new Date().toISOString();
            await withWriteGuard(() => db.applications.put(app));
          }
        }

        // 4. Delete the resume itself.
        await resumeRepo.delete(id);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete resume");
      }
    },
    [load],
  );

  const startEdit = useCallback((r: Resume) => {
    setEditingId(r.id);
    setForm(resumeToForm(r));
    setShowNewForm(false);
  }, []);

  const startNew = useCallback(() => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, profileId: profiles[0]?.id ?? "" });
    setShowNewForm(true);
  }, [profiles]);

  const cancelForm = useCallback(() => {
    setEditingId(null);
    setShowNewForm(false);
    setForm(EMPTY_FORM);
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!form.title.trim() || !form.profileId) return;

      setSaving(true);
      setError(null);

      try {
        const existing = editingId
          ? resumes.find((r) => r.id === editingId)
          : undefined;
        const resume = formToResume(form, existing);

        // If this resume is set as default, unset default on other resumes for the same profile
        if (resume.isDefault) {
          const profileResumes = await resumeRepo.listByProfile(
            resume.profileId,
          );
          for (const r of profileResumes) {
            if (r.id !== resume.id && r.isDefault) {
              r.isDefault = false;
              await resumeRepo.save(r);
            }
          }
        }

        await resumeRepo.save(resume);
        await load();
        cancelForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save resume");
      } finally {
        setSaving(false);
      }
    },
    [form, editingId, resumes, load, cancelForm],
  );

  const updateField = useCallback(
    (field: keyof ResumeFormData, value: string | boolean) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  // ── Render ──

  if (loading) return <LoadingState message="Loading resumes..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <h2 style={sectionTitle}>Resumes</h2>
      <p style={sectionDesc}>
        Manage CV highlights used for cover letters and analysis.
      </p>

      {/* Resume list */}
      {resumes.length === 0 && !showNewForm ? (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 10 }}>
            No resumes yet. Add your CV highlights to improve cover letters.
          </p>
          {profiles.length === 0 ? (
            <p style={{ fontSize: 12, color: "#c44" }}>
              Create a profile first before adding a resume.
            </p>
          ) : (
            <button type="button" onClick={startNew} style={btnPrimary}>
              + New Resume
            </button>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {resumes.map((r) => (
            <div key={r.id} style={listItem}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</span>
                {r.isDefault && <span style={badge}>default</span>}
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                  {getProfileName(r.profileId)} · {LANG_LABELS[r.language]}
                  {r.skills.length > 0 &&
                    ` · ${r.skills.slice(0, 4).join(", ")}${r.skills.length > 4 ? " ..." : ""}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => startEdit(r)}
                  style={btnSmall}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(r.id)}
                  style={btnDanger}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!showNewForm && !editingId && profiles.length > 0 && (
            <button
              type="button"
              onClick={startNew}
              style={{ ...btnPrimary, marginTop: 4 }}
            >
              + New Resume
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
            {editingId ? "Edit Resume" : "New Resume"}
          </h3>

          <div style={formGroup}>
            <label style={labelStyle}>Title *</label>
            <input
              style={inputStyle}
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="e.g. Senior Frontend CV (RU)"
              required
            />
          </div>

          <div style={formGroup}>
            <label style={labelStyle}>Profile *</label>
            <select
              style={selectStyle}
              value={form.profileId}
              onChange={(e) => updateField("profileId", e.target.value)}
              required
            >
              <option value="">-- Select profile --</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div style={formGroup}>
            <label style={labelStyle}>Highlights / summary text</label>
            <textarea
              style={textareaStyle}
              value={form.highlightsText}
              onChange={(e) => updateField("highlightsText", e.target.value)}
              placeholder="Key achievements, experience highlights, core competencies..."
            />
          </div>

          <div style={formGroup}>
            <label style={labelStyle}>Skills (comma-separated)</label>
            <input
              style={inputStyle}
              value={form.skillsRaw}
              onChange={(e) => updateField("skillsRaw", e.target.value)}
              placeholder="React, TypeScript, Node.js, AWS"
            />
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ ...formGroup, flex: 1 }}>
              <label style={labelStyle}>Language</label>
              <select
                style={selectStyle}
                value={form.language}
                onChange={(e) => updateField("language", e.target.value)}
              >
                <option value="ru">Русский</option>
                <option value="en">English</option>
                <option value="ro">Română</option>
              </select>
            </div>
            <div
              style={{
                ...formGroup,
                flex: 1,
                display: "flex",
                alignItems: "flex-end",
                paddingBottom: 6,
              }}
            >
              <label style={{ ...checkboxLabel, marginRight: 0 }}>
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => updateField("isDefault", e.target.checked)}
                />
                Set as default
              </label>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="submit"
              disabled={saving || !form.title.trim() || !form.profileId}
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
