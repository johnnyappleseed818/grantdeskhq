// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileGrantReport } from "../../server/reportCompiler";
import type { CompilationRequest, CompilationResult, CompilerFile, SourceRole } from "../types/prototype";

const enabled = process.env.RUN_AI_SMOKE === "1";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe.skipIf(!enabled)("live AI compiler smoke test", () => {
  it("compiles and independently verifies the synthetic source package", async () => {
    const files: CompilerFile[] = [
      fromAsset("awardAgreement", "Synthetic_Grant_Agreement.pdf", "application/pdf"),
      fromAsset("approvedBudget", "Approved_Grant_Budget.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      fromAsset("ledgerExport", "General_Ledger_Export.csv", "text/csv"),
      fromAsset("funderTemplate", "Synthetic_Funder_Report_Draft.pdf", "application/pdf"),
      fromText("programUpdate", "Synthetic_Program_Update.txt", "Confirmed youth served: 118 of target 120. Three additional school-site visits were approved. One travel receipt is missing."),
      fromText("supportingEvidence", "GrantDeskHQ_Confirmed_Workflow_Data.txt", JSON.stringify({ programMetrics: [{ label: "Youth served", target: 120, actual: 118 }], budgetVsActual: [] })),
      fromAsset("supportingEvidence", "Transaction_Evidence_Schedule.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    ];
    const request: CompilationRequest = {
      organizationName: "Hope Community Services",
      grantName: "Pacific Youth Foundation — Youth Access Initiative",
      reportingPeriod: "January 1–June 30, 2026",
      files
    };
    const result = await runCompiler(request);
    if (result.qualityChecks.find((check) => check.id === "deterministic-workflow-facts")?.status !== "passed") {
      console.log(JSON.stringify({
        event: "ai_smoke_workflow_fact_failure",
        check: result.qualityChecks.find((item) => item.id === "deterministic-workflow-facts"),
        blockedNarrative: result.narrative.filter((item) => item.status === "blocked"),
        blockedFindings: result.validation.findings.filter((item) => item.verdict === "blocked")
      }, null, 2));
    }
    expect(result.reportTitle).toBeTruthy();
    expect(result.requirements.length).toBeGreaterThan(0);
    expect(result.validation.findings.length).toBeGreaterThan(0);
    expect(result.validation.evidenceCoveragePercent).toBeGreaterThanOrEqual(0);
    expect(result.validation.evidenceCoveragePercent).toBeLessThanOrEqual(100);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.mappings).toHaveLength(20);
    expect(result.mappings.every((mapping) => mapping.transactionId !== "FAKE-999")).toBe(true);
    expect(result.qualityChecks.find((check) => check.id === "deterministic-ledger")?.status).toBe("passed");
    expect(result.qualityChecks.find((check) => check.id === "deterministic-workflow-facts")?.status).toBe("passed");
    expect(result.narrative.some((statement) => /hotel/i.test(statement.text))).toBe(false);
  }, 300_000);
});

async function runCompiler(request: CompilationRequest): Promise<CompilationResult> {
  const endpoint = process.env.COMPILER_ENDPOINT;
  if (!endpoint) return compileGrantReport(request);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
  if (!response.ok) throw new Error(`Remote compiler returned ${response.status}: ${await response.text()}`);
  return response.json() as Promise<CompilationResult>;
}

function fromAsset(role: SourceRole, name: string, mimeType: string): CompilerFile {
  const buffer = fs.readFileSync(path.join(projectRoot, "public", "samples", name));
  return { role, name, mimeType, size: buffer.byteLength, data: `data:${mimeType};base64,${buffer.toString("base64")}` };
}

function fromText(role: SourceRole, name: string, text: string): CompilerFile {
  const buffer = Buffer.from(text, "utf8");
  return { role, name, mimeType: "text/plain", size: buffer.byteLength, data: `data:text/plain;base64,${buffer.toString("base64")}` };
}
