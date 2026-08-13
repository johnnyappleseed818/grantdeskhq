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

  it("separates award-source verification, grouped actions, and raw evidence checks", () => {
    const result = {
      ...prototypeFixture,
      requirements: [
        ...prototypeFixture.requirements,
        { ...prototypeFixture.requirements[0], id: "REQ-REVIEW", requirement: "Client satisfaction target", status: "review" as const }
      ],
      validation: { ...prototypeFixture.validation, sourceMatchedItems: 111, itemsNeedingReview: 8, blockedItems: 17 }
    };
    render(<CompilerResults result={result} activeTab="overview" {...actions} />);
    expect(screen.getByText("2 verified")).toBeInTheDocument();
    expect(screen.getByText(/1 need source review\. Duplicated wording is consolidated; these are extraction checks, not additional workflow tasks\./)).toBeInTheDocument();
    const sourceReview = screen.getByText("Review 1 award requirement needing source confirmation");
    expect(sourceReview).toBeInTheDocument();
    fireEvent.click(sourceReview);
    expect(screen.getByText("Client satisfaction target")).toBeInTheDocument();
    expect(screen.getByText(/8 source checks need review/)).toBeInTheDocument();
    expect(screen.getByText(/grouped actions cover the related checks shown above/)).toBeInTheDocument();
  });

  it("labels the P2 percentage as the share of households served", () => {
    const source = prototypeFixture.grantProfile.grantName.source;
    const result = {
      ...prototypeFixture,
      programChecks: [{
        id: "P2-CONFLICT",
        type: "data_conflict" as const,
        title: "P2 — Housing stability assessments completed",
        detail: "Reported KPI result is 158 assessments (92%); the activities section reports 160 assessments.",
        action: "Confirm the assessment count.",
        owner: "Program" as const,
        severity: "review" as const,
        sources: [source],
        resolution: "open" as const,
        status: "review" as const
      }]
    };

    render(<CompilerResults result={result} activeTab="overview" {...actions} />);

    expect(screen.getByText(/158 assessments \(92% of households served\)/)).toBeInTheDocument();
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

  it("offers the evidence-backed P2 value without hiding the original conflict", () => {
    const source = prototypeFixture.grantProfile.grantName.source;
    const evidenceSource = { sourceName: "P2_Assessment_Records.xlsx", locator: "Rows 2–159", excerpt: "158 completed housing stability assessments." };
    const onResolve = vi.fn();
    const result = {
      ...prototypeFixture,
      programChecks: [{
        id: "P2-CONFLICT",
        type: "data_conflict" as const,
        title: "P2 — Assessment count needs confirmation",
        detail: "Underlying completed-assessment records support 158 assessments. The program narrative states 160. Recommended report value: 158.",
        action: "Update the report narrative to 158, or keep 160 and explain the difference. The original conflict remains in the audit history.",
        owner: "Program" as const,
        severity: "review" as const,
        sources: [source, evidenceSource],
        resolution: "open" as const,
        status: "review" as const,
        evidenceBackedValue: "158",
        evidenceRecommendation: "Use 158 in the report, or keep the narrative value and document why it differs."
      }]
    };

    render(<CompilerResults result={result} activeTab="inputs" {...actions} onResolve={onResolve} />);

    expect(screen.getByText(/original conflict remains in the audit history/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use 158 in report" }));
    expect(onResolve).toHaveBeenCalledWith("program-P2-CONFLICT");
    expect(screen.getByRole("button", { name: "Keep current value and explain" })).toBeInTheDocument();
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

  it("separates narrative sources from underlying evidence and keeps unconfirmed text out of the draft", () => {
    const source = { sourceName: "BridgeWorks_Program_Update.docx", locator: "Section 2", excerpt: "172 households served; satisfaction survey under validation." };
    const result = {
      ...prototypeFixture,
      inputStatus: prototypeFixture.inputStatus.map((item) => item.role === "supportingEvidence" ? { ...item, available: false } : item),
      requirements: [...prototypeFixture.requirements, {
        id: "KPI-EVIDENCE", requirement: "Maintain an evidence index linking every reported KPI to its underlying source records.",
        source: { sourceName: "Northstar_Award.docx", locator: "Section 10", excerpt: "Maintain an evidence index linking each KPI to an underlying source." },
        confidence: 0.99, status: "verified" as const
      }],
      narrative: [
        { id: "READY", text: "BridgeWorks reported serving 172 unduplicated households during the reporting period.", evidenceType: "program_response" as const, source, status: "verified" as const },
        { id: "P6", text: "Information required: Finalize the client-satisfaction result before submission.", evidenceType: "needs_confirmation" as const, source, status: "verified" as const }
      ],
      programChecks: [{
        id: "P6", type: "kpi_result" as const, title: "P6 — Client satisfaction", detail: "The survey result remains under validation.",
        action: "Confirm the final result.", owner: "Program" as const, severity: "review" as const, sources: [source], resolution: "open" as const, status: "verified" as const
      }],
      financialAnalysis: { ledgerTransactionCount: 1, mappedTransactionCount: 1, excludedTransactionCount: 0, mappedActualTotal: 100, budgetVariances: [], controls: [] }
    };
    render(<CompilerResults result={result} activeTab="narrative" {...actions} />);
    expect(screen.getByRole("heading", { name: "Most program information is ready. Financial review is still in progress." })).toBeInTheDocument();
    expect(screen.getByText("Source for this draft")).toBeInTheDocument();
    expect(screen.getByText("Required underlying evidence")).toBeInTheDocument();
    expect(screen.getByText("Narrative source verified")).toBeInTheDocument();
    expect(screen.getByText("No matching evidence uploaded yet")).toBeInTheDocument();
    const draft = screen.getByRole("heading", { name: "Source-linked draft language" }).closest("section");
    expect(draft).not.toBeNull();
    expect(within(draft!).queryByText(/Finalize the client-satisfaction result/)).not.toBeInTheDocument();
  });

  it("summarizes independently matched, suggested, and irrelevant evidence files", () => {
    const result = {
      ...prototypeFixture,
      evidenceFiles: [
        { id: "evidence_one", name: "receipt.pdf", mimeType: "application/pdf", size: 100, uploadedAt: "2026-08-11T00:00:00.000Z", parsingStatus: "parsed" as const, relevance: "matched" as const, parsingMessage: "Receipt matched.", matches: [{ targetType: "transaction" as const, targetId: "transaction:TRV-003:payment", targetLabel: "Payment record for TRV-003", confidence: 0.98, status: "matched" as const, rationale: "Direct receipt.", source: { sourceName: "receipt.pdf", locator: "Page 1", excerpt: "TRV-003" } }] },
        { id: "evidence_two", name: "possible-approval.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 200, uploadedAt: "2026-08-11T00:00:00.000Z", parsingStatus: "parsed" as const, relevance: "review" as const, parsingMessage: "Possible approval.", matches: [{ targetType: "approval" as const, targetId: "approval:TRV-003:director", targetLabel: "Director approval", confidence: 0.72, status: "suggested" as const, rationale: "Signer is unclear.", source: { sourceName: "possible-approval.docx", locator: "Page 1", excerpt: "Approved" } }] },
        { id: "evidence_three", name: "menu.jpg", mimeType: "image/jpeg", size: 300, uploadedAt: "2026-08-11T00:00:00.000Z", parsingStatus: "parsed" as const, relevance: "irrelevant" as const, parsingMessage: "Unrelated file.", matches: [] }
      ]
    };
    render(<CompilerResults result={result} activeTab="inputs" {...actions} onConfirmEvidenceMatch={vi.fn()} />);
    expect(screen.getByText("3 supporting evidence files")).toBeInTheDocument();
    expect(screen.getByText("1 matched automatically · 1 needs review · 0 unmatched · 1 not relevant")).toBeInTheDocument();
    expect(screen.getByText("Payment record for TRV-003")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm match" })).toBeInTheDocument();
    expect(screen.getByText("Not relevant")).toBeInTheDocument();
  });

  it("links assessment and combined placement evidence to every KPI stated in a draft paragraph", () => {
    const source = { sourceName: "Program_Update.docx", locator: "Program Performance Metrics", excerpt: "P1 172; P2 158; P3 98; P5 139." };
    const matchedFile = (id: string, name: string, targetId: string, targetLabel: string, excerpt: string) => ({
      id,
      name,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 100,
      uploadedAt: "2026-08-11T00:00:00.000Z",
      parsingStatus: "parsed" as const,
      relevance: "matched" as const,
      matches: [{
        targetType: "kpi" as const,
        targetId,
        targetLabel,
        confidence: 0.98,
        status: "matched" as const,
        rationale: "Direct underlying record.",
        source: { sourceName: name, locator: "Workbook", excerpt }
      }]
    });
    const result = {
      ...prototypeFixture,
      requirements: [{
        ...prototypeFixture.requirements[0],
        id: "KPI-EVIDENCE",
        requirement: "Maintain an evidence index linking every reported KPI to its underlying source records.",
        status: "verified" as const
      }],
      narrative: [{
        id: "KPI-DRAFT",
        text: "The program reported serving 172 unduplicated households, completing 158 housing stability assessments, placing 98 households, and completing benefits screening for 139 households.",
        evidenceType: "program_response" as const,
        source,
        status: "verified" as const
      }, {
        id: "QUALITATIVE-DRAFT",
        text: "Housing placements were constrained by low vacancy rates and limited landlord participation; 17 placement-ready households remained in navigation for more than 30 days.",
        evidenceType: "program_response" as const,
        source,
        status: "verified" as const
      }],
      evidenceFiles: [
        matchedFile("evidence-p1", "01_Enrollment_Records_Interim1.xlsx", "requirement:P1", "P1 enrollment records", "172 households served."),
        matchedFile("evidence-p2", "02_Assessment_Records_Interim1.xlsx", "requirement:P2", "P2 assessment records", "158 completed assessments."),
        matchedFile("evidence-p3p4", "03_Housing_Placement_and_120_Day_Followup_Interim1.xlsx", "requirement:P4", "P4 follow-up records", "98 placements; 40 of 49 retained at 120 days."),
        matchedFile("evidence-p5", "04_Benefits_Screening_Records_Interim1.xlsx", "requirement:P5", "P5 screening records", "139 benefits screenings.")
      ]
    };

    render(<CompilerResults result={result} activeTab="narrative" {...actions} />);

    const draft = screen.getByRole("heading", { name: /The program reported serving 172 unduplicated households/ }).closest("article");
    expect(draft).not.toBeNull();
    expect(within(draft!).getByText("Underlying evidence matched")).toBeInTheDocument();
    expect(within(draft!).getByText(/02_Assessment_Records_Interim1\.xlsx/)).toBeInTheDocument();
    expect(within(draft!).getByText(/03_Housing_Placement_and_120_Day_Followup_Interim1\.xlsx/)).toBeInTheDocument();
    const qualitative = screen.getByRole("heading", { name: /Housing placements were constrained by low vacancy rates/ }).closest("article");
    expect(qualitative).not.toBeNull();
    expect(within(qualitative!).getByText("No separate requirement identified")).toBeInTheDocument();
    expect(within(qualitative!).queryByText(/Enrollment_Records|Assessment_Records|Housing_Placement_and_120_Day|Benefits_Screening/)).not.toBeInTheDocument();
  });
});
