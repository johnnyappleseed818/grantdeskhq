import { describe, expect, it } from "vitest";
import { applyDeterministicAccuracyChecks } from "../../server/accuracy";
import { buildInputStatus } from "../../server/workflowState";
import type { CompilationRequest, CompilationResult, CompiledRequirement } from "../types/prototype";

const source = { sourceName: "BridgeWorks_Award.docx", locator: "Page 3", excerpt: "Approved budget and financial conditions." };

const requirements: CompiledRequirement[] = [
  requirement("BUD-TECH", "Technology & Data Systems — $18,000", "Technology & Data Systems — $18,000"),
  requirement("BUD-AID", "Emergency Client Assistance — $20,000", "Emergency Client Assistance — $20,000"),
  requirement("BUD-PER", "Personnel — $100,000", "Personnel — $100,000"),
  requirement("BUD-IND", "Indirect Costs — $20,000", "Indirect Costs — $20,000"),
  requirement("RULE-VAR", "Explain any budget category variance of $7,500 or more.", "Variances of $7,500 or more require explanation."),
  requirement("RULE-AID", "Written Program Director approval is required for assistance above $1,500 per household.", "Assistance above $1,500 requires written approval."),
  requirement("RULE-IND", "Indirect costs are limited to the lesser of $20,000 or 8% of actual eligible direct costs.", "The lesser of $20,000 or 8% of actual direct costs.")
];

const rows = [
  ["BW-TECH-001", "2027-03-01", "Technology & Data Systems", "Program laptops", 10_000],
  ["BW-TECH-002", "2027-04-01", "Technology & Data Systems", "Data systems", 11_200],
  ["BW-TECH-004", "2027-05-01", "Technology & Data Systems", "Program laptops and accessories", 5_000],
  ["BW-AID-001", "2027-03-12", "Emergency Client Assistance", "Household assistance", 1_750],
  ["BW-AID-002", "2027-04-12", "Emergency Client Assistance", "Household assistance", 2_200],
  ["BW-AID-003", "2027-05-12", "Emergency Client Assistance", "Household assistance", 1_600],
  ["BW-PER-001", "2027-06-01", "Personnel", "Salary allocation", 92_230],
  ["BW-IND-001", "2027-06-30", "Indirect Costs", "Indirect cost allocation", 9_000]
] as const;

const request: CompilationRequest = {
  organizationName: "BridgeWorks Family Services",
  grantName: "Northstar Community Fund — Family Stability & Housing Navigation Program",
  reportingPeriod: "February 1 – July 31, 2027",
  files: [
    { role: "awardAgreement", name: source.sourceName, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 100, data: "data:application/octet-stream;base64,QQ==" },
    { role: "ledgerExport", name: "BridgeWorks_GL.csv", mimeType: "text/csv", size: 100, data: csvData(rows) }
  ]
};

const result: CompilationResult = {
  reportTitle: "Draft Interim Report 1 — Family Stability & Housing Navigation Program",
  summary: "Financial data was supplied.",
  grantProfile: {
    funderName: field("Northstar Community Fund"),
    grantName: field("Family Stability & Housing Navigation Program"),
    grantId: field("NCF-2027-021"),
    grantStartDate: field("February 1, 2027"),
    grantEndDate: field("July 31, 2028"),
    grantType: field("Restricted grant")
  },
  setupConflicts: [],
  inputStatus: [],
  workflow: { readiness: "not_ready", actionRequiredCount: 0, needsReviewCount: 0, missingInputCount: 0 },
  requirements,
  mappings: rows.map(([transactionId, date, , description, amount]) => ({
    transactionId,
    date,
    description,
    amount,
    suggestedCategory: transactionId === "BW-TECH-004" ? "Unmapped" : rows.find((row) => row[0] === transactionId)?.[2] || "Unmapped",
    confidence: transactionId === "BW-TECH-004" ? 0 : 0.98,
    rationale: "Synthetic mapping suggestion.",
    status: transactionId === "BW-TECH-004" ? "blocked" as const : "verified" as const
  })),
  missingInputs: [],
  narrative: [],
  qualityChecks: [],
  validation: {
    evidenceCoveragePercent: 0,
    sourceMatchedItems: 0,
    itemsNeedingReview: 0,
    blockedItems: 1,
    method: "Source check.",
    findings: rows.map(([transactionId]) => ({ id: `VAL-${transactionId}`, itemId: `mapping:${transactionId}`, verdict: transactionId === "BW-TECH-004" ? "blocked" as const : "source_matched" as const, reason: "Checked.", source }))
  },
  warnings: [],
  generatedAt: "2026-08-10T00:00:00.000Z",
  model: "synthetic-test"
};

describe("deterministic award + ledger financial controls", () => {
  const checked = applyDeterministicAccuracyChecks(request, result);

  it("turns an exact ledger-account and budget-category match into a reviewable suggestion", () => {
    expect(checked.mappings.find((item) => item.transactionId === "BW-TECH-004")).toMatchObject({ suggestedCategory: "Technology & Data Systems", status: "review", reviewReason: "exact_budget_match", requiresHumanAction: true });
  });

  it("calculates the exact technology variance and triggers the source-defined threshold", () => {
    expect(checked.financialAnalysis?.budgetVariances.find((item) => item.category === "Technology & Data Systems")).toMatchObject({ approvedAmount: 18_000, actualAmount: 26_200, varianceAmount: 8_200, explanationThreshold: 7_500, explanationRequired: true });
  });

  it("flags all three assistance transactions above the approval threshold", () => {
    const control = checked.financialAnalysis?.controls.find((item) => item.id === "assistance-approvals");
    expect(control).toMatchObject({ status: "review", requiresAction: true, transactionIds: ["BW-AID-001", "BW-AID-002", "BW-AID-003"] });
  });

  it("calculates the indirect-cost ceiling deterministically", () => {
    const control = checked.financialAnalysis?.controls.find((item) => item.id === "indirect-cost-limit");
    expect(control).toMatchObject({ status: "passed", requiresAction: false });
    expect(control?.detail).toContain("$9,000 charged");
    expect(control?.detail).toContain("$123,980 eligible direct costs");
    expect(control?.detail).toContain("$9,918");
  });

  it("accepts a verified budget embedded in the award agreement", () => {
    const budget = buildInputStatus(request, { requirements, missingInputs: [] }).find((item) => item.role === "approvedBudget");
    expect(budget).toMatchObject({ available: true, detail: "Budget details were found in the award document." });
  });
});

function requirement(id: string, text: string, excerpt: string): CompiledRequirement {
  return { id, requirement: text, source: { ...source, excerpt }, confidence: 0.99, status: "verified" };
}

function field(value: string) {
  return { value, confidence: 0.99, source, status: "verified" as const };
}

function csvData(values: typeof rows) {
  const csv = ["Transaction ID,Date,Account,Description,Amount", ...values.map((row) => row.map((value) => String(value)).join(","))].join("\n");
  return `data:text/csv;base64,${Buffer.from(csv).toString("base64")}`;
}
