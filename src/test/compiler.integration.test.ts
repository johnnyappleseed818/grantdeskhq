// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileGrantReport } from "../../server/reportCompiler";
import type { CompilationRequest, CompilerFile, SourceRole } from "../types/prototype";

const enabled = process.env.RUN_AI_SMOKE === "1";

describe.skipIf(!enabled)("live AI compiler smoke test", () => {
  it("compiles and independently verifies the synthetic source package", async () => {
    const files: CompilerFile[] = [
      fromAsset("awardAgreement", "Synthetic_Grant_Agreement.pdf", "application/pdf"),
      fromAsset("approvedBudget", "Approved_Grant_Budget.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      fromAsset("ledgerExport", "General_Ledger_Export.csv", "text/csv"),
      fromAsset("funderTemplate", "Synthetic_Funder_Report_Draft.pdf", "application/pdf"),
      fromText("programUpdate", "Synthetic_Program_Update.txt", "Confirmed youth served: 118 of target 120. Three additional school-site visits were approved. One travel receipt is missing."),
      fromAsset("supportingEvidence", "Transaction_Evidence_Schedule.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    ];
    const request: CompilationRequest = {
      organizationName: "Hope Community Services",
      grantName: "Pacific Youth Foundation — Youth Access Initiative",
      reportingPeriod: "January 1–June 30, 2026",
      files
    };
    const result = await compileGrantReport(request);
    expect(result.reportTitle).toBeTruthy();
    expect(result.requirements.length).toBeGreaterThan(0);
    expect(result.validation.findings.length).toBeGreaterThan(0);
    expect(result.validation.evidenceCoveragePercent).toBeGreaterThanOrEqual(0);
    expect(result.validation.evidenceCoveragePercent).toBeLessThanOrEqual(100);
    expect(result.warnings.length).toBeGreaterThan(0);
  }, 120_000);
});

function fromAsset(role: SourceRole, name: string, mimeType: string): CompilerFile {
  const buffer = fs.readFileSync(path.resolve("public", "samples", name));
  return { role, name, mimeType, size: buffer.byteLength, data: `data:${mimeType};base64,${buffer.toString("base64")}` };
}

function fromText(role: SourceRole, name: string, text: string): CompilerFile {
  const buffer = Buffer.from(text, "utf8");
  return { role, name, mimeType: "text/plain", size: buffer.byteLength, data: `data:text/plain;base64,${buffer.toString("base64")}` };
}
