import { describe, expect, it } from "vitest";
import writeExcelFile from "write-excel-file/node";
import { applyDeterministicAccuracyChecks } from "../../server/accuracy";
import { normalizeCompilationSources } from "../../server/sourceNormalization";
import { applyWorkflowState, buildInputStatus } from "../../server/workflowState";
import { buildReportAttention } from "../lib/reportAttention";
import type { CompilationRequest, CompilationResult, CompiledRequirement } from "../types/prototype";

type LedgerRow = readonly [id: string, date: string, account: string, description: string, amount: number, category: string, rationale: string];

const agreementSource = { sourceName: "BridgeWorks_Award.docx", locator: "Page 3", excerpt: "Synthetic demonstration data — approved budget and financial conditions." };

const requirements: CompiledRequirement[] = [
  budget("BUD-PER", "Personnel", 120_000),
  budget("BUD-FR", "Fringe Benefits", 30_000),
  budget("BUD-EA", "Emergency Client Assistance", 60_000),
  budget("BUD-LGL", "Legal & Benefits Navigation", 25_000),
  budget("BUD-TECH", "Technology & Data Systems", 18_000),
  budget("BUD-TRV", "Local Travel", 15_000),
  budget("BUD-EVAL", "Evaluation", 37_000),
  budget("BUD-IND", "Indirect Costs", 20_000),
  requirement("RULE-VAR", "Explain any budget category variance of $7,500 or more."),
  requirement("RULE-REALLOC", "Budget reallocations of 15% or more require prior written approval."),
  requirement("RULE-AID-DOC", "Emergency Client Assistance requires a payment record and documentation of the housing-related purpose."),
  requirement("RULE-AID", "Written Program Director approval is required for assistance above $1,500 per household."),
  requirement("RULE-IND", "Indirect costs are limited to the lesser of $20,000 or 8% of actual eligible direct costs.")
];

const routine = (category: string) => `Account and description align to ${category}.`;
const rows: LedgerRow[] = [
  ...["2027-02-15", "2027-02-28", "2027-03-15", "2027-03-31", "2027-04-15", "2027-04-30", "2027-05-15", "2027-05-31", "2027-06-15", "2027-06-30", "2027-07-15", "2027-07-31"].map((date, index) => [`BW-PAY-${String(index + 1).padStart(3, "0")}`, date, "Personnel", `Grant-funded payroll allocation — pay period ${index + 1}`, 4_500, "Personnel", routine("Personnel")] as const),
  ...["2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31", "2027-06-30", "2027-07-31"].map((date, index) => [`BW-FR-${String(index + 1).padStart(3, "0")}`, date, "Fringe Benefits", `Monthly fringe allocation — month ${index + 1}`, 2_250, "Fringe Benefits", routine("Fringe Benefits")] as const),
  ["BW-EA-001", "2027-02-09", "Emergency Client Assistance", "Security deposit assistance", 1_200, "Emergency Client Assistance", "Account and purpose align; supporting documentation not supplied."],
  ["BW-EA-002", "2027-02-18", "Emergency Client Assistance", "Utility arrears stabilization", 950, "Emergency Client Assistance", "Account and purpose align; supporting documentation not supplied."],
  ["BW-EA-003", "2027-03-04", "Emergency Client Assistance", "Emergency rent assistance", 1_750, "Emergency Client Assistance", "Requires housing-purpose support and written program-director approval above $1,500."],
  ["BW-EA-004", "2027-03-19", "Emergency Client Assistance", "Security deposit assistance", 1_350, "Emergency Client Assistance", "Account and purpose align; supporting documentation not supplied."],
  ["BW-EA-005", "2027-04-02", "Emergency Client Assistance", "Short-term transportation support", 800, "Emergency Client Assistance", "Categorized as assistance; housing-related purpose documentation is needed."],
  ["BW-EA-006", "2027-04-20", "Emergency Client Assistance", "Emergency rent assistance", 2_200, "Emergency Client Assistance", "Requires housing-purpose support and written program-director approval above $1,500."],
  ["BW-EA-007", "2027-05-07", "Emergency Client Assistance", "Security deposit assistance", 1_100, "Emergency Client Assistance", "Account and purpose align; supporting documentation not supplied."],
  ["BW-EA-008", "2027-05-23", "Emergency Client Assistance", "Utility stabilization payment", 1_450, "Emergency Client Assistance", "Account and purpose align; supporting documentation not supplied."],
  ["BW-EA-009", "2027-06-06", "Emergency Client Assistance", "Participant transit assistance", 600, "Emergency Client Assistance", "Categorized as assistance; housing-related purpose documentation is needed."],
  ["BW-EA-010", "2027-06-21", "Emergency Client Assistance", "Move-in assistance", 980, "Emergency Client Assistance", "Account and purpose align; supporting documentation not supplied."],
  ["BW-EA-011", "2027-07-08", "Emergency Client Assistance", "Emergency rent assistance", 1_600, "Emergency Client Assistance", "Requires housing-purpose support and written program-director approval above $1,500."],
  ["BW-EA-012", "2027-07-24", "Emergency Client Assistance", "Security deposit assistance", 1_250, "Emergency Client Assistance", "Account and purpose align; supporting documentation not supplied."],
  ["BW-EA-013", "2027-07-28", "Emergency Client Assistance", "Refund of unused participant assistance", -250, "Emergency Client Assistance", "Credit against prior assistance payment."],
  ["BW-LGL-001", "2027-02-26", "Legal & Benefits Navigation", "February legal clinic services", 2_100, "Legal & Benefits Navigation", routine("Legal & Benefits Navigation")],
  ["BW-LGL-002", "2027-04-01", "Legal & Benefits Navigation", "March legal clinic services", 2_100, "Legal & Benefits Navigation", routine("Legal & Benefits Navigation")],
  ["BW-LGL-003", "2027-05-01", "Legal & Benefits Navigation", "April benefits navigation services", 2_100, "Legal & Benefits Navigation", "Potential duplicate transaction ID, date, amount, vendor, and invoice reference; validate before reporting."],
  ["BW-LGL-004", "2027-07-01", "Legal & Benefits Navigation", "June benefits navigation services", 2_100, "Legal & Benefits Navigation", routine("Legal & Benefits Navigation")],
  ["BW-LGL-003", "2027-05-01", "Legal & Benefits Navigation", "April benefits navigation services", 2_100, "Legal & Benefits Navigation", "Duplicate ledger row identified by transaction ID and invoice reference; do not include until resolved."],
  ["BW-TECH-001", "2027-02-05", "Technology & Data Systems", "Case management implementation fee", 12_000, "Technology & Data Systems", routine("Technology & Data Systems")],
  ["BW-TECH-002", "2027-03-01", "Technology & Data Systems", "Six-month software subscription", 5_000, "Technology & Data Systems", routine("Technology & Data Systems")],
  ["BW-TECH-003", "2027-04-12", "Technology & Data Systems", "Historical data migration", 4_200, "Technology & Data Systems", routine("Technology & Data Systems")],
  ["BW-TECH-004", "2027-06-15", "Technology & Data Systems", "Program laptops and accessories", 5_000, "Technology & Data Systems", "Confirm that equipment is allowable within approved case-management and reporting tools."],
  ...[["2027-02-28", 410], ["2027-03-31", 485], ["2027-04-30", 360], ["2027-05-31", 525], ["2027-07-15", 620]].map(([date, amount], index) => [`BW-TRV-${String(index + 1).padStart(3, "0")}`, String(date), "Local Travel", `Local travel transaction ${index + 1}`, Number(amount), "Local Travel", routine("Local Travel")] as const),
  ["BW-EVAL-001", "2027-04-15", "Malformed Account", "Evaluation design and baseline review", 2_250, "Evaluation", "Description and vendor align to Evaluation despite malformed account field."],
  ["BW-EVAL-002", "2027-07-20", "Malformed Account", "Interim data-quality review", 2_250, "Evaluation", "Description and vendor align to Evaluation despite malformed account field."],
  ...["2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31", "2027-06-30", "2027-07-31"].map((date, index) => [`BW-IND-${String(index + 1).padStart(3, "0")}`, date, "Indirect Costs", `Monthly indirect cost allocation — month ${index + 1}`, 1_500, "Indirect Costs", "Account and description align; cap calculation requires validated direct charges."] as const),
  ["BW-AMB-001", "2027-06-18", "Community Outreach", "Client services — June", 875, "Unmapped", "Insufficient detail to determine approved budget category."],
  ["BW-OOP-001", "2027-08-05", "Technology & Data Systems", "August case-management software renewal", 800, "Technology & Data Systems", "Within overall grant period but outside Interim Report 1 reporting period; exclude from this report."],
  ["BW-OOG-001", "2027-01-25", "Technology & Data Systems", "Pre-grant implementation deposit", 1_200, "Technology & Data Systems", "Occurs before the February 1, 2027 grant start; written authorization is required to charge it."]
];

const request: CompilationRequest = {
  organizationName: "BridgeWorks Family Services",
  grantName: "Northstar Community Fund — Family Stability & Housing Navigation Program",
  reportingPeriod: "February 1 – July 31, 2027",
  files: [
    { role: "awardAgreement", name: agreementSource.sourceName, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 100, data: "data:application/octet-stream;base64,QQ==" },
    { role: "ledgerExport", name: "BridgeWorks_GL.csv", mimeType: "text/csv", size: 100, data: csvData(rows) }
  ]
};

const rawResult: CompilationResult = {
  reportTitle: "Draft Interim Report 1 — Family Stability & Housing Navigation Program",
  summary: "Financial data was supplied.",
  grantProfile: {
    funderName: field("Northstar Community Fund"), grantName: field("Family Stability & Housing Navigation Program"), grantId: field("NCF-2027-021"),
    grantStartDate: field("February 1, 2027"), grantEndDate: field("July 31, 2028"), grantType: field("Restricted grant"), awardAmount: field("$325,000")
  },
  setupConflicts: [], inputStatus: [], workflow: { readiness: "not_ready", actionRequiredCount: 0, needsReviewCount: 0, missingInputCount: 0 }, requirements,
  mappings: rows.map(([transactionId, date, , description, amount, suggestedCategory, rationale]) => ({ transactionId, date, description, amount, suggestedCategory, confidence: 0, rationale, status: "blocked" as const })),
  missingInputs: [], narrative: [], qualityChecks: [],
  validation: {
    evidenceCoveragePercent: 0, sourceMatchedItems: 0, itemsNeedingReview: 0, blockedItems: rows.length, method: "Source check.",
    findings: rows.map(([transactionId], index) => ({ id: `VAL-${index + 1}`, itemId: `mapping:${transactionId}`, verdict: "blocked" as const, reason: "The model returned an uncalibrated confidence value.", source: agreementSource }))
  },
  warnings: [], generatedAt: "2026-08-10T00:00:00.000Z", model: "synthetic-test"
};

describe("exception-first processing for the 56-row BridgeWorks ledger", () => {
  const checked = applyDeterministicAccuracyChecks(request, rawResult);

  it("preserves the exact ledger and report-period totals", () => {
    expect(rows).toHaveLength(56);
    expect(rows.reduce((sum, row) => sum + row[4], 0)).toBe(137_955);
    expect(checked.financialAnalysis).toMatchObject({ ledgerTransactionCount: 56, mappedTransactionCount: 52, excludedTransactionCount: 4, mappedActualTotal: 132_980 });
  });

  it("calculates every current-period category total exactly", () => {
    const actuals = Object.fromEntries(checked.financialAnalysis?.budgetVariances.map((item) => [item.category, item.actualAmount]) || []);
    expect(actuals).toMatchObject({
      Personnel: 54_000, "Fringe Benefits": 13_500, "Emergency Client Assistance": 14_980, "Legal & Benefits Navigation": 8_400,
      "Technology & Data Systems": 26_200, "Local Travel": 2_400, Evaluation: 4_500, "Indirect Costs": 9_000
    });
  });

  it("auto-maps 51 routine rows without exposing fake 0% confidence", () => {
    const automaticallyMapped = checked.mappings.filter((item) => item.mappingConfidence === "high" && !["provisional", "excluded_duplicate", "excluded_outside_period", "excluded_grant_period"].includes(item.reportTreatment || ""));
    expect(automaticallyMapped).toHaveLength(51);
    expect(automaticallyMapped.every((item) => item.status === "verified" && item.confidence >= 0.9 && !item.requiresHumanAction)).toBe(true);
  });

  it("keeps mapping, compliance, and report treatment independent", () => {
    expect(checked.mappings.find((item) => item.transactionId === "BW-TECH-004")).toMatchObject({ mappingConfidence: "high", complianceStatus: "eligibility_review", reportTreatment: "provisional", status: "verified" });
    expect(checked.mappings.find((item) => item.transactionId === "BW-EA-003")).toMatchObject({ mappingConfidence: "high", complianceStatus: "evidence_required", reportTreatment: "pending_evidence", status: "verified" });
    expect(checked.mappings.find((item) => item.transactionId === "BW-AMB-001")).toMatchObject({ mappingConfidence: "unmapped", reportTreatment: "needs_category_review", status: "blocked" });
  });

  it("excludes one duplicate and both date exceptions without turning date rules into user actions", () => {
    expect(checked.mappings.filter((item) => item.reportTreatment === "excluded_duplicate")).toHaveLength(1);
    expect(checked.mappings.find((item) => item.transactionId === "BW-OOP-001")).toMatchObject({ reportTreatment: "excluded_outside_period", requiresHumanAction: false });
    expect(checked.mappings.find((item) => item.transactionId === "BW-OOG-001")).toMatchObject({ reportTreatment: "excluded_grant_period", requiresHumanAction: false });
  });

  it("raises the technology variance, three approval checks, equipment eligibility, and indirect-cap result", () => {
    expect(checked.financialAnalysis?.budgetVariances.find((item) => item.category === "Technology & Data Systems")).toMatchObject({ approvedAmount: 18_000, actualAmount: 26_200, varianceAmount: 8_200, variancePercent: 45.6, explanationRequired: true });
    expect(checked.financialAnalysis?.controls.find((item) => item.id === "material-variance")?.detail).toContain("$8,200 above the approved budget (+45.6%)");
    expect(checked.financialAnalysis?.controls.find((item) => item.id === "budget-reallocation-approval")).toMatchObject({ title: "Confirm whether the budget was formally modified", status: "review", requiresAction: true });
    expect(checked.financialAnalysis?.controls.find((item) => item.id === "budget-reallocation-approval")?.detail).toContain("This overage is a variance, not evidence that a formal budget modification occurred.");
    expect(checked.financialAnalysis?.controls.find((item) => item.id === "assistance-approvals")?.transactionIds).toEqual(["BW-EA-003", "BW-EA-006", "BW-EA-011"]);
    expect(checked.financialAnalysis?.controls.find((item) => item.id === "eligibility-review")?.transactionIds).toEqual(["BW-TECH-004"]);
    const indirect = checked.financialAnalysis?.controls.find((item) => item.id === "indirect-cost-limit");
    expect(indirect).toMatchObject({ status: "passed", requiresAction: false });
    expect(indirect?.detail).toContain("$123,980.00 eligible direct costs");
    expect(indirect?.detail).toContain("$9,918.40");
    expect(indirect?.detail).toContain("$918.40 remaining capacity");
  });

  it("surfaces four grouped financial decisions rather than 56 row approvals", () => {
    expect(buildReportAttention(checked).map((item) => item.title)).toEqual([
      "1 transaction needs a category decision",
      "1 potential duplicate needs review",
      "Review Technology & Data Systems allowability and variance",
      "Emergency assistance documentation"
    ]);
  });

  it("does not turn legacy routine mapping states back into row-by-row category work", () => {
    const legacyResult: CompilationResult = {
      ...checked,
      mappings: checked.mappings.map((mapping) => mapping.mappingConfidence === "high"
        ? { ...mapping, status: "blocked" as const, reportTreatment: "needs_category_review" as const, requiresHumanAction: true }
        : mapping)
    };
    const categoryAction = buildReportAttention(legacyResult).find((item) => item.id === "transaction-category-exceptions");
    expect(categoryAction).toMatchObject({ title: "1 transaction needs a category decision" });
    expect(categoryAction?.detail).toContain("BW-AMB-001");
    expect(categoryAction?.detail).not.toContain("BW-PAY-001");
  });

  it("recognizes and parses the uploaded GL workbook even when it was placed in the budget field", async () => {
    const buffer = await writeExcelFile([
      ["Transaction ID", "Date", "Account", "Description", "Amount"].map((value) => ({ value })),
      ...rows.map((row) => row.slice(0, 5).map((value) => ({ value })))
    ]).toBuffer();
    const misplaced: CompilationRequest = {
      ...request,
      files: [
        request.files[0],
        { role: "approvedBudget", name: "GrantDeskHQ_Synthetic_GL_Interim_Report_1.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: buffer.byteLength, data: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${buffer.toString("base64")}` }
      ]
    };
    const normalized = await normalizeCompilationSources(misplaced);
    expect(normalized.correctedLedgerRole).toBe(true);
    expect(normalized.request.files.find((file) => file.name.includes("Synthetic_GL"))?.role).toBe("ledgerExport");
    expect(normalized.ledgerRows).toHaveLength(56);
    const output = applyDeterministicAccuracyChecks(normalized.request, rawResult, normalized.ledgerRows);
    expect(output.financialAnalysis).toMatchObject({ ledgerTransactionCount: 56, mappedTransactionCount: 52, mappedActualTotal: 132_980 });
    expect(buildInputStatus(normalized.request, output).find((item) => item.role === "ledgerExport")).toMatchObject({ available: true });
  });

  it("collapses duplicate program checks and keeps generated financial work and future milestones out of current actions", () => {
    const programSource = { sourceName: "BridgeWorks_Program_Update.docx", locator: "Page 2", excerpt: "Synthetic program results." };
    const programChecks: NonNullable<CompilationResult["programChecks"]> = [
      programCheck("P2-CONFLICT", "data_conflict", "P2 assessment-count conflict", "The KPI table reports 158 while the activities section reports 160."),
      programCheck("P2-KPI", "kpi_result", "P2 — Housing stability assessments completed", "The KPI result is internally inconsistent: 158 versus 160."),
      programCheck("P6", "kpi_result", "P6 — Client satisfaction", "No confirmed result is available because the survey dataset remains under validation."),
      programCheck("DUP", "data_conflict", "Duplicate general-ledger transaction", "BW-LGL-003 appears twice in the ledger."),
      programCheck("DATES", "data_conflict", "Interim-period financial population and out-of-period transactions", "The ledger contains an out-of-period and a pre-grant transaction."),
      programCheck("BVA", "award_trigger", "Interim Report 1 budget-to-actual and variance explanation", "A budget-to-actual presentation and variance explanation are required."),
      programCheck("AID", "award_trigger", "Emergency-assistance approval threshold review", "Emergency-assistance approvals and support remain unresolved."),
      programCheck("PAYMENT", "award_trigger", "Interim Report 1 acceptance and second-installment condition", "The second installment follows funder acceptance of this report.")
    ];
    const withPrograms: CompilationResult = {
      ...checked,
      programChecks,
      qualityChecks: [
        ...checked.qualityChecks,
        ...programChecks.map((check) => ({ id: `program-${check.id}`, label: check.title, detail: check.detail, required: true, status: "review" as const }))
      ]
    };
    const requestWithProgram = {
      ...request,
      files: [...request.files, { role: "programUpdate" as const, name: programSource.sourceName, mimeType: "text/plain", size: 10, data: "data:text/plain;base64,dGVzdA==" }]
    };
    const workflow = applyWorkflowState(requestWithProgram, withPrograms);
    expect(buildReportAttention(workflow).map((item) => item.title)).toEqual([
      "1 transaction needs a category decision",
      "1 potential duplicate needs review",
      "Review Technology & Data Systems allowability and variance",
      "Emergency assistance documentation",
      "P2 assessment-count conflict",
      "P6 — Client satisfaction"
    ]);
    expect(workflow.programChecks?.find((check) => check.id === "PAYMENT")).toMatchObject({ severity: "info", resolution: "resolved" });
    expect(workflow.programChecks?.find((check) => check.id === "P2-KPI")).toMatchObject({ severity: "info", resolution: "resolved" });
  });
});

function budget(id: string, category: string, amount: number) { return requirement(id, `${category} — $${amount.toLocaleString("en-US")}`); }
function requirement(id: string, text: string): CompiledRequirement { return { id, requirement: text, source: { ...agreementSource, excerpt: text }, confidence: 0.99, status: "verified" }; }
function field(value: string) { return { value, confidence: 0.99, source: agreementSource, status: "verified" as const }; }
function csvData(values: LedgerRow[]) {
  const csv = ["Transaction ID,Date,Account,Description,Amount", ...values.map((row) => row.slice(0, 5).map((value) => String(value)).join(","))].join("\n");
  return `data:text/csv;base64,${Buffer.from(csv).toString("base64")}`;
}

function programCheck(id: string, type: NonNullable<CompilationResult["programChecks"]>[number]["type"], title: string, detail: string): NonNullable<CompilationResult["programChecks"]>[number] {
  return { id, type, title, detail, action: "Review this item.", owner: "Grants", severity: "review", sources: [agreementSource], resolution: "open", status: "review" };
}
