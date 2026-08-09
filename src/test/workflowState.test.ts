// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildInputStatus, detectSetupConflicts } from "../../server/workflowState";
import type { CompilationRequest, GrantProfile, GrantReportingPeriod } from "../types/prototype";

const source = { sourceName: "Comprehensive_Grant_Agreement.txt", locator: "Page 1", excerpt: "Community Pathways Foundation — Youth Workforce Advancement Initiative; October 1, 2026 through September 30, 2027." };
const profile: GrantProfile = {
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
});

function field(value: string) {
  return { value, confidence: 1, source, status: "verified" as const };
}
