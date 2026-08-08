// @vitest-environment node
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { applyDeterministicAccuracyChecks, parseLedger } from "../../server/accuracy";
import { evaluateCompilationAccuracy } from "../../server/accuracyEvaluation";
import type { CompilationRequest, CompilationResult, SourceReference, ValidationFinding } from "../types/prototype";

const agreementSource: SourceReference = {
  sourceName: "Agreement.txt",
  locator: "Reporting requirements",
  excerpt: "Award $150,000: Personnel $90,000; Program Supplies $35,000; Local Travel $15,000; Indirect Overhead $10,000. Travel over $1,000 requires an itemized receipt and written justification. Explain variance over 10% from elapsed spending plan. Narrative limit 200 words. Report youth served. Signed certification required."
};
const programSource: SourceReference = { sourceName: "Program.txt", locator: "Six-month update", excerpt: "Confirmed youth served: 118 of target 120." };

function request(): CompilationRequest {
  const ledger = fs.readFileSync("public/samples/General_Ledger_Export.csv");
  const facts = JSON.stringify({ programMetrics: [{ label: "Youth served", target: 120, actual: 118 }], budgetVsActual: [] });
  return {
    organizationName: "Hope Community Services",
    grantName: "Youth Access Initiative",
    reportingPeriod: "January–June 2026",
    files: [
      file("ledgerExport", "General_Ledger_Export.csv", "text/csv", ledger),
      file("awardAgreement", "Agreement.txt", "text/plain", Buffer.from(agreementSource.excerpt)),
      file("programUpdate", "Program.txt", "text/plain", Buffer.from(programSource.excerpt)),
      file("supportingEvidence", "GrantDeskHQ_Confirmed_Workflow_Data.txt", "text/plain", Buffer.from(facts))
    ]
  };
}

function accurateResult(input: CompilationRequest): CompilationResult {
  const requirements = [
    "Total award is $150,000.", "Personnel budget is $90,000.", "Program Supplies budget is $35,000.", "Local Travel budget is $15,000.", "Indirect Overhead budget is $10,000.",
    "Travel over $1,000 requires an itemized receipt.", "Travel over $1,000 requires written justification.", "Explain variance over 10% from the elapsed spending plan.", "Narrative limit is 200 words.", "Report youth served.", "Signed certification is required."
  ].map((requirement, index) => ({ id: `REQ-${index + 1}`, requirement, source: agreementSource, confidence: 1, status: "verified" as const }));
  const mappings = parseLedger(input).map((row) => ({ transactionId: row.id, date: row.date, description: row.description, amount: row.amount, suggestedCategory: row.id === "UNM-001" ? "Unmapped" : "Reviewed category", confidence: 1, rationale: "Matched by transaction ID.", status: row.id === "UNM-001" ? "blocked" as const : "verified" as const }));
  const narrative = [{ id: "NAR-1", text: "Hope Community Services served 118 youth during the first six months, reaching 98.3% of its target.", evidenceType: "calculation" as const, source: programSource, status: "verified" as const }];
  const expectedIds = [...requirements.map((item) => `requirement:${item.id}`), ...mappings.map((item) => `mapping:${item.transactionId}`), "narrative:NAR-1"];
  const findings: ValidationFinding[] = expectedIds.map((itemId, index) => ({ id: `VAL-${index + 1}`, itemId, verdict: "source_matched", reason: "Matched.", source: itemId.startsWith("narrative") ? programSource : agreementSource }));
  const result: CompilationResult = {
    reportTitle: "Six-Month Progress Report",
    summary: "Source-grounded draft.",
    grantProfile: {
      funderName: profileField("Information required"),
      grantName: profileField("Youth Access Initiative"),
      grantId: profileField("Information required"),
      grantStartDate: profileField("Information required"),
      grantEndDate: profileField("Information required"),
      grantType: profileField("Information required")
    },
    setupConflicts: [],
    inputStatus: [
      { role: "awardAgreement", label: "Award document", available: true, core: true, requiredForCompletion: true, detail: "Available for this report.", actionLabel: "Add award document" },
      { role: "approvedBudget", label: "Approved budget", available: false, core: true, requiredForCompletion: true, detail: "Add the approved grant budget.", actionLabel: "Add approved budget" },
      { role: "ledgerExport", label: "Accounting data", available: true, core: true, requiredForCompletion: true, detail: "Available for this report.", actionLabel: "Add accounting data" },
      { role: "funderTemplate", label: "Funder report form", available: false, core: true, requiredForCompletion: false, detail: "Optional.", actionLabel: "Add funder form" },
      { role: "programUpdate", label: "Program results", available: true, core: true, requiredForCompletion: true, detail: "Available for this report.", actionLabel: "Add program update" },
      { role: "supportingEvidence", label: "Supporting evidence", available: true, core: false, requiredForCompletion: true, detail: "Available for this report.", actionLabel: "Add supporting evidence" }
    ],
    workflow: { readiness: "not_ready", actionRequiredCount: 0, needsReviewCount: 0, missingInputCount: 3 },
    requirements,
    mappings,
    missingInputs: [
      { id: "MISS-1", question: "Please provide the receipt for TRV-003.", assignedRole: "Program Director", reason: "TRV-003 receipt is missing.", status: "open" },
      { id: "MISS-2", question: "Please sign the certification.", assignedRole: "Approver", reason: "Certification is not signed.", status: "open" },
      { id: "MISS-3", question: "Please map UNM-001 to a grant category.", assignedRole: "Controller", reason: "UNM-001 has no grant category.", status: "open" }
    ],
    narrative,
    qualityChecks: [],
    validation: { evidenceCoveragePercent: 100, sourceMatchedItems: findings.length, itemsNeedingReview: 0, blockedItems: 0, method: "Source check.", findings },
    warnings: ["Professional review required."],
    generatedAt: "2026-08-07T00:00:00.000Z",
    model: "evaluation-fixture"
  };
  return applyDeterministicAccuracyChecks(input, result);
}

describe("AI workflow accuracy scoring", () => {
  it("scores a fully source-grounded workflow at 100%", () => {
    const input = request();
    const evaluation = evaluateCompilationAccuracy(input, accurateResult(input));
    expect(evaluation.score).toBe(100);
    expect(evaluation.criticalFailures).toEqual([]);
    expect(evaluation.passed).toBe(true);
  });

  it("fails regardless of score when the narrative invents hotel costs", () => {
    const input = request();
    const result = accurateResult(input);
    result.narrative[0] = { ...result.narrative[0], text: `${result.narrative[0].text} Travel increased because of unexpected hotel costs.` };
    const evaluation = evaluateCompilationAccuracy(input, result);
    expect(evaluation.criticalFailures).toContain("The workflow introduced an unsupported hotel-cost explanation.");
    expect(evaluation.passed).toBe(false);
  });
});

function file(role: CompilationRequest["files"][number]["role"], name: string, mimeType: string, buffer: Buffer) {
  return { role, name, mimeType, size: buffer.byteLength, data: `data:${mimeType};base64,${buffer.toString("base64")}` };
}

function profileField(value: string) {
  return {
    value,
    confidence: value === "Information required" ? 0 : 1,
    source: agreementSource,
    status: value === "Information required" ? "not_evaluated" as const : "verified" as const
  };
}
