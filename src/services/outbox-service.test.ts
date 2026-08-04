// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import {
  isRetryableError,
  isConflictError,
  isNonRetryableError,
  classifyDelivery,
} from "./outbox-service";

// ── Error classification tests ──────────────────────────────────────────────

describe("outbox error classification", () => {
  describe("isRetryableError", () => {
    it("returns true for NETWORK_ERROR", () => {
      expect(isRetryableError("NETWORK_ERROR")).toBe(true);
    });

    it("returns true for TIMEOUT", () => {
      expect(isRetryableError("TIMEOUT")).toBe(true);
    });

    it("returns true for ABORTED", () => {
      expect(isRetryableError("ABORTED")).toBe(true);
    });

    it("returns true for GATEWAY_TIMEOUT", () => {
      expect(isRetryableError("GATEWAY_TIMEOUT")).toBe(true);
    });

    it("returns true for SERVICE_UNAVAILABLE", () => {
      expect(isRetryableError("SERVICE_UNAVAILABLE")).toBe(true);
    });

    it("returns true for RATE_LIMITED", () => {
      expect(isRetryableError("RATE_LIMITED")).toBe(true);
    });

    it("returns false for VALIDATION_ERROR", () => {
      expect(isRetryableError("VALIDATION_ERROR")).toBe(false);
    });

    it("returns false for UNAUTHORIZED", () => {
      expect(isRetryableError("UNAUTHORIZED")).toBe(false);
    });

    it("returns false for REVISION_CONFLICT", () => {
      expect(isRetryableError("REVISION_CONFLICT")).toBe(false);
    });
  });

  describe("isConflictError", () => {
    it("returns true for REVISION_CONFLICT", () => {
      expect(isConflictError("REVISION_CONFLICT")).toBe(true);
    });

    it("returns true for IDEMPOTENCY_CONFLICT", () => {
      expect(isConflictError("IDEMPOTENCY_CONFLICT")).toBe(true);
    });

    it("returns true for CONFLICT", () => {
      expect(isConflictError("CONFLICT")).toBe(true);
    });

    it("returns false for NETWORK_ERROR", () => {
      expect(isConflictError("NETWORK_ERROR")).toBe(false);
    });

    it("returns false for VALIDATION_ERROR", () => {
      expect(isConflictError("VALIDATION_ERROR")).toBe(false);
    });
  });

  describe("isNonRetryableError", () => {
    it("returns true for VALIDATION_ERROR", () => {
      expect(isNonRetryableError("VALIDATION_ERROR")).toBe(true);
    });

    it("returns true for UNAUTHORIZED", () => {
      expect(isNonRetryableError("UNAUTHORIZED")).toBe(true);
    });

    it("returns false for NETWORK_ERROR (retryable)", () => {
      expect(isNonRetryableError("NETWORK_ERROR")).toBe(false);
    });

    it("returns false for REVISION_CONFLICT (conflict, not non-retryable dead)", () => {
      expect(isNonRetryableError("REVISION_CONFLICT")).toBe(false);
    });
  });

  describe("classifyDelivery", () => {
    it("classifies success as committed", () => {
      expect(classifyDelivery(true)).toBe("committed");
    });

    it("classifies failure without error code as retry", () => {
      expect(classifyDelivery(false)).toBe("retry");
    });

    it("classifies NETWORK_ERROR as retry", () => {
      expect(classifyDelivery(false, "NETWORK_ERROR")).toBe("retry");
    });

    it("classifies TIMEOUT as retry", () => {
      expect(classifyDelivery(false, "TIMEOUT")).toBe("retry");
    });

    it("classifies RATE_LIMITED as retry", () => {
      expect(classifyDelivery(false, "RATE_LIMITED")).toBe("retry");
    });

    it("classifies VALIDATION_ERROR as dead", () => {
      expect(classifyDelivery(false, "VALIDATION_ERROR")).toBe("dead");
    });

    it("classifies UNAUTHORIZED as dead", () => {
      expect(classifyDelivery(false, "UNAUTHORIZED")).toBe("dead");
    });

    it("classifies REVISION_CONFLICT as conflict", () => {
      expect(classifyDelivery(false, "REVISION_CONFLICT")).toBe("conflict");
    });

    it("classifies IDEMPOTENCY_CONFLICT as conflict", () => {
      expect(classifyDelivery(false, "IDEMPOTENCY_CONFLICT")).toBe("conflict");
    });
  });
});
