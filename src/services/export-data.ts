import { db, TABLE_NAMES } from "@/db";
import type { TableName } from "@/db";
import { loadSettings } from "@/db/settings-bridge";
import type { AppSettings } from "@/models/settings";

// ── Types ──────────────────────────────────────────────────────────────────

/** Versioned envelope for JSON export (spec section 21.2). */
export interface ExportEnvelope {
  version: 2;
  exportedAt: string;
  data: Record<string, unknown[]>;
  settings: AppSettings;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip sensitive fields from settings before export.
 * Currently removes the n8n.webhookUrl and n8n.hmacSecretSet flag
 * since the actual secret is never stored in settings, but we redact
 * the URL field as a precaution.
 */
function redactSettingsForExport(settings: AppSettings): AppSettings {
  return {
    ...settings,
    n8n: {
      ...settings.n8n,
      webhookUrl: settings.n8n.webhookUrl ? "[REDACTED]" : undefined,
      hmacSecretSet: false,
    },
  };
}

// ── CSV helpers ────────────────────────────────────────────────────────────

/** Quote a CSV cell — wraps in quotes and escapes inner quotes. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Join CSV row cells with comma. */
function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

// ── Export: JSON ───────────────────────────────────────────────────────────

/**
 * Collect all Dexie table data and chrome.storage.local settings
 * into a versioned export envelope.
 *
 * Sensitive keys (API keys, secrets) are excluded.
 */
export async function exportAllJson(): Promise<ExportEnvelope> {
  const data: Record<string, unknown[]> = {};

  // Collect all Dexie table data (TABLE_NAMES reflects the current schema v6)
  for (const name of TABLE_NAMES) {
    const table = db.table(name as TableName);
    data[name] = await table.toArray();
  }

  // Load and redact settings
  const rawSettings = await loadSettings();
  const settings = redactSettingsForExport(rawSettings);

  const envelope: ExportEnvelope = {
    version: 2,
    exportedAt: new Date().toISOString(),
    data,
    settings,
  };

  return envelope;
}

/**
 * Download a JSON export file as a Blob via object URL.
 * Works in extension pages without the "downloads" permission.
 */
export function downloadJson(envelope: ExportEnvelope): void {
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  downloadUrl(
    url,
    `vacancy-pilot-export-${envelope.exportedAt.slice(0, 10)}.json`,
  );
}

// ── Export: CSV ────────────────────────────────────────────────────────────

/**
 * Job CSV column definition.
 * Stable, ordered list of columns for job export.
 */
const JOB_CSV_COLUMNS: {
  key: string;
  label: string;
  extract: (job: Record<string, unknown>) => unknown;
}[] = [
  { key: "id", label: "ID", extract: (j) => j.id },
  {
    key: "sourceVacancyId",
    label: "Source Vacancy ID",
    extract: (j) => j.sourceVacancyId,
  },
  { key: "title", label: "Title", extract: (j) => j.title },
  { key: "companyName", label: "Company", extract: (j) => j.companyName },
  { key: "companyId", label: "Company ID", extract: (j) => j.companyId },
  { key: "status", label: "Status", extract: (j) => j.status },
  { key: "city", label: "City", extract: (j) => j.city },
  { key: "workMode", label: "Work Mode", extract: (j) => j.workMode },
  { key: "salaryRaw", label: "Salary (Raw)", extract: (j) => j.salaryRaw },
  { key: "salaryMin", label: "Salary Min", extract: (j) => j.salaryMin },
  { key: "salaryMax", label: "Salary Max", extract: (j) => j.salaryMax },
  {
    key: "salaryCurrency",
    label: "Currency",
    extract: (j) => j.salaryCurrency,
  },
  {
    key: "experienceRaw",
    label: "Experience",
    extract: (j) => j.experienceRaw,
  },
  {
    key: "employmentType",
    label: "Employment",
    extract: (j) => j.employmentType,
  },
  { key: "schedule", label: "Schedule", extract: (j) => j.schedule },
  {
    key: "skills",
    label: "Skills",
    extract: (j) => {
      const skills = j.skills;
      return Array.isArray(skills) ? skills.join("; ") : "";
    },
  },
  {
    key: "score",
    label: "Score (Total)",
    extract: (j) => {
      const score = (j as Record<string, unknown>).ruleScore as
        | Record<string, unknown>
        | undefined;
      return score?.total ?? "";
    },
  },
  {
    key: "scoreRecommendation",
    label: "Recommendation",
    extract: (j) => {
      const score = (j as Record<string, unknown>).ruleScore as
        | Record<string, unknown>
        | undefined;
      return score?.recommendation ?? "";
    },
  },
  { key: "firstSeenAt", label: "First Seen", extract: (j) => j.firstSeenAt },
  { key: "lastSeenAt", label: "Last Seen", extract: (j) => j.lastSeenAt },
  { key: "updatedAt", label: "Updated", extract: (j) => j.updatedAt },
  { key: "sourceUrl", label: "URL", extract: (j) => j.sourceUrl },
  {
    key: "selectedProfileId",
    label: "Profile ID",
    extract: (j) => j.selectedProfileId,
  },
];

/**
 * Generate CSV string for jobs table.
 *
 * - UTF-8 BOM prepended for Excel compatibility
 * - Stable column order
 * - Properly escaped CSV cells
 */
export function generateJobsCsv(jobs: unknown[]): string {
  const header = JOB_CSV_COLUMNS.map((c) => c.label);
  const rows = jobs.map((job) =>
    JOB_CSV_COLUMNS.map((c) => c.extract(job as Record<string, unknown>)),
  );

  // \uFEFF is UTF-8 BOM — helps Excel detect UTF-8 encoding
  return "\uFEFF" + [header, ...rows].map(csvRow).join("\r\n") + "\r\n";
}

/**
 * Download a CSV string as a file via Blob object URL.
 */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
}

// ── Download helper ────────────────────────────────────────────────────────

/**
 * Trigger a file download using Blob object URL.
 * Works in extension UI pages without additional permissions.
 */
export function downloadUrl(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke after a short delay to allow the browser to start the download
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
