import { describe, expect, it } from "vitest";
import { agreementAnalysisProjection, budgetVsActualProjection, missingInputsProjection, reviewableDraftProjection } from "../../server/chatgptGrantReportingMcp.ts";
import type { PersistedCompilationResponse } from "../types/prototype.ts";

const saved = {
  reportId: "report_0123456789abcdef0123456789abcdef",
  report: { id: "report_0123456789abcdef0123456789abcdef", organizationName: "Example Nonprofit", grantName: "Community Grant", reportingPeriod: "Q3 2026", status: "review_required", evidenceCoveragePercent: 88, unresolvedItems: 2, sourceCount: 2, createdAt: "2026-10-04T00:00:00.000Z", updatedAt: "2026-10-04T00:00:00.000Z" },
  sources: [{ role: "awardAgreement", name: "agreement.pdf", mimeType: "application/pdf", size: 500 }],
  result: {
    reportTitle: "Community Grant — Q3 2026", summary: "A reviewable draft.", generatedAt: "2026-10-04T00:00:00.000Z", model: "test",
    grantProfile: { funderName: { value: "Community Funder", confidence: 1, status: "verified", source: { sourceName: "agreement.pdf", locator: "p. 1", excerpt: "Community Funder" } }, grantName: { value: "Community Grant", confidence: 1, status: "verified", source: { sourceName: "agreement.pdf", locator: "p. 1", excerpt: "Community Grant" } }, grantId: { value: "CG-1", confidence: 1, status: "verified", source: { sourceName: "agreement.pdf", locator: "p. 1", excerpt: "CG-1" } }, grantStartDate: { value: "2026-01-01", confidence: 1, status: "verified", source: { sourceName: "agreement.pdf", locator: "p. 1", excerpt: "2026-01-01" } }, grantEndDate: { value: "2026-12-31", confidence: 1, status: "verified", source: { sourceName: "agreement.pdf", locator: "p. 1", excerpt: "2026-12-31" } }, grantType: { value: "restricted", confidence: 1, status: "verified", source: { sourceName: "agreement.pdf", locator: "p. 1", excerpt: "restricted" } } },
    setupConflicts: [], inputStatus: [], workflow: { readiness: "needs_review", actionRequiredCount: 1, needsReviewCount: 1, missingInputCount: 1 },
    requirements: [{ id: "req-1", requirement: "Submit a quarterly report.", source: { sourceName: "agreement.pdf", locator: "p. 2", excerpt: "Quarterly report" }, confidence: 1, status: "verified", canonicalType: "reporting_requirement", applicability: "current" }],
    mappings: [], missingInputs: [{ id: "input-1", question: "Provide the program update.", assignedRole: "Program", reason: "The outcome narrative is absent.", status: "open" }], narrative: [{ id: "draft-1", text: "Program outcomes need confirmation.", evidenceType: "needs_confirmation", source: { sourceName: "agreement.pdf", locator: "p. 2", excerpt: "Quarterly report" }, status: "review" }], qualityChecks: [], warnings: ["Human review required."],
    validation: { evidenceCoveragePercent: 88, sourceMatchedItems: 4, itemsNeedingReview: 1, blockedItems: 0, method: "fixture", findings: [] },
    financialAnalysis: { ledgerTransactionCount: 2, mappedTransactionCount: 2, excludedTransactionCount: 0, mappedActualTotal: 1200, budgetVariances: [{ category: "Program", approvedAmount: 1000, actualAmount: 1200, varianceAmount: 200, variancePercent: 20, explanationThreshold: 100, explanationRequired: true, status: "explanation_required", transactionIds: ["txn-1"] }], controls: [{ id: "material-variance", title: "Explain variance", detail: "A documented explanation is required.", status: "review", requiresAction: true, transactionIds: ["txn-1"] }] },
    programChecks: [{ id: "program-1", type: "kpi_result", title: "Program update required", detail: "No current result is supplied.", action: "Request the update.", owner: "Program", severity: "action_required", sources: [{ sourceName: "agreement.pdf", locator: "p. 2", excerpt: "Quarterly report" }], resolution: "open", status: "review" }]
  }
} as unknown as PersistedCompilationResponse;

describe("private ChatGPT grant-reporting tool projections", () => {
  it("returns source-linked agreement data without source-file contents", () => {
    const output = agreementAnalysisProjection(saved);
    expect(output.requirements[0]).toMatchObject({ id: "req-1", source: { sourceName: "agreement.pdf" } });
    expect(JSON.stringify(output)).not.toContain("data:");
  });

  it("returns persisted deterministic budget variances without recalculating or submitting anything", () => {
    expect(budgetVsActualProjection(saved.result)).toMatchObject({ mappedActualTotal: 1200, budgetVariances: [{ category: "Program", varianceAmount: 200, explanationRequired: true }], controlsRequiringAction: [{ id: "material-variance" }] });
  });

  it("keeps missing inputs and reviewable drafts explicitly source-supported", () => {
    expect(missingInputsProjection(saved.result)).toMatchObject({ missingInputs: [{ id: "input-1", status: "open" }], openProgramChecks: [{ id: "program-1", sources: [{ sourceName: "agreement.pdf" }] }] });
    expect(reviewableDraftProjection(saved.result)).toMatchObject({ reviewRequired: true, narrative: [{ id: "draft-1", source: { sourceName: "agreement.pdf" } }] });
  });
});
