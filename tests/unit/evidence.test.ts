import { expect, it } from "vitest";
import { isVerifiedWork } from "../../src/lib/domain";

it("verifies work only when its linked contract is completed", () => {
  expect(isVerifiedWork({ status: "COMPLETED" })).toBe(true);
  expect(isVerifiedWork(null)).toBe(false);
  for (const status of ["PENDING", "IN_PROGRESS", "SUBMITTED", "REVISION_REQUESTED", "APPROVED", "CANCELLED", "DISPUTED", "UNKNOWN", "completed"]) {
    expect(isVerifiedWork({ status })).toBe(false);
  }
});