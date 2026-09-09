import { jobRepo } from "@/db/repositories";
import { createStatusChange } from "@/services/status-transitions";
import { upsertApplicationFromJob } from "@/services/hr-timeline-sync";
import { recordLabsAction, checkGuidedApplyMutationGate } from "@/services/labs-control";
import { isNativeHhSubmissionConfirmed } from "@/services/applied-confirmation";

export interface GuidedApplyMutationRequest {
  jobId: string;
  preparationComplete: boolean;
  nativeSubmissionConfirmed: unknown;
}

export interface GuidedApplyMutationResult {
  success: boolean;
  error?: string;
}

/**
 * Background-owned local mutation for the final Guided Apply confirmation.
 * It never contacts HH and refuses to mutate while Ops is authoritative.
 */
export async function confirmGuidedApplyMutation(
  request: GuidedApplyMutationRequest,
): Promise<GuidedApplyMutationResult> {
  if (!request.preparationComplete || !isNativeHhSubmissionConfirmed(request.nativeSubmissionConfirmed)) {
    return {
      success: false,
      error: "Complete the preparation checklist and confirm the native HH submission first.",
    };
  }

  const gate = await checkGuidedApplyMutationGate();
  if (!gate.allowed) return { success: false, error: gate.reason };

  const job = await jobRepo.getById(request.jobId);
  if (!job) return { success: false, error: "Job not found" };
  if (job.status === "applied") return { success: true };

  const now = new Date().toISOString();
  const change = createStatusChange(
    job.status,
    "applied",
    "user",
    "User confirmed native HH submission in Guided Apply",
  );
  const updated = {
    ...job,
    status: "applied" as const,
    statusHistory: [...job.statusHistory, change],
    updatedAt: now,
  };

  await jobRepo.save(updated);
  await upsertApplicationFromJob(updated, "guided");
  await recordLabsAction("guided_apply_completed", {
    jobId: request.jobId,
    vacancyUrl: updated.sourceUrl,
    countsTowardBudget: true,
    nativeSubmissionConfirmed: true,
  });
  return { success: true };
}
