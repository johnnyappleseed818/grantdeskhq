// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyEvidenceMatches, buildEvidenceTargets, evidenceCollectionSummary } from "../../server/evidenceReconciliation";
import { prototypeFixture } from "../data/prototypeFixture";
import { resultToDownload } from "../lib/prototype";
import { buildProgramInsights, buildProgramReadiness } from "../lib/programInsights";
import { buildReportAttention } from "../lib/reportAttention";
import type { CompilationResult, SupportingEvidenceFile } from "../types/prototype";

describe("supporting evidence reconciliation", () => {
  it("lets different files independently satisfy different outstanding requirements", () => {
    const result: CompilationResult = {
      ...prototypeFixture,
      missingInputs: [
        { id: "RECEIPT", question: "Add the TRV-003 receipt.", assignedRole: "Finance", reason: "The award requires an itemized receipt.", status: "open" },
        { id: "KPI_RECORDS", question: "Add participant records for KPI P1.", assignedRole: "Program", reason: "Underlying KPI evidence is required.", status: "open" }
      ]
    };
    const files: SupportingEvidenceFile[] = [
      evidence("receipt", "TRV-003-receipt.pdf", "missing:RECEIPT", "Transaction receipt"),
      evidence("kpi", "P1-enrollment.xlsx", "missing:KPI_RECORDS", "KPI enrollment records")
    ];

    const reconciled = applyEvidenceMatches(result, files);
    expect(reconciled.missingInputs.find((item) => item.id === "RECEIPT")?.evidenceSatisfiedBy).toEqual(["evidence_receipt"]);
    expect(reconciled.missingInputs.find((item) => item.id === "KPI_RECORDS")?.evidenceSatisfiedBy).toEqual(["evidence_kpi"]);
  });

  it("supports many-to-many matches while irrelevant and suggested files clear nothing", () => {
    const result: CompilationResult = {
      ...prototypeFixture,
      missingInputs: [
        { id: "A", question: "Add approval A.", assignedRole: "Finance", reason: "Approval required.", status: "open" },
        { id: "B", question: "Add evidence B.", assignedRole: "Program", reason: "Evidence required.", status: "open" }
      ]
    };
    const multi = evidence("multi", "combined-evidence.pdf", "missing:A", "Approval A");
    multi.matches.push({ ...multi.matches[0], targetId: "missing:B", targetLabel: "Evidence B" });
    const irrelevant = evidence("irrelevant", "lunch-menu.jpg", "missing:A", "Approval A");
    irrelevant.relevance = "irrelevant";
    const suggested = evidence("suggested", "possible-record.pdf", "missing:B", "Evidence B");
    suggested.relevance = "review";
    suggested.matches[0].status = "suggested";
    suggested.matches[0].confidence = 0.72;

    const reconciled = applyEvidenceMatches(result, [multi, irrelevant, suggested]);
    expect(reconciled.missingInputs.find((item) => item.id === "A")?.evidenceSatisfiedBy).toEqual(["evidence_multi"]);
    expect(reconciled.missingInputs.find((item) => item.id === "B")?.evidenceSatisfiedBy).toEqual(["evidence_multi"]);
    expect(evidenceCollectionSummary([multi, irrelevant, suggested])).toEqual({ total: 3, matched: 1, review: 1, irrelevant: 1, unmatched: 0 });
  });

  it("keeps transaction evidence partial until every required record is matched", () => {
    const result: CompilationResult = {
      ...prototypeFixture,
      mappings: [{
        transactionId: "EA-001", date: "2027-03-04", description: "Emergency rent assistance", amount: 1750,
        suggestedCategory: "Emergency Client Assistance", confidence: 0.99, rationale: "Payment record and housing-purpose documentation required; written Program Director approval required.",
        status: "review", complianceStatus: "evidence_required", complianceDetail: "Payment record and housing-purpose documentation required; written Program Director approval required.", reportTreatment: "pending_evidence"
      }]
    };
    const payment = evidence("payment", "EA-001-payment.pdf", "transaction:EA-001:payment", "Payment record for EA-001");
    const purpose = evidence("purpose", "EA-001-purpose.pdf", "transaction:EA-001:purpose", "Housing-purpose support for EA-001");
    const approval = evidence("approval", "EA-001-approval.pdf", "approval:EA-001:director", "Program Director approval for EA-001");

    expect(applyEvidenceMatches(result, [payment]).mappings[0].evidenceRequirementStatus).toBe("partial");
    expect(applyEvidenceMatches(result, [payment, purpose, approval]).mappings[0].evidenceRequirementStatus).toBe("satisfied");
  });

  it("builds candidate targets for requirements, KPIs, transactions, approvals, and unresolved issues", () => {
    const result: CompilationResult = {
      ...prototypeFixture,
      programChecks: [{ id: "P1", type: "kpi_result", title: "P1 evidence", detail: "Add participant records.", action: "Add evidence.", owner: "Program", severity: "review", sources: [], resolution: "open", status: "review" }],
      mappings: [{ transactionId: "EA-2", date: "2027-04-20", description: "Rent", amount: 2200, suggestedCategory: "Emergency Client Assistance", confidence: 0.99, rationale: "", status: "review", complianceStatus: "evidence_required", complianceDetail: "Payment record, housing-purpose documentation, and Program Director approval required." }]
    };
    const targets = buildEvidenceTargets(result);
    expect(targets.some((target) => target.type === "requirement")).toBe(true);
    expect(targets.some((target) => target.type === "kpi")).toBe(true);
    expect(targets.some((target) => target.id === "transaction:EA-2:payment")).toBe(true);
    expect(targets.some((target) => target.id === "approval:EA-2:director")).toBe(true);
    expect(targets.some((target) => target.type === "issue")).toBe(true);
  });

  it("uses canonical KPI targets to generate an evidence index without a manually uploaded index file", () => {
    const result: CompilationResult = {
      ...prototypeFixture,
      requirements: [
        ...["P1 households served", "P2 housing assessments", "P3 housing placements", "P4 120-day retention", "P5 benefits screenings", "P6 client satisfaction"]
          .map((requirement, index) => ({ ...prototypeFixture.requirements[0], id: `REQ-${index + 1}`, requirement }))
      ],
      missingInputs: [{ id: "KPI-INDEX", question: "KPI evidence index is not documented", reason: "Add an evidence index linking every KPI to underlying evidence.", assignedRole: "Program", status: "open" }],
      qualityChecks: [...prototypeFixture.qualityChecks, { id: "KPI-INDEX", label: "KPI evidence index is not documented", detail: "An evidence index is required.", required: true, status: "review" }]
    };
    const files = ["p1", "p2", "p3", "p4", "p5", "p6"].map((family) => evidence(family, `${family}.xlsx`, `kpi:${family}`, `Underlying evidence for ${family.toUpperCase()}`));

    const targets = buildEvidenceTargets(result);
    expect(targets.filter((target) => /^kpi:p[1-6]$/.test(target.id)).map((target) => target.id).sort()).toEqual(["kpi:p1", "kpi:p2", "kpi:p3", "kpi:p4", "kpi:p5", "kpi:p6"]);
    const reconciled = applyEvidenceMatches(result, files);
    expect(reconciled.missingInputs.find((item) => item.id === "KPI-INDEX")?.evidenceSatisfiedBy).toHaveLength(6);
    expect(reconciled.qualityChecks.find((item) => item.id === "KPI-INDEX")?.evidenceSatisfiedBy).toHaveLength(6);
    expect(buildReportAttention(reconciled).map((item) => item.title)).not.toContain("KPI evidence index is not documented");
  });

  it("builds a KPI evidence index, confirms P6, and keeps a P2 source conflict visible", () => {
    const source = prototypeFixture.grantProfile.grantName.source;
    const requirements = ["P1 households served", "P2 housing assessments", "P3 households placed", "P4 120-day retention", "P5 benefits screenings", "P6 client satisfaction"]
      .map((requirement, index) => ({ ...prototypeFixture.requirements[0], id: `P${index + 1}`, requirement }));
    const result: CompilationResult = {
      ...prototypeFixture,
      requirements,
      programChecks: [
        { id: "P1-EVIDENCE", type: "kpi_result", title: "P1 — Households served", detail: "Underlying enrollment evidence required for 172 households.", action: "Add enrollment records.", owner: "Program", severity: "review", sources: [source], resolution: "open", status: "review" },
        { id: "P2-CONFLICT", type: "data_conflict", title: "P2 — Assessment count needs confirmation", detail: "KPI table: 158. Activities narrative: 160.", action: "Confirm the correct value.", owner: "Program", severity: "review", sources: [source], resolution: "open", status: "review" },
        { id: "P3-EVIDENCE", type: "kpi_result", title: "P3 — Housing placements", detail: "Underlying placement evidence required for 98 households.", action: "Add placement records.", owner: "Program", severity: "review", sources: [source], resolution: "open", status: "review" },
        { id: "P4-EVIDENCE", type: "kpi_result", title: "P4 — 120-day housing retention", detail: "Underlying follow-up evidence required for 40 of 49 eligible households.", action: "Add follow-up records.", owner: "Program", severity: "review", sources: [source], resolution: "open", status: "review" },
        { id: "P5-EVIDENCE", type: "kpi_result", title: "P5 — Benefits screenings", detail: "Underlying screening evidence required for 139 screenings.", action: "Add screening records.", owner: "Program", severity: "review", sources: [source], resolution: "open", status: "review" },
        { id: "P6-MISSING", type: "kpi_result", title: "P6 — Average client satisfaction", detail: "No confirmed satisfaction result is available.", action: "Add survey results.", owner: "Program", severity: "review", sources: [source], resolution: "open", status: "review" },
        { id: "KPI-INDEX", type: "kpi_result", title: "KPI evidence index is not complete", detail: "Add an evidence index linking every KPI to underlying records.", action: "Add KPI evidence.", owner: "Program", severity: "review", sources: [source], resolution: "open", status: "review" }
      ]
    };
    const excerpts = [
      "Enrollment records confirm 172 unduplicated households served.",
      "Assessment records confirm 158 completed housing stability assessments.",
      "Placement records confirm 98 households placed into stable housing.",
      "Follow-up records confirm 40 of 49 eligible households remained housed at 120 days.",
      "Benefits records confirm 139 household benefits screenings.",
      "Average client satisfaction was 4.4 out of 5 from 80 valid responses."
    ];
    const files = requirements.map((requirement, index) => {
      const file = evidence(`p${index + 1}`, `P${index + 1}-evidence.xlsx`, `requirement:${requirement.id}`, requirement.requirement);
      file.matches[0].source.excerpt = excerpts[index];
      return file;
    });

    const reconciled = applyEvidenceMatches(result, files);

    expect(reconciled.programChecks?.find((item) => item.id === "KPI-INDEX")?.evidenceSatisfiedBy).toHaveLength(6);
    expect(reconciled.programChecks?.find((item) => item.id === "P1-EVIDENCE")?.evidenceSatisfiedBy).toEqual(["evidence_p1"]);
    expect(reconciled.programChecks?.find((item) => item.id === "P2-CONFLICT")?.evidenceSatisfiedBy).toEqual(["evidence_p2"]);
    expect(reconciled.programChecks?.find((item) => item.id === "P2-CONFLICT")).toMatchObject({
      evidenceBackedValue: "158",
      evidenceRecommendation: "Use 158 in the report, or keep the narrative value and document why it differs."
    });
    expect(reconciled.programChecks?.find((item) => item.id === "P2-CONFLICT")?.detail).toContain("records support 158 assessments");
    expect(reconciled.programChecks?.find((item) => item.id === "P2-CONFLICT")?.detail).toContain("narrative states 160");
    expect(reconciled.programChecks?.find((item) => item.id === "P3-EVIDENCE")?.evidenceSatisfiedBy).toEqual(["evidence_p3"]);
    expect(reconciled.programChecks?.find((item) => item.id === "P4-EVIDENCE")?.evidenceSatisfiedBy).toEqual(["evidence_p4"]);
    expect(reconciled.programChecks?.find((item) => item.id === "P5-EVIDENCE")?.evidenceSatisfiedBy).toEqual(["evidence_p5"]);
    expect(reconciled.programChecks?.find((item) => item.id === "P6-MISSING")?.evidenceSatisfiedBy).toEqual(["evidence_p6"]);
    expect(reconciled.narrative.find((item) => item.id === "evidence-p6-satisfaction")?.text).toBe("Average client satisfaction was 4.4 out of 5 across 80 valid responses.");
    expect(buildReportAttention(reconciled).map((item) => item.title)).toContain("P2 — Assessment count needs confirmation");
    expect(buildReportAttention(reconciled).map((item) => item.title)).not.toContain("P6 — Average client satisfaction");
    expect(buildReportAttention(reconciled).map((item) => item.title)).not.toContain("KPI evidence index is not complete");
  });

  it("clears matched emergency-assistance support while leaving only the missing approval open", () => {
    const transactions = [
      assistanceMapping("EA-003", 1750),
      assistanceMapping("EA-006", 2200),
      assistanceMapping("EA-011", 1600)
    ];
    const result: CompilationResult = {
      ...prototypeFixture,
      mappings: transactions,
      financialAnalysis: {
        ledgerTransactionCount: 3,
        mappedTransactionCount: 3,
        excludedTransactionCount: 0,
        mappedActualTotal: 5550,
        budgetVariances: [],
        controls: [
          { id: "assistance-documentation", title: "Emergency assistance documentation", detail: "Documentation is required for 3 disbursements.", status: "review", requiresAction: true, transactionIds: transactions.map((item) => item.transactionId) },
          { id: "assistance-approvals", title: "3 assistance transactions require approval support", detail: "Approval is required for EA-003, EA-006, and EA-011.", status: "review", requiresAction: true, transactionIds: transactions.map((item) => item.transactionId) }
        ]
      },
      qualityChecks: [
        ...prototypeFixture.qualityChecks,
        { id: "deterministic-financial-assistance-documentation", label: "Assistance documentation", detail: "Documentation required.", required: true, status: "review" },
        { id: "deterministic-financial-assistance-approvals", label: "Assistance approvals", detail: "A prior evidence pass incorrectly marked this complete.", required: false, status: "passed" }
      ]
    };
    const files: SupportingEvidenceFile[] = [];
    for (const transaction of transactions) {
      files.push(evidence(`${transaction.transactionId}-payment`, `${transaction.transactionId}-register.xlsx`, `transaction:${transaction.transactionId}:payment`, `Payment record for ${transaction.transactionId}`));
      files.push(evidence(`${transaction.transactionId}-purpose`, `${transaction.transactionId}-register.xlsx`, `transaction:${transaction.transactionId}:purpose`, `Housing-purpose record for ${transaction.transactionId}`));
    }
    files.push(evidence("EA-003-approval", "EA-003-approval.pdf", "approval:EA-003:director", "Program Director approval for EA-003"));
    const ea006Approval = evidence("EA-006-approval", "08_PD_Approval_EA-006.pdf", "financial:assistance-approvals", "Program Director approval evidence");
    ea006Approval.matches[0].targetType = "approval";
    ea006Approval.matches[0].source.excerpt = "The Program Director approved emergency assistance transaction EA-006.";
    files.push(ea006Approval);
    const irrelevant = evidence("board-notes", "Board-Notes.pdf", "approval:EA-011:director", "Program Director approval for EA-011");
    irrelevant.relevance = "irrelevant";
    irrelevant.matches = [];
    files.push(irrelevant);

    const reconciled = applyEvidenceMatches(result, files);
    const documentation = reconciled.financialAnalysis?.controls.find((item) => item.id === "assistance-documentation");
    const approvals = reconciled.financialAnalysis?.controls.find((item) => item.id === "assistance-approvals");
    expect(documentation).toMatchObject({ status: "passed", requiresAction: false });
    expect(approvals).toMatchObject({ status: "review", requiresAction: true, transactionIds: ["EA-011"] });
    expect(approvals?.detail).toContain("EA-011 ($1,600)");
    expect(reconciled.qualityChecks.find((item) => item.id === "deterministic-financial-assistance-approvals")).toMatchObject({ status: "review", required: true });
    expect(buildReportAttention(reconciled).map((item) => item.detail).join(" ")).toContain("EA-011 ($1,600)");
    expect(buildReportAttention(reconciled).map((item) => item.detail).join(" ")).not.toContain("EA-003 ($1,750)");

    const afterRemovingEa003Approval = applyEvidenceMatches(reconciled, files.filter((file) => file.id !== "evidence_EA-003-approval"));
    expect(afterRemovingEa003Approval.financialAnalysis?.controls.find((item) => item.id === "assistance-approvals")).toMatchObject({
      requiresAction: true,
      transactionIds: ["EA-003", "EA-011"]
    });
  });

  it("keeps support-register references distinct from independently uploaded assistance records", () => {
    const transaction = assistanceMapping("EA-003", 1750);
    const result: CompilationResult = {
      ...prototypeFixture,
      mappings: [transaction],
      financialAnalysis: {
        ledgerTransactionCount: 1,
        mappedTransactionCount: 1,
        excludedTransactionCount: 0,
        mappedActualTotal: 1750,
        budgetVariances: [],
        controls: [{
          id: "assistance-documentation",
          title: "Emergency assistance documentation",
          detail: "Payment and housing-purpose documentation is required.",
          status: "review",
          requiresAction: true,
          transactionIds: ["EA-003"]
        }]
      }
    };
    const register = evidence("support-register", "Emergency_Assistance_Support_Register.xlsx", "financial:assistance-documentation", "Emergency assistance documentation register");
    register.matches[0].source.excerpt = "Register references the payment record and housing-purpose documentation for EA-003.";

    const reconciled = applyEvidenceMatches(result, [register]);
    const documentation = reconciled.financialAnalysis?.controls.find((item) => item.id === "assistance-documentation");
    expect(documentation).toMatchObject({ status: "review", requiresAction: true, transactionIds: ["EA-003"] });
    expect(documentation?.detail).toContain("Referenced — underlying document was not uploaded");
    expect(documentation?.detail).toContain("not independently verified");
  });

  it("classifies a clearly identified assistance support register as matched even when its requirement links need review", () => {
    const transaction = assistanceMapping("EA-003", 1750);
    const result: CompilationResult = {
      ...prototypeFixture,
      mappings: [transaction],
      financialAnalysis: {
        ledgerTransactionCount: 1,
        mappedTransactionCount: 1,
        excludedTransactionCount: 0,
        mappedActualTotal: 1750,
        budgetVariances: [],
        controls: [{ id: "assistance-documentation", title: "Emergency assistance documentation", detail: "Documentation required.", status: "review", requiresAction: true, transactionIds: ["EA-003"] }]
      }
    };
    const register = evidence("support-register-review", "06_Emergency_Assistance_Support_Interim1.xlsx", "financial:assistance-documentation", "Emergency assistance documentation");
    register.relevance = "review";
    register.matches[0].status = "suggested";
    register.matches[0].confidence = 0.74;
    register.matches[0].source.excerpt = "Emergency Client Assistance Support Register with payment record and housing-purpose documentation references.";

    const reconciled = applyEvidenceMatches(result, [register]);

    expect(reconciled.evidenceFiles?.[0]).toMatchObject({ relevance: "matched" });
    expect(reconciled.financialAnalysis?.controls.find((item) => item.id === "assistance-documentation")).toMatchObject({ status: "review", requiresAction: true });
  });

  it("auto-matches a transaction-specific Program Director approval when the model only suggests the exact approval target", () => {
    const transaction = assistanceMapping("BW-EA-003", 1750);
    const result: CompilationResult = {
      ...prototypeFixture,
      mappings: [transaction],
      financialAnalysis: {
        ledgerTransactionCount: 1,
        mappedTransactionCount: 1,
        excludedTransactionCount: 0,
        mappedActualTotal: 1750,
        budgetVariances: [],
        controls: [{
          id: "assistance-approvals",
          title: "Emergency assistance approvals",
          detail: "Written Program Director approval is required for BW-EA-003.",
          status: "review",
          requiresAction: true,
          transactionIds: ["BW-EA-003"]
        }]
      }
    };
    const approval = evidence("BW-EA-003-approval-review", "07_PD_Approval_BW-EA-003.pdf", "approval:BW-EA-003:director", "Program Director approval for BW-EA-003");
    approval.relevance = "review";
    approval.matches[0].status = "suggested";
    approval.matches[0].confidence = 0.82;
    approval.matches[0].rationale = "The signed Program Director approval identifies BW-EA-003.";
    approval.matches[0].source.excerpt = "Program Director approval for transaction BW-EA-003.";

    const reconciled = applyEvidenceMatches(result, [approval]);

    expect(reconciled.evidenceFiles?.[0]).toMatchObject({ relevance: "matched" });
    expect(reconciled.evidenceFiles?.[0].matches[0]).toMatchObject({ status: "matched", confidence: 0.95 });
    expect(reconciled.financialAnalysis?.controls[0]).toMatchObject({ status: "passed", requiresAction: false });
  });

  it("reconciles the assessment, combined placement, and finalized survey evidence across the report model", () => {
    const source = prototypeFixture.grantProfile.grantName.source;
    const result: CompilationResult = {
      ...prototypeFixture,
      requirements: [
        { ...prototypeFixture.requirements[0], id: "P2", requirement: "P2 housing assessments target 270." },
        { ...prototypeFixture.requirements[0], id: "P3", requirement: "P3 stable-housing placements target 180." },
        { ...prototypeFixture.requirements[0], id: "P4", requirement: "P4 120-day retention target at least 80%." },
        { ...prototypeFixture.requirements[0], id: "P6", requirement: "P6 average client satisfaction target at least 4.3 out of 5." }
      ],
      narrative: [{
        id: "P6-STALE",
        text: "The client-satisfaction survey remains under validation and is not finalized.",
        evidenceType: "needs_confirmation",
        source,
        status: "verified"
      }],
      programChecks: [
        { id: "P2-CONFLICT", type: "data_conflict", title: "P2 — Assessment count needs confirmation", detail: "KPI table: 158. Activities narrative: 160.", action: "Confirm the correct value.", owner: "Program", severity: "review", sources: [source], resolution: "open", status: "review" },
        { id: "P3-EVIDENCE", type: "kpi_result", title: "P3 — Housing placements", detail: "Underlying placement records are required for 98 placements.", action: "Add records.", owner: "Program", severity: "review", sources: [source], resolution: "open", status: "review" },
        { id: "P4-EVIDENCE", type: "kpi_result", title: "P4 — 120-day retention", detail: "Underlying follow-up records are required for 40 of 49 households.", action: "Add records.", owner: "Program", severity: "review", sources: [source], resolution: "open", status: "review" },
        { id: "P6-PENDING", type: "kpi_result", title: "P6 — Average client satisfaction", detail: "The Program Update says the survey remains under validation.", action: "Confirm the final result.", owner: "Program", severity: "review", sources: [source], resolution: "open", status: "review" }
      ],
      qualityChecks: [
        ...prototypeFixture.qualityChecks,
        { id: "program-P6-PENDING", label: "P6 — Average client satisfaction", detail: "Survey result pending.", required: true, status: "review" }
      ]
    };
    const p2 = evidence("p2-records", "02_Assessment_Records_Interim1.xlsx", "requirement:P2", "P2 assessment records");
    p2.matches[0].source.excerpt = "Assessment records confirm 158 completed assessments.";
    p2.matches[0].status = "suggested";
    p2.matches[0].confidence = 0.8;
    p2.relevance = "review";
    const p3p4 = evidence("p3p4-records", "03_Housing_Placement_and_120_Day_Followup_Interim1.xlsx", "requirement:P3", "P3 placement records");
    p3p4.matches[0].source.excerpt = "Placement records confirm 98 stable-housing placements.";
    p3p4.matches.push({
      ...p3p4.matches[0],
      targetId: "requirement:P4",
      targetLabel: "P4 120-day follow-up records",
      source: { ...p3p4.matches[0].source, excerpt: "Follow-up records confirm 40 of 49 eligible households remained housed at 120 days." }
    });
    const p6 = evidence("p6-final", "05_Client_Satisfaction_Survey_Interim1.xlsx", "requirement:P6", "P6 finalized client satisfaction survey");
    p6.matches[0].source.excerpt = "Survey status, Finalized. Valid responses, 80. Average score, 4.4. Award target, 4.3 out of 5.";
    p6.matches[0].status = "suggested";
    p6.matches[0].confidence = 0.8;
    p6.relevance = "review";

    const reconciled = applyEvidenceMatches(result, [p2, p3p4, p6]);
    expect(reconciled.programChecks?.find((item) => item.id === "P2-CONFLICT")).toMatchObject({ evidenceBackedValue: "158", resolution: "open" });
    expect(reconciled.evidenceFiles?.find((item) => item.id === "evidence_p2-records")).toMatchObject({ relevance: "matched", matches: [expect.objectContaining({ status: "matched", confidence: 0.95 })] });
    expect(reconciled.programChecks?.find((item) => item.id === "P3-EVIDENCE")?.evidenceSatisfiedBy).toEqual(["evidence_p3p4-records"]);
    expect(reconciled.programChecks?.find((item) => item.id === "P4-EVIDENCE")?.evidenceSatisfiedBy).toEqual(["evidence_p3p4-records"]);
    expect(reconciled.programChecks?.find((item) => item.id === "P6-PENDING")).toMatchObject({
      evidenceBackedValue: "4.4/5",
      severity: "info",
      resolution: "resolved",
      evidenceSatisfiedBy: ["evidence_p6-final"]
    });
    expect(reconciled.evidenceFiles?.find((item) => item.id === "evidence_p6-final")).toMatchObject({ relevance: "matched", matches: [expect.objectContaining({ status: "matched", confidence: 0.95 })] });
    expect(reconciled.programChecks?.find((item) => item.id === "P6-PENDING")?.detail).toContain("stale-source discrepancy remains in the report history");
    expect(reconciled.qualityChecks.find((item) => item.id === "program-P6-PENDING")).toMatchObject({ required: false, status: "passed" });
    expect(reconciled.narrative.find((item) => item.id === "P6-STALE")).toBeDefined();
    expect(reconciled.narrative.find((item) => item.id === "evidence-p6-satisfaction")?.text).toBe("Average client satisfaction was 4.4 out of 5 across 80 valid responses.");
    const attention = buildReportAttention(reconciled).map((item) => item.title);
    expect(attention).toContain("P2 — Assessment count needs confirmation");
    expect(attention).not.toContain("P3 — Housing placements");
    expect(attention).not.toContain("P4 — 120-day retention");
    expect(attention).not.toContain("P6 — Average client satisfaction");
    const exported = JSON.parse(resultToDownload(reconciled)) as CompilationResult;
    expect(exported.programChecks?.find((item) => item.id === "P6-PENDING")?.resolution).toBe("resolved");
    expect(exported.narrative.some((item) => item.id === "P6-STALE")).toBe(true);
    expect(exported.narrative.some((item) => item.id === "evidence-p6-satisfaction")).toBe(true);

    const afterEvidenceRemoval = applyEvidenceMatches(reconciled, [p3p4]);
    expect(afterEvidenceRemoval.programChecks?.find((item) => item.id === "P2-CONFLICT")).toMatchObject({ resolution: "open", severity: "review" });
    expect(afterEvidenceRemoval.programChecks?.find((item) => item.id === "P2-CONFLICT")?.evidenceBackedValue).toBeUndefined();
    expect(afterEvidenceRemoval.programChecks?.find((item) => item.id === "P6-PENDING")).toMatchObject({ resolution: "open", severity: "review" });
    expect(afterEvidenceRemoval.narrative.some((item) => item.id === "evidence-p6-satisfaction")).toBe(false);
  });

  it("never lets an assistance register satisfy transaction-level director approval", () => {
    const result: CompilationResult = {
      ...prototypeFixture,
      mappings: [assistanceMapping("BW-EA-011", 1600)],
      financialAnalysis: {
        ledgerTransactionCount: 1,
        mappedTransactionCount: 1,
        excludedTransactionCount: 0,
        mappedActualTotal: 1600,
        budgetVariances: [],
        controls: [{ id: "assistance-approvals", title: "Assistance approval", detail: "Approval required.", status: "review", requiresAction: true, transactionIds: ["BW-EA-011"] }]
      }
    };
    const register = evidence("register-approval", "Emergency_Assistance_Support_Register.xlsx", "approval:BW-EA-011:director", "Program Director approval for BW-EA-011");
    register.parsingMessage = "Support register listing referenced payment, purpose, and approval records.";

    const reconciled = applyEvidenceMatches(result, [register]);
    expect(reconciled.financialAnalysis?.controls.find((item) => item.id === "assistance-approvals")).toMatchObject({
      status: "review",
      requiresAction: true,
      transactionIds: ["BW-EA-011"]
    });
  });

  it("propagates a parsed Program Director approval PDF by its exact transaction ID even when the model matched the broader approval requirement", () => {
    const result: CompilationResult = {
      ...prototypeFixture,
      mappings: [assistanceMapping("BW-EA-003", 1750), assistanceMapping("BW-EA-006", 2200), assistanceMapping("BW-EA-011", 1600)],
      financialAnalysis: {
        ledgerTransactionCount: 3,
        mappedTransactionCount: 3,
        excludedTransactionCount: 0,
        mappedActualTotal: 5550,
        budgetVariances: [],
        controls: [{ id: "assistance-approvals", title: "Assistance approval", detail: "Approval required.", status: "review", requiresAction: true, transactionIds: ["BW-EA-003", "BW-EA-006", "BW-EA-011"] }]
      }
    };
    const ea003 = evidence("ea003-pd", "07_PD_Approval_BW-EA-003.pdf", "requirement:EA-APPROVAL", "Obtain written Program Director approvals");
    ea003.matches[0].targetType = "requirement";
    ea003.matches[0].source.excerpt = "Written Program Director approval is attached for the identified assistance payment.";
    const ea006 = evidence("ea006-pd", "08_PD_Approval_BW-EA-006.pdf", "requirement:EA-APPROVAL", "Obtain written Program Director approvals");
    ea006.matches[0].targetType = "requirement";
    ea006.matches[0].source.excerpt = "Written Program Director approval is attached for the identified assistance payment.";

    const reconciled = applyEvidenceMatches(result, [ea003, ea006]);
    expect(reconciled.financialAnalysis?.controls.find((item) => item.id === "assistance-approvals")).toMatchObject({
      status: "review",
      requiresAction: true,
      transactionIds: ["BW-EA-011"]
    });
  });

  it("marks parsed board meeting notes with no matches as irrelevant", () => {
    const boardNotes = evidence("board-notes-empty", "09_Irrelevant_Board_Meeting_Notes.pdf", "missing:NOT_REAL", "Not relevant");
    boardNotes.relevance = "unmatched";
    boardNotes.matches = [];
    const reconciled = applyEvidenceMatches(prototypeFixture, [boardNotes]);
    expect(reconciled.evidenceFiles?.[0]).toMatchObject({ relevance: "irrelevant", matches: [] });
  });

  it("discards low-confidence suggested matches from clearly irrelevant board notes", () => {
    const boardNotes = evidence("board-notes-suggested", "09_Irrelevant_Board_Meeting_Notes.pdf", "requirement:BUDGET", "Approved budget");
    boardNotes.relevance = "review";
    boardNotes.matches[0].status = "suggested";
    boardNotes.matches[0].confidence = 0.34;
    boardNotes.matches[0].source.excerpt = "The Board authorized replacement of two office printers.";
    const reconciled = applyEvidenceMatches(prototypeFixture, [boardNotes]);
    expect(reconciled.evidenceFiles?.[0]).toMatchObject({ relevance: "irrelevant", matches: [] });
  });

  it("turns direct P3, P4, and P5 evidence into report facts and six-KPI readiness", () => {
    const source = prototypeFixture.grantProfile.grantName.source;
    const result: CompilationResult = {
      ...prototypeFixture,
      requirements: [{
        ...prototypeFixture.requirements[0],
        id: "ALL-KPIS",
        requirement: "Targets: 300 unduplicated households served; 270 assessments; 180 stable placements; 80% stable at 120 days; 240 benefits screenings; average satisfaction at least 4.3/5.0."
      }],
      narrative: [
        { id: "P1", text: "The program served 172 unduplicated households.", evidenceType: "program_response", source, status: "verified" },
        { id: "P2", text: "The KPI table reports 158 completed housing stability assessments.", evidenceType: "program_response", source, status: "verified" },
        { id: "P6-STALE", text: "Client satisfaction is under validation.", evidenceType: "needs_confirmation", source, status: "verified" }
      ],
      programChecks: [{ id: "P2-CONFLICT", type: "data_conflict", title: "P2 assessment conflict", detail: "KPI table 158; activities narrative 160.", action: "Resolve.", owner: "Program", severity: "review", sources: [source], resolution: "open", status: "review" }]
    };
    const p2 = evidence("p2-six", "02_Assessment_Records_Interim1.xlsx", "program:P2-CONFLICT", "P2 assessment evidence");
    p2.matches[0].source.excerpt = "Assessment records confirm 158 completed assessments.";
    const p3p4 = evidence("p3p4-six", "03_Housing_Placement_and_120_Day_Followup_Interim1.xlsx", "program:P3", "P3 placement evidence");
    p3p4.matches[0].source.excerpt = "Placement records confirm 98 stable-housing placements.";
    p3p4.matches.push({ ...p3p4.matches[0], targetId: "program:P4", targetLabel: "P4 follow-up evidence", source: { ...p3p4.matches[0].source, excerpt: "Follow-up records confirm 40 of 49 eligible households remained housed at 120 days." } });
    const p5 = evidence("p5-six", "04_Benefits_Screening_Records_Interim1.xlsx", "program:P5", "P5 benefits evidence");
    p5.matches[0].source.excerpt = "Screening records confirm 139 completed benefits screenings.";
    const p6 = evidence("p6-six", "05_Client_Satisfaction_Survey_Interim1.xlsx", "program:P6", "P6 satisfaction evidence");
    p6.matches[0].source.excerpt = "Survey finalized with 80 valid responses and average score 4.4 out of 5.";

    const reconciled = applyEvidenceMatches(result, [p2, p3p4, p5, p6]);
    const insights = buildProgramInsights(reconciled);
    expect(insights.find((item) => item.id === "housing-placements")).toMatchObject({ value: "98 of 180" });
    expect(insights.find((item) => item.id === "housing-retention")).toMatchObject({ value: "81.6% · target 80%" });
    expect(insights.find((item) => item.id === "benefits-screenings")).toMatchObject({ value: "139 of 240" });
    expect(insights.find((item) => item.id === "client-satisfaction")).toMatchObject({ value: "4.4 of 5 · target 4.3" });
    expect(buildProgramReadiness(reconciled)).toEqual({ ready: 5, conflicts: 1, awaitingConfirmation: 0 });
  });

  it("recovers the explicit P2 narrative value from cited source history when model detail is vague", () => {
    const source = {
      ...prototypeFixture.grantProfile.grantName.source,
      excerpt: "P2 KPI table: 158 completed assessments. Major activities: staff completed 160 housing stability assessments during the reporting period."
    };
    const result: CompilationResult = {
      ...prototypeFixture,
      programChecks: [{
        id: "P2-VAGUE",
        type: "data_conflict",
        title: "P2 — Assessment count needs confirmation",
        detail: "The KPI table reports 158; the program narrative states a different value.",
        action: "Confirm the correct value.",
        owner: "Program",
        severity: "review",
        sources: [source],
        resolution: "open",
        status: "review"
      }]
    };
    const p2 = evidence("p2-source-history", "02_Assessment_Records_Interim1.xlsx", "program:P2-VAGUE", "P2 assessment evidence");
    p2.matches[0].source.excerpt = "Assessment records confirm 158 completed assessments.";

    const reconciled = applyEvidenceMatches(result, [p2]);
    const check = reconciled.programChecks?.find((item) => item.id === "P2-VAGUE");
    expect(`${check?.detail} ${check?.action}`).toMatch(/158.*160|160.*158/);
  });
});

function assistanceMapping(transactionId: string, amount: number): CompilationResult["mappings"][number] {
  return {
    transactionId,
    date: "2027-04-01",
    description: "Emergency rent assistance",
    amount,
    suggestedCategory: "Emergency Client Assistance",
    confidence: 0.99,
    rationale: "Mapped to the approved assistance category.",
    status: "review",
    mappingConfidence: "high",
    complianceStatus: "evidence_required",
    complianceDetail: "Payment record, housing-purpose documentation, and Program Director approval required.",
    reportTreatment: "pending_evidence"
  };
}

function evidence(id: string, name: string, targetId: string, targetLabel: string): SupportingEvidenceFile {
  return {
    id: `evidence_${id}`,
    name,
    mimeType: "application/pdf",
    size: 100,
    uploadedAt: "2026-08-11T00:00:00.000Z",
    parsingStatus: "parsed",
    relevance: "matched",
    matches: [{
      targetType: targetId.startsWith("approval:") ? "approval" : targetId.startsWith("transaction:") ? "transaction" : "issue",
      targetId,
      targetLabel,
      confidence: 0.98,
      status: "matched",
      rationale: "The file directly supports this target.",
      source: { sourceName: name, locator: "Page 1", excerpt: "Direct supporting record." }
    }]
  };
}
