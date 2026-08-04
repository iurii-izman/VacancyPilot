import { useEffect, useState, type ReactNode } from "react";
import type { DexieSnapshot } from "@/services/migration-service";
import type { MigrationPreviewData } from "@/adapters/companion/migration-types";
import {
  confirmMigration,
  downloadMigrationBackup,
  executeMigrationWorkflow,
  getAuthorityMode,
} from "@/services/migration-service";
import { getOpsClient } from "@/services/companion-service";
import { colors } from "@/styles/tokens";

interface MigrationPlan {
  snapshot: DexieSnapshot;
  preview: MigrationPreviewData;
}

/** Explicit preview/backup/confirmation surface for first Ops migration. */
export function MigrationPanel(): ReactNode {
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAuthorityMode().then((mode) => {
      if (active && mode === "ops") setComplete(true);
    });
    return () => { active = false; };
  }, []);

  async function prepare(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const next = await executeMigrationWorkflow(getOpsClient());
      setPlan({ snapshot: next.snapshot, preview: next.preview });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Migration preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(): Promise<void> {
    if (!plan || plan.preview.has_blocking_conflicts) return;
    setBusy(true);
    setError(null);
    try {
      // The boolean is deliberately supplied only by this user click handler.
      const result = await confirmMigration(getOpsClient(), plan.snapshot, true);
      if (!result.authoritySwitched) {
        throw new Error(result.companionImport.summary ?? "Migration was rolled back");
      }
      setComplete(true);
      setPlan(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Migration import failed");
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    return <p role="status" style={{ color: colors.green, fontSize: 12 }}>Migration committed. SQLite is now the Ops authority.</p>;
  }

  if (!plan) {
    return (
      <div style={{ marginTop: 12 }}>
        <button type="button" disabled={busy} onClick={() => void prepare()}>
          {busy ? "Preparing migration…" : "Preview local data migration"}
        </button>
        {error && <p role="alert" style={{ color: colors.red, fontSize: 12 }}>{error}</p>}
      </div>
    );
  }

  const preview = plan.preview;
  return (
    <section aria-label="Migration preview" style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 6 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Migration preview</h4>
      <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, fontSize: 12 }}>
        <dt>New vacancies</dt><dd>{preview.inserts}</dd>
        <dt>Unchanged vacancies</dt><dd>{preview.unchanged}</dd>
        <dt>Visible conflicts</dt><dd>{preview.conflicts}</dd>
        <dt>Other records retained in backup</dt><dd>{preview.retained_in_backup}</dd>
      </dl>
      {preview.conflict_details?.map((conflict) => (
        <p key={`${conflict.entity_type}:${conflict.entity_id}`} role="alert" style={{ color: colors.red, fontSize: 12 }}>
          {conflict.entity_type} {conflict.entity_id}: {conflict.reason}
        </p>
      ))}
      <p style={{ fontSize: 11 }}>
        Download and retain the exact sanitized source backup before confirming.
        Dexie remains authoritative unless the import commits successfully.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => downloadMigrationBackup(plan.snapshot)}>Download backup</button>
        <button type="button" disabled={busy || preview.has_blocking_conflicts} onClick={() => void confirm()}>
          {busy ? "Importing…" : "Confirm migration"}
        </button>
        <button type="button" disabled={busy} onClick={() => setPlan(null)}>Cancel</button>
      </div>
      {error && <p role="alert" style={{ color: colors.red, fontSize: 12 }}>{error}</p>}
    </section>
  );
}
