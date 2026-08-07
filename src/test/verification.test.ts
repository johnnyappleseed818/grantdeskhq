// @vitest-environment node
import { describe, expect, it } from "vitest";
import { enforceVerificationCompleteness } from "../../server/verification";
import type { ValidationFinding } from "../types/prototype";

const finding = (itemId: string): ValidationFinding => ({
  id: `finding-${itemId}`,
  itemId,
  verdict: "source_matched",
  reason: "Matched the selected source.",
  source: { sourceName: "Agreement.pdf", locator: "page 1", excerpt: "Required text" }
});

describe("verification completeness gate", () => {
  it("accepts exactly one finding for every expected candidate", () => {
    const checked = enforceVerificationCompleteness(["requirement:r1", "mapping:t1"], [finding("requirement:r1"), finding("mapping:t1")]);
    expect(checked).toHaveLength(2);
    expect(checked.every((item) => item.verdict === "source_matched")).toBe(true);
  });

  it("blocks omitted, duplicate, unknown, and reused candidate IDs", () => {
    const checked = enforceVerificationCompleteness(
      ["requirement:r1", "mapping:t1", "mapping:t1", "narrative:n1"],
      [finding("requirement:r1"), finding("requirement:r1"), finding("unknown:x")]
    );
    expect(checked.some((item) => item.itemId === "mapping:t1" && /reused output ID/i.test(item.reason))).toBe(true);
    expect(checked.some((item) => item.itemId === "narrative:n1" && /did not return a finding/i.test(item.reason))).toBe(true);
    expect(checked.some((item) => /more than one finding/i.test(item.reason))).toBe(true);
    expect(checked.some((item) => /unknown candidate ID/i.test(item.reason))).toBe(true);
    expect(checked.filter((item) => item.verdict === "blocked").length).toBeGreaterThanOrEqual(4);
  });
});
