import { db } from "./database";
import type { HrTimelineEntry } from "@/models/hr-timeline";
import { withWriteGuard } from "@/services/reset-guard";

/**
 * Thin CRUD helpers for HR Timeline entries.
 *
 * Rules:
 * - Read-only data extracted from user-opened pages.
 * - No background polling or hidden writes.
 * - Entries are linked to an Application.
 */

export const hrTimelineRepo = {
  /** List all timeline entries, most recent first. */
  list: () => db.hrTimeline.orderBy("extractedAt").reverse().toArray(),

  /** List timeline entries for a specific application. */
  listByApplication: (applicationId: string) =>
    db.hrTimeline
      .where("applicationId")
      .equals(applicationId)
      .sortBy("extractedAt"),

  /** Get a single entry by id. */
  getById: (id: string) => db.hrTimeline.get(id),

  /** Insert or update an entry (upsert by id). */
  save: (entry: HrTimelineEntry) => withWriteGuard(() => db.hrTimeline.put(entry)),

  /** Bulk save — useful for importing parsed entries. */
  bulkSave: (entries: HrTimelineEntry[]) => withWriteGuard(() => db.hrTimeline.bulkPut(entries)),

  /** Delete a single entry. */
  delete: (id: string) => withWriteGuard(() => db.hrTimeline.delete(id)),

  /** Count entries for an application. */
  countByApplication: (applicationId: string) =>
    db.hrTimeline.where("applicationId").equals(applicationId).count(),

  /** Count unread entries for an application. */
  countUnreadByApplication: async (applicationId: string) => {
    const entries = await db.hrTimeline
      .where("applicationId")
      .equals(applicationId)
      .toArray();
    return entries.filter((e) => !e.isRead).length;
  },
};
