import { db } from "./database";
import type { LabsActionLog } from "@/models/labs-action-log";
import { withWriteGuard } from "@/services/reset-guard";

/** Thin CRUD repository for the Labs action log table. */
export const labsActionRepo = {
  /** List all actions, newest first. */
  list: () => db.labsActions.orderBy("createdAt").reverse().toArray(),

  /** List actions created after a given timestamp, newest first. */
  listSince: (iso: string) =>
    db.labsActions.where("createdAt").above(iso).reverse().sortBy("createdAt"),

  /** Get a single action by id. */
  getById: (id: string) => db.labsActions.get(id as LabsActionLog["id"]),

  /** Insert a new action. */
  save: (action: LabsActionLog) => withWriteGuard(() => db.labsActions.put(action)),

  /** Delete a single action. */
  delete: (id: string) => withWriteGuard(() => db.labsActions.delete(id as LabsActionLog["id"])),

  /** Count all actions. */
  count: () => db.labsActions.count(),

  /** Count actions created after a given timestamp. */
  countSince: (iso: string) =>
    db.labsActions.where("createdAt").above(iso).count(),

  /** Delete all labs action log entries. */
  deleteAll: () => withWriteGuard(() => db.labsActions.clear()),
};
