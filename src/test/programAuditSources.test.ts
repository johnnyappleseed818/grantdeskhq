// @vitest-environment node
import { describe, expect, it } from "vitest";
import { reconcileProgramAuditSources } from "../../server/reportCompiler";
import type { CompilationRequest } from "../types/prototype";

const request: CompilationRequest = {
  organizationName: "Example",
  grantName: "Example grant",
  reportingPeriod: "January–June 2026",
  files: [
    { role: "programUpdate", name: "Synthetic_Program_Update.txt", mimeType: "text/plain", size: 1, data: "data:text/plain;base64,eA==" },
    { role: "awardAgreement", name: "Synthetic_Grant_Agreement.pdf", mimeType: "application/pdf", size: 1, data: "data:application/pdf;base64,eA==" }
  ]
};

describe("program-audit source reconciliation", () => {
  it("rebinds only an unambiguous filename alias to the uploaded filename", () => {
    const [check] = reconcileProgramAuditSources(request, [{ sources: [{ sourceName: "Synthetic Program Update", locator: "Current results", excerpt: "Confirmed result." }] }]);
    expect(check.sources[0].sourceName).toBe("Synthetic_Program_Update.txt");
  });

  it("does not replace an unrelated source citation", () => {
    const [check] = reconcileProgramAuditSources(request, [{ sources: [{ sourceName: "Unrelated source", locator: "Page 1", excerpt: "No matching upload." }] }]);
    expect(check.sources[0].sourceName).toBe("Unrelated source");
  });
});
