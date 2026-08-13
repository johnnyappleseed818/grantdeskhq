// @vitest-environment node
import { describe, expect, it } from "vitest";
import { analysisIntegrityIssues } from "../../server/analysisIntegrity";
import { applyEvidenceMatches } from "../../server/evidenceReconciliation";
import { buildFinancialAnalysis, findExactBudgetCategory, parseReportingPeriod } from "../../server/financialControls";
import { applyBoundedReviewDecision } from "../../server/persistence";
import { areNearDuplicateRequirements, canonicalizeRequirements } from "../../server/reportCompiler";
import { prototypeFixture } from "../data/prototypeFixture";
import type { CompilationResult, CompiledRequirement, SupportingEvidenceFile } from "../types/prototype";

const source = { sourceName: "Award.docx", locator: "Section 5", excerpt: "Financial rules." };

describe("analysis mechanism audit controls", () => {
  it("keeps variance, reallocation, and indirect thresholds isolated inside a shared source section", () => {
    const requirements: CompiledRequirement[] = [
      req("TECH", "Technology & Data Systems — $18,000."),
      req("PERSONNEL", "Personnel — $100,000."),
      req("INDIRECT", "Indirect Costs — $20,000."),
      req("RULES", "Technology & Data Systems has an approved amount of $18,000. Explain any category variance of $7,500 or more. Indirect Costs may not exceed the lesser of $20,000 or 8% of actual direct costs. Prior written approval is required for a budget change of 15% or more to a single category.")
    ];
    const ledger = [
      { id: "TECH-1", date: "2027-03-01", description: "Technology", amount: 26_200, account: "Technology & Data Systems", vendor: "Vendor" },
      { id: "PER-1", date: "2027-03-02", description: "Payroll", amount: 97_780, account: "Personnel", vendor: "Payroll" },
      { id: "IND-1", date: "2027-03-31", description: "Indirect", amount: 9_000, account: "Indirect Costs", vendor: "Allocation" }
    ];
    const mappings = ledger.map((row) => ({ transactionId: row.id, date: row.date, description: row.description, amount: row.amount, suggestedCategory: row.account, confidence: 0.99, rationale: "Exact category.", status: "verified" as const, mappingConfidence: "high" as const, complianceStatus: "clear" as const, reportTreatment: "included" as const }));
    const analysis = buildFinancialAnalysis({ reportingPeriod: "February 1 – July 31, 2027", files: [] }, requirements, profile(), ledger, mappings);

    expect(analysis.budgetVariances.find((item) => item.category === "Technology & Data Systems")).toMatchObject({ explanationThreshold: 7_500, actualAmount: 26_200, varianceAmount: 8_200 });
    expect(analysis.controls.find((item) => item.id === "budget-reallocation-approval")?.detail).toContain("15% or more");
    expect(analysis.controls.find((item) => item.id === "indirect-cost-limit")?.detail).toContain("8%, capped at $20,000.00");
  });

  it("treats month-only reporting ranges as full calendar months and rejects vague quarters", () => {
    const period = parseReportingPeriod("January–June 2026");
    expect(period?.start.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(period?.end.toISOString().slice(0, 10)).toBe("2026-06-30");
    expect(parseReportingPeriod("Q1 2027")).toBeNull();
  });

  it("blocks financial totals when exact reporting-period boundaries are unavailable", () => {
    const requirements = [req("PERSONNEL", "Personnel — $1,000.")];
    const ledger = [{ id: "T1", date: "2027-03-01", description: "Payroll", amount: 100, account: "Personnel", vendor: "Payroll" }];
    const mappings = [{ transactionId: "T1", date: "2027-03-01", description: "Payroll", amount: 100, suggestedCategory: "Personnel", confidence: 1, rationale: "Exact", status: "verified" as const, reportTreatment: "included" as const }];
    const analysis = buildFinancialAnalysis({ reportingPeriod: "Q1 2027", files: [] }, requirements, profile(), ledger, mappings);
    expect(analysis).toMatchObject({ mappedTransactionCount: 0, excludedTransactionCount: 1, mappedActualTotal: 0 });
    expect(analysis.controls).toContainEqual(expect.objectContaining({ id: "reporting-period-boundary", status: "blocked", requiresAction: true }));
  });

  it("does not turn a ledger label mentioned near an approval threshold into an approved budget category", () => {
    expect(findExactBudgetCategory("Program Services", [req("APPROVAL", "Program Services transactions above $875 require approval.")])).toBe("");
  });

  it("does not collapse distinct dated or monetary obligations as duplicates", () => {
    expect(areNearDuplicateRequirements("Submit Interim Report 1 by August 31, 2027.", "Submit Interim Report 2 by February 29, 2028.")).toBe(false);
    expect(areNearDuplicateRequirements("Explain variances of $7,500 or more.", "Approval is required for assistance above $1,500.")).toBe(false);
    expect(areNearDuplicateRequirements("Submit the report by August 31, 2027.", "The report is due August 31, 2027.")).toBe(true);
  });

  it("produces a stable distinct requirement set regardless of model order or duplicated wording", () => {
    const first = req("A", "Submit the Interim Report by August 31, 2027.");
    const duplicate = { ...req("B", "The Interim Report is due August 31, 2027."), confidence: 0.97 };
    const distinct = req("C", "Submit the Second Interim Report by February 29, 2028.");
    const left = canonicalizeRequirements([first, duplicate, distinct]);
    const right = canonicalizeRequirements([distinct, duplicate, first]);
    expect(left).toEqual(right);
    expect(left).toHaveLength(2);
    expect(left.map((item) => item.requirement).join(" ")).toContain("February 29, 2028");
  });

  it("applies one bounded review decision without accepting client-authored report mutations", () => {
    const result: CompilationResult = {
      ...prototypeFixture,
      qualityChecks: [...prototypeFixture.qualityChecks, { id: "REVIEW-ONE", label: "Review one item", detail: "Human judgment is needed.", required: true, status: "review" }]
    };
    const reviewed = applyBoundedReviewDecision(result, "REVIEW-ONE");
    expect(reviewed.reportTitle).toBe(result.reportTitle);
    expect(reviewed.mappings).toEqual(result.mappings);
    expect(reviewed.qualityChecks.find((item) => item.id === "REVIEW-ONE")).toMatchObject({ status: "passed" });
    expect(() => applyBoundedReviewDecision(result, "NOT-A-REAL-ITEM")).toThrow(/not an open review decision/i);
  });

  it("blocks internal financial totals that do not reconcile to row treatments", () => {
    const result: CompilationResult = {
      ...prototypeFixture,
      requirements: [req("PERSONNEL", "Personnel — $1,000.")], narrative: [], programChecks: [], evidenceFiles: [],
      mappings: [{ transactionId: "T1", date: "2027-03-01", description: "Payroll", amount: 100, suggestedCategory: "Personnel", confidence: 1, rationale: "Exact", status: "verified", reportTreatment: "included" }],
      financialAnalysis: { ledgerTransactionCount: 1, mappedTransactionCount: 1, excludedTransactionCount: 0, mappedActualTotal: 999, budgetVariances: [{ category: "Personnel", approvedAmount: 1000, actualAmount: 100, varianceAmount: -900, variancePercent: -90, explanationThreshold: null, explanationRequired: false, status: "within_budget", transactionIds: ["T1"] }], controls: [] }
    };
    expect(analysisIntegrityIssues(result).join(" ")).toMatch(/included transaction amounts total 100.*reports 999/i);
  });

  it("uses approved-category eligibility when reconciling mapping treatments to financial totals", () => {
    const result: CompilationResult = {
      ...prototypeFixture,
      requirements: [req("PERSONNEL", "Personnel — $1,000.")], narrative: [], programChecks: [], evidenceFiles: [],
      mappings: [
        { transactionId: "T1", date: "2027-03-01", description: "Payroll", amount: 100, suggestedCategory: "Personnel", confidence: 1, rationale: "Exact", status: "verified", reportTreatment: "included" },
        { transactionId: "T2", date: "2027-03-02", description: "Ambiguous", amount: 50, suggestedCategory: "Program Services", confidence: 0, rationale: "Not approved", status: "blocked", reportTreatment: "provisional" }
      ],
      financialAnalysis: { ledgerTransactionCount: 2, mappedTransactionCount: 1, excludedTransactionCount: 1, mappedActualTotal: 100, budgetVariances: [{ category: "Personnel", approvedAmount: 1000, actualAmount: 100, varianceAmount: -900, variancePercent: -90, explanationThreshold: null, explanationRequired: false, status: "within_budget", transactionIds: ["T1"] }], controls: [] }
    };
    expect(analysisIntegrityIssues(result)).toEqual([]);
  });

  it("does not mistake a response count for a satisfaction score", () => {
    const p6 = evidence("survey-no-score", "P6_Survey.xlsx", "program:P6", "P6 client satisfaction");
    p6.matches[0].source.excerpt = "Finalized survey contains 80 valid responses. The reportable score is not present in this extract.";
    const result: CompilationResult = {
      ...prototypeFixture,
      narrative: [],
      programChecks: [{ id: "P6", type: "kpi_result", title: "P6 — Average client satisfaction", detail: "The survey remains under validation.", action: "Add the final result.", owner: "Program", severity: "review", sources: [source], resolution: "open", status: "review" }]
    };
    const reconciled = applyEvidenceMatches(result, [p6]);
    expect(reconciled.narrative.some((item) => item.id === "evidence-p6-satisfaction")).toBe(false);
    expect(reconciled.programChecks?.find((item) => item.id === "P6")?.resolution).toBe("open");
  });

  it("never treats an assistance support register as the underlying payment and purpose records", () => {
    const result: CompilationResult = {
      ...prototypeFixture,
      mappings: [{ transactionId: "EA-1", date: "2027-03-01", description: "Rent assistance", amount: 1200, suggestedCategory: "Emergency Client Assistance", confidence: 1, rationale: "Documentation required.", status: "review", complianceStatus: "evidence_required", complianceDetail: "Payment record and housing-purpose documentation required.", reportTreatment: "pending_evidence" }]
    };
    const register = evidence("register", "Emergency_Assistance_Support_Register.xlsx", "transaction:EA-1:payment", "Payment record for EA-1");
    register.matches.push({ ...register.matches[0], targetId: "transaction:EA-1:purpose", targetLabel: "Housing-purpose support for EA-1" });
    register.parsingMessage = "Support register listing references to payment and housing-purpose records.";
    const reconciled = applyEvidenceMatches(result, [register]);
    expect(reconciled.mappings[0]).toMatchObject({ evidenceRequirementStatus: "open", evidenceSatisfiedBy: [] });
  });
});

function req(id: string, requirement: string): CompiledRequirement {
  return { id, requirement, source: { ...source, excerpt: requirement }, confidence: 1, status: "verified" };
}

function profile() {
  const field = (value: string) => ({ value, confidence: 1, source, status: "verified" as const });
  return { funderName: field("Funder"), grantName: field("Grant"), grantId: field("G-1"), grantStartDate: field("February 1, 2027"), grantEndDate: field("July 31, 2028"), grantType: field("Restricted") };
}

function evidence(id: string, name: string, targetId: string, targetLabel: string): SupportingEvidenceFile {
  return { id: `evidence_${id}`, name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 100, uploadedAt: "2026-08-11T00:00:00.000Z", parsingStatus: "parsed", relevance: "matched", matches: [{ targetType: "kpi", targetId, targetLabel, confidence: 0.98, status: "matched", rationale: "Direct evidence.", source: { sourceName: name, locator: "Sheet 1", excerpt: "Direct evidence." } }] };
}
