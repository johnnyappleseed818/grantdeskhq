// @vitest-environment node
import { describe, expect, it } from "vitest";
import { compilationReportId } from "../../server/persistence";

describe("report compilation idempotency", () => {
  it("uses the same tenant-scoped report ID when a request is retried", () => {
    const requestId = "3dd8a462-480c-4ed7-a4a3-6fcb92d1427a";
    const first = compilationReportId("user-a", requestId);
    expect(compilationReportId("user-a", requestId)).toBe(first);
    expect(compilationReportId("user-b", requestId)).not.toBe(first);
    expect(first).toMatch(/^report_[a-f0-9]{32}$/);
  });
});
