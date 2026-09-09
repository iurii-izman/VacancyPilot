import { db } from "@/db/database";
import { hrTimelineRepo } from "@/db/hr-timeline-repository";
import type { Application } from "@/models/application";
import type { Job, JobStatus } from "@/models/job";
import type { HrTimelineEntry, RawHrTimelineDTO } from "@/models/hr-timeline";

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function isApplicationStatus(status: JobStatus): boolean {
  return (
    status === "applied" ||
    status === "hr_replied" ||
    status === "interview" ||
    status === "test_task" ||
    status === "offer" ||
    status === "rejected_by_company"
  );
}

export async function upsertApplicationFromJob(
  job: Job,
  channel: Application["channel"],
): Promise<Application> {
  const applications = await db.applications
    .where("jobId")
    .equals(job.id)
    .toArray();
  const existing = applications.sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )[0];

  const now = new Date().toISOString();
  // HR extraction is observational. It may create a tracking record for a
  // saved vacancy, but it must never infer that a native HH application was
  // submitted or synthesize an Applied transition.
  const nextStatus = existing?.status ?? job.status;
  const nextStatusHistory = existing?.statusHistory?.length
    ? existing.statusHistory
    : job.statusHistory;

  const application: Application = {
    id: existing?.id ?? `app_${job.id}`,
    jobId: job.id,
    profileId: job.selectedProfileId ?? existing?.profileId,
    resumeId: job.selectedResumeId ?? existing?.resumeId,
    coverLetterId: job.coverLetterId ?? existing?.coverLetterId,
    channel: existing?.channel ?? channel,
    appliedAt:
      existing?.appliedAt ??
      (isApplicationStatus(nextStatus) ? job.updatedAt : undefined),
    status: nextStatus,
    statusHistory: nextStatusHistory,
    followUpAt: existing?.followUpAt,
    notes: existing?.notes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.applications.put(application);
  return application;
}

export function buildHrTimelineEntryId(
  applicationId: string,
  dto: RawHrTimelineDTO,
): string {
  const fingerprint = [
    applicationId,
    dto.type,
    dto.sourcePage,
    dto.sourceUrl,
    dto.statusBadge ?? "",
    dto.timestampText ?? "",
    dto.text ?? "",
  ].join("|");

  return `hr_${hashString(fingerprint)}`;
}

export function normalizeHrTimelineEntry(
  applicationId: string,
  dto: RawHrTimelineDTO,
): HrTimelineEntry | null {
  const rawText = (dto.text ?? dto.statusBadge ?? "").trim();
  if (!rawText) return null;

  return {
    id: buildHrTimelineEntryId(applicationId, dto),
    applicationId,
    type: dto.type,
    rawText,
    sourceUrl: dto.sourceUrl,
    sourcePage: dto.sourcePage,
    extractedAt: dto.extractedAt,
    isRead: false,
    createdAt: dto.extractedAt,
    updatedAt: dto.extractedAt,
  };
}

export async function persistHrTimelineForJob(
  job: Job,
  rawEntries: RawHrTimelineDTO[],
): Promise<{ application: Application; savedEntries: number }> {
  const application = await upsertApplicationFromJob(job, "manual");
  const existingEntries = await hrTimelineRepo.listByApplication(
    application.id,
  );
  const existingById = new Map(
    existingEntries.map((entry) => [entry.id, entry]),
  );

  const entriesToSave = rawEntries
    .map((dto) => normalizeHrTimelineEntry(application.id, dto))
    .filter((entry): entry is HrTimelineEntry => entry !== null)
    .map((entry) => {
      const existing = existingById.get(entry.id);
      if (!existing) return entry;

      return {
        ...entry,
        isRead: existing.isRead,
        notes: existing.notes,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
    });

  if (entriesToSave.length > 0) {
    await hrTimelineRepo.bulkSave(entriesToSave);
  }

  return { application, savedEntries: entriesToSave.length };
}
