import { beforeEach, describe, expect, it, vi } from "vitest";

const job = {
  id: "hh_guided_1",
  source: "hh" as const,
  sourceVacancyId: "guided-1",
  sourceUrl: "https://hh.ru/vacancy/guided-1",
  title: "Guided vacancy",
  companyId: "company-1",
  companyName: "Company",
  descriptionClean: "Description",
  descriptionHash: "hash",
  skills: [],
  status: "saved" as const,
  statusHistory: [],
  firstSeenAt: "2026-09-01T00:00:00.000Z",
  lastSeenAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const jobRepo = {
  getById: vi.fn(),
  save: vi.fn(),
};
const upsertApplicationFromJob = vi.fn();
const checkGuidedApplyMutationGate = vi.fn();
const recordLabsAction = vi.fn();

vi.mock("@/db/repositories", () => ({ jobRepo }));
vi.mock("@/services/hr-timeline-sync", () => ({ upsertApplicationFromJob }));
vi.mock("@/services/labs-control", () => ({
  checkGuidedApplyMutationGate,
  recordLabsAction,
}));

const { confirmGuidedApplyMutation } = await import("./guided-apply-mutation");

beforeEach(() => {
  vi.clearAllMocks();
  jobRepo.getById.mockResolvedValue({ ...job });
  jobRepo.save.mockResolvedValue(undefined);
  upsertApplicationFromJob.mockResolvedValue(undefined);
  recordLabsAction.mockResolvedValue(undefined);
  checkGuidedApplyMutationGate.mockResolvedValue({ allowed: true });
});

describe("Guided Apply final mutation", () => {
  it("blocks Ops mutation before reading or writing the job", async () => {
    checkGuidedApplyMutationGate.mockResolvedValue({
      allowed: false,
      reason: "Guided Apply local mutation is unavailable in Ops Mode until Fix 2",
    });

    const result = await confirmGuidedApplyMutation({
      jobId: job.id,
      preparationComplete: true,
      nativeSubmissionConfirmed: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Ops Mode");
    expect(jobRepo.getById).not.toHaveBeenCalled();
    expect(jobRepo.save).not.toHaveBeenCalled();
    expect(upsertApplicationFromJob).not.toHaveBeenCalled();
  });

  it("requires preparation and explicit native submission confirmation", async () => {
    const result = await confirmGuidedApplyMutation({
      jobId: job.id,
      preparationComplete: false,
      nativeSubmissionConfirmed: false,
    });

    expect(result.success).toBe(false);
    expect(checkGuidedApplyMutationGate).not.toHaveBeenCalled();
    expect(jobRepo.save).not.toHaveBeenCalled();
  });

  it("updates local status only after the explicit confirmation in Standalone", async () => {
    const result = await confirmGuidedApplyMutation({
      jobId: job.id,
      preparationComplete: true,
      nativeSubmissionConfirmed: true,
    });

    expect(result.success).toBe(true);
    expect(jobRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: "applied",
      statusHistory: [expect.objectContaining({ to: "applied", source: "user" })],
    }));
    expect(upsertApplicationFromJob).toHaveBeenCalledWith(expect.objectContaining({ status: "applied" }), "guided");
    expect(recordLabsAction).toHaveBeenCalledWith("guided_apply_completed", expect.objectContaining({ nativeSubmissionConfirmed: true }));
  });
});
