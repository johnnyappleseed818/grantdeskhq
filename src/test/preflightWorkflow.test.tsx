import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PREFLIGHT_SYSTEM_PROMPT } from "../../server/preflightCompiler";
import { sanitizeSetupDecisions } from "../../server/persistence";
import { remainingSetupConflicts } from "../lib/agreementSetup";
import { AgreementSetupCard, ReportingSchedule, ReportWorkflow } from "../pages/CompilePage";
import type { CompilationPreflightResult, GrantReportingPeriod, GrantWorkflowObligation } from "../types/prototype";

const source = {
  sourceName: "GrantDeskHQ_Synthetic_Grant_Agreement_Test_2.docx",
  locator: "Page 1",
  excerpt: "Northstar Community Fund — Family Stability & Housing Navigation Program"
};

const periods: GrantReportingPeriod[] = [
  period("RP1", "Interim Report 1", "2027-02-01", "2027-07-31", "2027-08-31"),
  period("RP2", "Interim Report 2", "2027-08-01", "2028-01-31", "2028-02-29"),
  period("RP3", "Interim Report 3", "2028-02-01", "2028-04-30", "2028-05-31"),
  period("RP4", "Final Report", "2028-05-01", "2028-07-31", "2028-09-29")
];

const obligations: GrantWorkflowObligation[] = [
  obligation("finance-gl", "Add the general ledger", "Finance", "required_now", "Always required for Interim Report 1"),
  obligation("program-kpis", "Provide six program measures", "Program", "required_now", "Always required for Interim Report 1"),
  obligation("variance", "Explain material variances", "Grants", "conditional", "A variance reaches $7,500"),
  obligation("match", "Certify the $40,000 cash match", "Approver", "future", "Required with the Final Report"),
  obligation("certification", "Final certification", "Approver", "not_applicable", "Not required for Interim Report 1")
];

const preflight: CompilationPreflightResult = {
  grantProfile: {
    funderName: field("Northstar Community Fund"),
    grantName: field("Family Stability & Housing Navigation Program"),
    grantId: field("NCF-2027-021"),
    grantStartDate: field("2027-02-01"),
    grantEndDate: field("2028-07-31"),
    grantType: field("Restricted grant"),
    awardAmount: field("$325,000")
  },
  reportingPeriods: periods,
  referencePeriodId: "RP1",
  workflowObligations: obligations,
  setupConflicts: [{
    id: "setup-grant-identity",
    type: "grant_identity",
    title: "Grant details do not match",
    detail: "The report setup and agreement identify different grants.",
    enteredValue: "Pacific Youth Foundation",
    sourceValue: "Northstar Community Fund",
    source,
    status: "action_required"
  }]
};

describe("agreement-driven report setup", () => {
  it("offers one action that configures the verified grant and first report", () => {
    const apply = vi.fn();
    render(<AgreementSetupCard preflight={preflight} onApply={apply} />);
    expect(screen.getByRole("heading", { name: "Set up this report from the agreement" })).toBeInTheDocument();
    expect(screen.getByText("Northstar Community Fund — Family Stability & Housing Navigation Program")).toBeInTheDocument();
    expect(screen.getByText("$325,000")).toBeInTheDocument();
    expect(screen.getByText("Interim Report 1")).toBeInTheDocument();
    expect(screen.getByText("Aug 31, 2027")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Use these details/i }));
    expect(apply).toHaveBeenCalledOnce();
  });

  it("shows every verified reporting obligation as an actionable schedule", () => {
    const select = vi.fn();
    render(<ReportingSchedule periods={periods} selectedPeriodId="RP1" onSelect={select} />);
    expect(screen.getByText("4 reporting obligations identified")).toBeInTheDocument();
    fireEvent.click(screen.getByText("View reporting schedule"));
    expect(screen.getAllByRole("button")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /Interim Report 2/i }));
    expect(select).toHaveBeenCalledWith(periods[1]);
  });

  it("separates current, conditional, future, and not-applicable work", () => {
    render(<ReportWorkflow obligations={obligations} referencePeriod={periods[0]} availableSources={["ledgerExport", "programUpdate"]} />);
    expect(screen.getByRole("heading", { name: "Required for this report" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Conditional requirements" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Required later" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Not required for this report" })).toBeInTheDocument();
    expect(screen.getByText(/A variance reaches \$7,500/)).toBeInTheDocument();
    expect(screen.getByText("GrantDeskHQ monitors these automatically and creates an action only when the condition occurs.")).toBeInTheDocument();
    expect(screen.getByText("Accounting data available · validation pending")).toBeInTheDocument();
    expect(screen.getByText("Program input available · validation pending")).toBeInTheDocument();
    expect(screen.getByText("Monitoring · trigger evaluated during report analysis")).toBeInTheDocument();
    expect(screen.getByText("Not yet applicable")).toBeInTheDocument();
    expect(screen.getAllByText("Source verified").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Verified$/)).not.toBeInTheDocument();
  });

  it("one-click agreement setup clears organization, grant, and reporting-period conflicts together", () => {
    const conflicts: CompilationPreflightResult["setupConflicts"] = [
      { ...preflight.setupConflicts[0], id: "organization", type: "organization_identity", title: "Organization details do not match" },
      preflight.setupConflicts[0],
      { ...preflight.setupConflicts[0], id: "period", type: "reporting_period", title: "Reporting period is outside the grant period", suggestedPeriodId: "RP1", suggestedValue: "Feb 1 – Jul 31, 2027" }
    ];
    expect(remainingSetupConflicts({ ...preflight, setupConflicts: conflicts })).toEqual([]);
  });

  it("preserves the previous manual setup in the audit entry", () => {
    const [entry] = sanitizeSetupDecisions({
      organizationName: "Hope Community Services",
      grantName: "Northstar Community Fund — Family Stability & Housing Navigation Program",
      reportingPeriod: "Feb 1 – Jul 31, 2027",
      files: [],
      setupDecisions: [{
        at: "2026-08-09T12:00:00.000Z",
        action: "agreement_workflow_applied",
        detail: "Configured the grant and Interim Report 1 from the agreement.",
        sourceName: source.sourceName,
        previousGrantName: "Pacific Youth Foundation — Youth Access Initiative",
        previousReportingPeriod: "January 1–June 30, 2026",
        selectedObligationId: "RP1"
      }]
    }, "owner-uid");
    expect(entry).toMatchObject({
      action: "agreement_workflow_applied",
      previousGrantName: "Pacific Youth Foundation — Youth Access Initiative",
      previousReportingPeriod: "January 1–June 30, 2026",
      selectedObligationId: "RP1"
    });
  });
});

describe("preflight obligation completeness instructions", () => {
  it.each([
    "matching funds",
    "budget-change thresholds",
    "variance thresholds",
    "indirect-cost caps",
    "per-transaction assistance or expense approvals",
    "record retention",
    "incident notifications",
    "extension deadlines",
    "unspent-funds returns"
  ])("explicitly searches for %s", (term) => {
    expect(PREFLIGHT_SYSTEM_PROMPT).toContain(term);
  });
});

function field(value: string) {
  return { value, confidence: 0.99, source, status: "verified" as const };
}

function period(id: string, title: string, startDate: string, endDate: string, dueDate: string): GrantReportingPeriod {
  return { id, title, startDate, endDate, dueDate, source, confidence: 0.99, status: "verified" };
}

function obligation(id: string, title: string, owner: GrantWorkflowObligation["owner"], applicability: GrantWorkflowObligation["applicability"], trigger: string): GrantWorkflowObligation {
  return { id, title, detail: `${title} for the selected report.`, owner, applicability, trigger, source, confidence: 0.99, status: "verified" };
}
