// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyWorkflowState, buildInputStatus, customerWarnings, detectSetupConflicts } from "../../server/workflowState";
import { prototypeFixture } from "../data/prototypeFixture";
import type { CompilationRequest, GrantProfile, GrantReportingPeriod } from "../types/prototype";

const source = { sourceName: "Comprehensive_Grant_Agreement.txt", locator: "Page 1", excerpt: "Community Pathways Foundation — Youth Workforce Advancement Initiative; October 1, 2026 through September 30, 2027." };
const profile: GrantProfile = {
  granteeName: field("BridgeWorks Family Services"),
  funderName: field("Community Pathways Foundation"),
  grantName: field("Youth Workforce Advancement Initiative"),
  grantId: field("CPF-2026-0417"),
  grantStartDate: field("2026-10-01"),
  grantEndDate: field("2027-09-30"),
  grantType: field("Restricted grant")
};
const reportingPeriods: GrantReportingPeriod[] = [{
  id: "RP1",
  title: "Quarterly Report 1",
  startDate: "2026-10-01",
  endDate: "2026-12-31",
  dueDate: "2027-01-31",
  source,
  confidence: 0.99,
  status: "verified"
}];

describe("early report setup checks", () => {
  it("detects both a different grant and an impossible reporting period", () => {
    const conflicts = detectSetupConflicts({
      grantName: "Pacific Youth Foundation — Youth Access Initiative",
      reportingPeriod: "January 1–June 30, 2026"
    }, profile, reportingPeriods);
    expect(conflicts.map((conflict) => conflict.type)).toEqual(["grant_identity", "reporting_period"]);
    expect(conflicts.every((conflict) => conflict.status === "action_required")).toBe(true);
    expect(conflicts[1]).toMatchObject({
      detail: "The report period January 1 – June 30, 2026 falls outside the grant period October 1, 2026 – September 30, 2027.",
      suggestedValue: "October 1 – December 31, 2026",
      suggestedPeriodId: "RP1",
      suggestedLabel: "Quarterly Report 1",
      suggestedDueDate: "January 31, 2027"
    });
  });

  it("accepts matching grant details and an in-period report", () => {
    expect(detectSetupConflicts({
      grantName: "Community Pathways Foundation — Youth Workforce Advancement Initiative",
      reportingPeriod: "October 1–December 31, 2026"
    }, profile)).toEqual([]);
  });

  it("detects a grantee mismatch and clears it when the organization matches the verified award", () => {
    expect(detectSetupConflicts({ organizationName: "Hope Community Services", grantName: "Community Pathways Foundation — Youth Workforce Advancement Initiative", reportingPeriod: "October 1–December 31, 2026" }, profile).map((item) => item.type)).toEqual(["organization_identity"]);
    expect(detectSetupConflicts({ organizationName: "BridgeWorks Family Services", grantName: "Community Pathways Foundation — Youth Workforce Advancement Initiative", reportingPeriod: "October 1–December 31, 2026" }, profile)).toEqual([]);
  });

  it("keeps model metadata and internal role names out of customer warnings", () => {
    expect(customerWarnings([
      "The supplied program update is explicitly an internal document and says it has not been submitted to the funder.",
      "No approvedBudget, funderTemplate, or supportingEvidence source role was supplied.",
      "The award agreement and program update each state that the materials are synthetic test documents.",
      "Financial totals come directly from your uploaded accounting data. Our AI-powered solution does not calculate or invent transaction amounts.",
      "BW-TECH-004 brings mapped Technology & Data Systems spending to $26,200 against the annual category amount.",
      "A verified source contains a material ambiguity that still needs review."
    ], true)).toEqual(["A verified source contains a material ambiguity that still needs review."]);
    expect(customerWarnings([], true)).toEqual(["Working draft — human review required."]);
  });

  it("marks missing completion inputs as unavailable instead of verified", () => {
    const request: CompilationRequest = {
      organizationName: "Hope Community Services",
      grantName: "Community Pathways Foundation — Youth Workforce Advancement Initiative",
      reportingPeriod: "October 1–December 31, 2026",
      files: [{ role: "awardAgreement", name: "agreement.txt", mimeType: "text/plain", size: 1, data: "data:text/plain;base64,eA==" }]
    };
    const status = buildInputStatus(request);
    expect(status.find((item) => item.role === "awardAgreement")?.available).toBe(true);
    expect(status.find((item) => item.role === "ledgerExport")).toMatchObject({ available: false, requiredForCompletion: true });
    expect(status.find((item) => item.role === "programUpdate")).toMatchObject({ available: false, requiredForCompletion: true });
  });

  it("keeps persisted parsed core inputs available after a supporting-evidence-only update", () => {
    const request: CompilationRequest = {
      organizationName: "BridgeWorks Family Services",
      grantName: "Community Pathways Foundation — Youth Workforce Advancement Initiative",
      reportingPeriod: "October 1–December 31, 2026",
      files: [{ role: "supportingEvidence", name: "P1-enrollment.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 10, data: "data:application/octet-stream;base64,eA==" }]
    };
    const status = buildInputStatus(request, {
      missingInputs: [],
      requirements: [{ id: "BUDGET", requirement: "Approved budget: Personnel $152,000.", source: { ...source, locator: "Page 2, Section 4" }, confidence: 1, status: "verified" }],
      grantProfile: profile,
      narrative: [{ id: "P1", text: "BridgeWorks served 172 households.", evidenceType: "program_response", source: { sourceName: "Program_Update.docx", locator: "Section 2, P1", excerpt: "172 households served" }, status: "verified" }],
      mappings: [{ transactionId: "GL-1", date: "2026-10-05", description: "Payroll", amount: 100, suggestedCategory: "Personnel", confidence: 0.99, rationale: "Mapped from the ledger.", status: "verified" }],
      programChecks: [],
      evidenceFiles: []
    });
    expect(status.filter((item) => item.requiredForCompletion).map((item) => [item.role, item.available])).toEqual([
      ["awardAgreement", true],
      ["approvedBudget", true],
      ["ledgerExport", true],
      ["programUpdate", true]
    ]);
  });

  it("source-verifies explicit high-confidence requirements while preserving genuine ambiguity", () => {
    const explicit = { ...prototypeFixture.requirements[0], id: "EXPLICIT", requirement: "Payment schedule: $162,500 at execution; $81,250 after Interim Report 1 acceptance; $81,250 after Interim Report 2 acceptance.", confidence: 1, status: "review" as const, source: { ...prototypeFixture.requirements[0].source, locator: "Pages 1–2" } };
    const ambiguous = { ...prototypeFixture.requirements[0], id: "AMBIGUOUS", requirement: "The source wording is ambiguous and needs clarification.", confidence: 1, status: "review" as const, source: { ...prototypeFixture.requirements[0].source, locator: "Page 5, Section 9" } };
    const request: CompilationRequest = {
      organizationName: "Hope Community Services",
      grantName: "Pacific Youth Foundation — Youth Access Initiative",
      reportingPeriod: "January 1–June 30, 2026",
      files: [{ role: "awardAgreement", name: "Synthetic_Grant_Agreement.pdf", mimeType: "application/pdf", size: 1, data: "data:application/pdf;base64,eA==" }]
    };
    const result = applyWorkflowState(request, {
      ...prototypeFixture,
      requirements: [explicit, ambiguous],
      validation: {
        ...prototypeFixture.validation,
        findings: [
          ...prototypeFixture.validation.findings,
          { id: "VERIFY-EXPLICIT", itemId: "requirement:EXPLICIT", verdict: "source_matched" as const, reason: "The award explicitly states this payment schedule.", source: explicit.source },
          { id: "VERIFY-AMBIGUOUS", itemId: "requirement:AMBIGUOUS", verdict: "review" as const, reason: "The source wording is ambiguous.", source: ambiguous.source }
        ]
      }
    });
    expect(result.requirements.find((item) => item.id === "EXPLICIT")?.status).toBe("verified");
    expect(result.requirements.find((item) => item.id === "AMBIGUOUS")?.status).toBe("review");
  });

  it("source-verifies an exact cited requirement at 97% confidence instead of leaving it blocked", () => {
    const exact = {
      ...prototypeFixture.requirements[0],
      id: "EXACT-KPI-EVIDENCE",
      requirement: "For Interim Report 1, the KPI evidence must include enrollment, completed assessment, placement, 120-day follow-up, benefits-screening, and client-survey records.",
      confidence: 0.97,
      status: "blocked" as const,
      source: { sourceName: "Synthetic Restricted Grant Award Agreement", locator: "Section 7, Program Performance Metrics", excerpt: "Evidence: enrollment record; completed assessment records; verified placement records; 120-day follow-up records; benefits-screening checklists; client survey." }
    };
    const request: CompilationRequest = {
      organizationName: "BridgeWorks Family Services",
      grantName: "Northstar Community Fund — Family Stability & Housing Navigation Program",
      reportingPeriod: "February 1–July 31, 2027",
      files: [{ role: "awardAgreement", name: "GrantDeskHQ_Synthetic_Grant_Agreement_Test_2.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1, data: "data:application/octet-stream;base64,eA==" }]
    };
    const result = applyWorkflowState(request, {
      ...prototypeFixture,
      requirements: [exact],
      validation: {
        ...prototypeFixture.validation,
        findings: [{ id: "VERIFY-EXACT", itemId: "requirement:EXACT-KPI-EVIDENCE", verdict: "blocked" as const, reason: "Evidence not uploaded yet.", source: exact.source }]
      }
    });

    expect(result.requirements[0].status).toBe("verified");
  });

  it("source-verifies a clearly cited award-header requirement independently of fulfillment evidence", () => {
    const exact = {
      ...prototypeFixture.requirements[0],
      id: "EXACT-SERVICE-AREA",
      requirement: "Use the award to serve the stated service area of Lakeview County and East Harbor District.",
      confidence: 0.9,
      status: "blocked" as const,
      source: {
        sourceName: "SYNTHETIC TEST DOCUMENT — NOT A REAL GRANT",
        locator: "Award header",
        excerpt: "Service Area: Lakeview County, including the East Harbor District."
      }
    };
    const request: CompilationRequest = {
      organizationName: "BridgeWorks Family Services",
      grantName: "Northstar Community Fund — Family Stability & Housing Navigation Program",
      reportingPeriod: "February 1–July 31, 2027",
      files: [{ role: "awardAgreement", name: "GrantDeskHQ_Synthetic_Grant_Agreement_Test_2.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1, data: "data:application/octet-stream;base64,eA==" }]
    };
    const result = applyWorkflowState(request, {
      ...prototypeFixture,
      requirements: [exact],
      validation: {
        ...prototypeFixture.validation,
        findings: [{
          id: "VERIFY-SERVICE-AREA",
          itemId: "requirement:EXACT-SERVICE-AREA",
          verdict: "blocked" as const,
          reason: "Current-period service-area fulfillment evidence was not supplied.",
          source: exact.source
        }]
      }
    });

    expect(result.requirements[0].status).toBe("verified");
  });

  it("keeps future match progress and expected pre-submission status out of current actions", () => {
    const check = (id: string, title: string, detail: string) => ({ id, type: "award_trigger" as const, title, detail, action: "Review this item.", owner: "Grants" as const, severity: "review" as const, sources: [source], resolution: "open" as const, status: "review" as const });
    const request: CompilationRequest = {
      organizationName: "Hope Community Services",
      grantName: "Pacific Youth Foundation — Youth Access Initiative",
      reportingPeriod: "January 1–June 30, 2026",
      files: [{ role: "awardAgreement", name: "Synthetic_Grant_Agreement.pdf", mimeType: "application/pdf", size: 1, data: "data:application/pdf;base64,eA==" }]
    };
    const result = applyWorkflowState(request, {
      ...prototypeFixture,
      reportTitle: "Interim Report 1 Draft — Family Stability & Housing Navigation Program",
      programChecks: [
        check("MATCH", "Cumulative matching-funds progress", "$18,000 of $40,000 is documented; match status is required in Interim Report 2."),
        check("SUBMISSION", "Interim Report 1 submission deadline", "This internal draft has not been submitted through the Fund portal. Submit by August 31, 2027."),
        check("SUBMISSION-MODEL", "Interim Report 1 deadline and submission requirement", "The supplied update is marked internal and does not prove portal submission or acceptance; check the report package for timely submission."),
        check("SUBMISSION-REMAINS", "Interim Report 1 submission remains unresolved", "The program update states that it has not been submitted to the funder, while the award requires Interim Report 1 to be submitted through the Fund portal by August 31, 2027. Confirm portal submission or document the status and any lateness."),
        check("UNMAPPED-MODEL", "Unresolved mapping of program-services charge", "The $875 BW-AMB-001 charge is not an approved budget category and cannot be determined."),
        check("UNMAPPED-AMOUNT", "Potentially unallowable or insufficiently supported client-service charge", "The $875 Program Services charge lacks enough description to establish that it is allowable under approved categories."),
        check("UNMAPPED-MIXED", "Unresolved ledger account-to-budget mappings", "The ledger contains a Program Services account/category with $875 and evaluation rows whose Account Code field is populated as Impact Metrics LLC rather than a budget account code. Neither mapping is directly tied to an approved budget category. These are unresolved classifications, not evidence that a new grant-budget category was formally created."),
        check("EVALUATION-MODEL", "Unresolved ledger-to-approved-budget category mapping", "The ledger includes $4,500 charged to account code/name Impact Metrics LLC, while the approved budget category is Evaluation. The account label does not itself establish that a new grant-budget category was created; the mapping to Evaluation is unresolved."),
        check("PRIVACY", "Participant-level illustrative outcome requires privacy-control confirmation", "Client A is stated to be de-identified, but confirm no prohibited participant information is included."),
        check("NOTICE", "Program Director change notification", "The awareness date and notification evidence require confirmation within five business days.")
      ],
      mappings: [
        {
          ...prototypeFixture.mappings[0],
          transactionId: "BW-AMB-001",
          amount: 875,
          suggestedCategory: "Unmapped",
          mappingConfidence: "unmapped",
          reportTreatment: "needs_category_review",
          reviewReason: "ambiguous"
        },
        {
          ...prototypeFixture.mappings[0],
          transactionId: "BW-EVAL-001",
          amount: 2_250,
          suggestedCategory: "Evaluation",
          mappingConfidence: "high",
          reportTreatment: "included",
          reviewReason: undefined
        },
        {
          ...prototypeFixture.mappings[0],
          transactionId: "BW-EVAL-002",
          amount: 2_250,
          suggestedCategory: "Evaluation",
          mappingConfidence: "high",
          reportTreatment: "included",
          reviewReason: undefined
        }
      ],
      financialAnalysis: {
        ledgerTransactionCount: 3,
        mappedTransactionCount: 2,
        excludedTransactionCount: 1,
        mappedActualTotal: 4_500,
        budgetVariances: [{ category: "Evaluation", approvedAmount: 14_500, actualAmount: 4_500, varianceAmount: -10_000, variancePercent: -69, explanationThreshold: 7_500, explanationRequired: true, status: "explanation_required", transactionIds: ["BW-EVAL-001", "BW-EVAL-002"] }],
        controls: []
      },
      qualityChecks: [
        ...prototypeFixture.qualityChecks,
        { id: "deterministic-privacy-scan", label: "Prohibited PII scan", detail: "No obvious prohibited PII was detected in current reporting content.", required: true, status: "passed" }
      ]
    });
    expect(result.programChecks?.find((item) => item.id === "MATCH")).toMatchObject({ severity: "info", resolution: "resolved" });
    expect(result.programChecks?.find((item) => item.id === "SUBMISSION")).toMatchObject({ severity: "info", resolution: "resolved" });
    expect(result.programChecks?.find((item) => item.id === "SUBMISSION-MODEL")).toMatchObject({ severity: "info", resolution: "resolved" });
    expect(result.programChecks?.find((item) => item.id === "SUBMISSION-REMAINS")).toMatchObject({ severity: "info", resolution: "resolved" });
    expect(result.programChecks?.find((item) => item.id === "UNMAPPED-MODEL")).toMatchObject({ severity: "info", resolution: "resolved" });
    expect(result.programChecks?.find((item) => item.id === "UNMAPPED-AMOUNT")).toMatchObject({ severity: "info", resolution: "resolved" });
    expect(result.programChecks?.find((item) => item.id === "UNMAPPED-MIXED")).toMatchObject({ severity: "info", resolution: "resolved" });
    expect(result.programChecks?.find((item) => item.id === "EVALUATION-MODEL")).toMatchObject({ severity: "info", resolution: "resolved" });
    expect(result.programChecks?.find((item) => item.id === "PRIVACY")).toMatchObject({ severity: "info", resolution: "resolved" });
    expect(result.programChecks?.find((item) => item.id === "NOTICE")).toMatchObject({ severity: "review", resolution: "open" });
  });

  it("does not create a human action for model-described dates already excluded deterministically", () => {
    const request: CompilationRequest = {
      organizationName: "BridgeWorks Family Services",
      grantName: "Northstar Community Fund — Family Stability & Housing Navigation Program",
      reportingPeriod: "February 1–July 31, 2027",
      files: [{ role: "awardAgreement", name: "award.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1, data: "data:application/octet-stream;base64,eA==" }]
    };
    const check = {
      id: "PERIOD-COST-REVIEW",
      type: "award_trigger" as const,
      title: "Period-of-performance cost review",
      detail: "Two ledger charges require period-of-performance treatment: BW-OOP-001 is dated August 5, 2027, after the February 1–July 31, 2027 reporting period, and BW-OOG-001 is dated January 25, 2027, before the February 1, 2027 grant start date. Neither should be included in Interim Report 1 actual expenditures absent written authorization.",
      action: "Review these transactions.",
      owner: "Finance" as const,
      severity: "review" as const,
      sources: [source],
      resolution: "open" as const,
      status: "review" as const
    };
    const excluded = {
      ...prototypeFixture.mappings[0],
      transactionId: "BW-OOP-001",
      date: "2027-08-05",
      reportTreatment: "excluded_outside_period" as const,
      requiresHumanAction: false
    };
    const result = applyWorkflowState(request, {
      ...prototypeFixture,
      reportTitle: "Interim Report 1 Draft — Family Stability & Housing Navigation Program",
      programChecks: [check],
      mappings: [excluded]
    });

    expect(result.programChecks?.[0]).toMatchObject({ severity: "info", resolution: "resolved" });
  });
});

function field(value: string) {
  return { value, confidence: 1, source, status: "verified" as const };
}
