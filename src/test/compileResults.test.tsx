import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { prototypeFixture } from "../data/prototypeFixture";
import { CompilerResults } from "../pages/CompilePage";

const actions = {
  setActiveTab: vi.fn(),
  onResolve: vi.fn(),
  onDownload: vi.fn(),
  onEditSetup: vi.fn(),
  onAddSources: vi.fn()
};

describe("report review trust states", () => {
  it("does not offer a review override for an objective setup conflict", () => {
    const result = {
      ...prototypeFixture,
      setupConflicts: [{
        id: "setup-grant-identity",
        type: "grant_identity" as const,
        title: "Grant details do not match",
        detail: "The uploaded award identifies a different grant.",
        enteredValue: "Youth Access Initiative",
        sourceValue: "Youth Workforce Advancement Initiative",
        source: prototypeFixture.grantProfile.grantName.source,
        status: "action_required" as const
      }]
    };
    render(<CompilerResults result={result} activeTab="review" {...actions} />);
    const conflict = screen.getByRole("heading", { name: "Grant details do not match" }).closest("article");
    expect(conflict).not.toBeNull();
    expect(within(conflict!).getByRole("button", { name: "Fix report setup" })).toBeInTheDocument();
    expect(within(conflict!).queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
  });

  it("shows missing accounting data as not evaluated with an add-information action", () => {
    const result = {
      ...prototypeFixture,
      inputStatus: prototypeFixture.inputStatus.map((item) => item.role === "ledgerExport" ? { ...item, available: false } : item),
      qualityChecks: [...prototypeFixture.qualityChecks, {
        id: "deterministic-ledger",
        label: "Ledger reconciliation",
        detail: "Not evaluated — no accounting export has been added yet.",
        required: true,
        status: "not_evaluated" as const
      }]
    };
    render(<CompilerResults result={result} activeTab="review" {...actions} />);
    fireEvent.click(screen.getByText("View detailed source and quality checks"));
    const ledgerCheck = screen.getByRole("heading", { name: "Ledger reconciliation" }).closest("article");
    expect(ledgerCheck).not.toBeNull();
    expect(within(ledgerCheck!).getByText("Not evaluated")).toBeInTheDocument();
    expect(within(ledgerCheck!).getByRole("button", { name: "Add information" })).toBeInTheDocument();
    expect(within(ledgerCheck!).queryByRole("button", { name: /confirm|reviewed/i })).not.toBeInTheDocument();
  });

  it("shows grouped human decisions instead of exposing internal check counts as actions", () => {
    const result = { ...prototypeFixture, workflow: { ...prototypeFixture.workflow, actionRequiredCount: 58, needsReviewCount: 19, missingInputCount: 5 } };
    render(<CompilerResults result={result} activeTab="overview" {...actions} />);
    expect(screen.getByText(/GrantDeskHQ ran \d+ checks\. You only need to review \d+ things?\./)).toBeInTheDocument();
    expect(screen.getByText("Your actions")).toBeInTheDocument();
    expect(screen.queryByText("58")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Six-Month Progress Report" })).toBeInTheDocument();
  });

  it("shows only unresolved program decisions in the inputs workflow", () => {
    const source = prototypeFixture.grantProfile.grantName.source;
    const result = {
      ...prototypeFixture,
      programChecks: [
        { id: "KPI-1", type: "kpi_result" as const, title: "Households receiving navigation", detail: "Current-period result is available.", action: "No action needed.", owner: "Program" as const, severity: "info" as const, sources: [source], resolution: "open" as const, status: "verified" as const },
        { id: "KPI-2", type: "kpi_result" as const, title: "Housing retention result is missing", detail: "Add the current-period result before drafting this section.", action: "Add information", owner: "Program" as const, severity: "review" as const, sources: [source], resolution: "open" as const, status: "verified" as const },
        { id: "STAFF-1", type: "award_trigger" as const, title: "Confirm whether funder notification is required", detail: "The program update reports a staffing change and the award requires notice within five business days.", action: "Confirm notification", owner: "Grants" as const, severity: "action_required" as const, sources: [source, source], resolution: "open" as const, status: "verified" as const },
        { id: "CTX-1", type: "source_context" as const, title: "Program update recognized as an internal source", detail: "It will be used as supporting information, not as a previously submitted report.", action: "No action needed.", owner: "Grants" as const, severity: "info" as const, sources: [source], resolution: "open" as const, status: "verified" as const }
      ]
    };
    render(<CompilerResults result={result} activeTab="inputs" {...actions} />);
    expect(screen.getByRole("heading", { name: "Review only the unresolved results" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Confirm whether funder notification is required" })).toBeInTheDocument();
    expect(screen.queryByText("Program update recognized as an internal source")).not.toBeInTheDocument();
    expect(screen.queryByText("Current-period result is available.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not applicable" }));
    expect(actions.onResolve).toHaveBeenCalledWith("program-STAFF-1", "not_applicable");
  });

  it("distinguishes supplied inputs from fully verified inputs", () => {
    const source = prototypeFixture.grantProfile.grantName.source;
    const result = {
      ...prototypeFixture,
      mappings: [{
        transactionId: "AMB-001", date: "2027-06-18", description: "Client services", amount: 875,
        suggestedCategory: "Unmapped", confidence: 0, rationale: "Insufficient detail.", status: "blocked" as const,
        mappingConfidence: "unmapped" as const, reportTreatment: "needs_category_review" as const, requiresHumanAction: true
      }],
      programChecks: [{
        id: "KPI-SAT", type: "kpi_result" as const, title: "Satisfaction result needs confirmation",
        detail: "The survey dataset remains under validation.", action: "Confirm the final result.", owner: "Program" as const,
        severity: "review" as const, sources: [source], resolution: "open" as const, status: "verified" as const
      }]
    };
    render(<CompilerResults result={result} activeTab="inputs" {...actions} />);
    const accounting = screen.getByRole("heading", { name: "Accounting data" }).closest("article");
    const program = screen.getByRole("heading", { name: "Program results" }).closest("article");
    const award = screen.getByRole("heading", { name: "Award document" }).closest("article");
    expect(within(accounting!).getByText("Available · 1 exception")).toBeInTheDocument();
    expect(within(program!).getByText("Available · 1 item needs review")).toBeInTheDocument();
    expect(within(award!).getByText("Verified")).toBeInTheDocument();
  });
});
