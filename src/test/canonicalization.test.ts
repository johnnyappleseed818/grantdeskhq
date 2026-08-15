// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canonicalizeCompilationState, deriveExplicitSourceRequirements } from "../../server/canonicalization";
import { synchronizeEvidenceSourceState, type StoredSource } from "../../server/persistence";
import { prototypeFixture } from "../data/prototypeFixture";
import type { CompilationRequest, CompilationResult, SupportingEvidenceFile } from "../types/prototype";

describe("canonical compilation state", () => {
  it("assigns identical durable identities to equivalent model proposals", () => {
    const first = proposal("R-19", "PC-7", "QC-17", "The KPI table reports 158 housing stability assessments, while the activities narrative reports 160.");
    const second = proposal("requirement-random", "PROGRAM-AUDIT-003", "model-check-x", "P2 assessment conflict: underlying KPI table count is 158 but the activity narrative states 160.");

    const canonicalA = canonicalizeCompilationState(request(), first);
    const canonicalB = canonicalizeCompilationState(request(), second);
    expect(canonicalA.requirements.map((item) => ({ id: item.id, type: item.canonicalType, subject: item.canonicalSubject, applicability: item.applicability })))
      .toEqual(canonicalB.requirements.map((item) => ({ id: item.id, type: item.canonicalType, subject: item.canonicalSubject, applicability: item.applicability })));
    expect(canonicalA.programChecks?.map((item) => item.id)).toEqual(canonicalB.programChecks?.map((item) => item.id));
    expect(canonicalA.qualityChecks.map((item) => item.id)).toEqual(canonicalB.qualityChecks.map((item) => item.id));
    expect(canonicalA.validation.findings.map((item) => item.itemId)).toEqual(canonicalB.validation.findings.map((item) => item.itemId));
  });

  it("deduplicates equivalent requirements by canonical identity", () => {
    const input = proposal("R-1", "PC-1", "QC-1", "P2 assessment conflict: 158 versus 160.");
    input.requirements = [
      { ...input.requirements[0], id: "R-1", requirement: "Report P2 housing stability assessment results and retain assessment records." },
      { ...input.requirements[0], id: "R-2", requirement: "P2 housing-stability assessments and the underlying assessment records must be reported." }
    ];
    expect(canonicalizeCompilationState(request(), input).requirements).toHaveLength(1);
  });

  it("assigns one stable missing-input identity to equivalent transaction decisions", () => {
    const first = proposal("R-1", "PC-1", "QC-1", "P2 conflict");
    first.missingInputs = [{ id: "model-a", question: "Map transaction UNM-001 to an approved grant category.", assignedRole: "Finance", reason: "UNM-001 is unresolved.", status: "open" }];
    const second = proposal("R-1", "PC-1", "QC-1", "P2 conflict");
    second.missingInputs = [{ id: "model-b", question: "Select the grant budget category for UNM-001.", assignedRole: "Finance", reason: "Transaction UNM-001 cannot be included yet.", status: "open" }];
    expect(canonicalizeCompilationState(request(), first).missingInputs.map((item) => item.id))
      .toEqual(canonicalizeCompilationState(request(), second).missingInputs.map((item) => item.id));
  });

  it("persists final reconciled evidence relevance as the authoritative source state", () => {
    const source: StoredSource = { role: "supportingEvidence", name: "Board Notes.pdf", mimeType: "application/pdf", size: 10, objectName: "object", evidenceId: "evidence_board123", relevance: "unmatched", evidenceMatches: [] };
    const evidence: SupportingEvidenceFile = { id: "evidence_board123", name: "Board Notes.pdf", mimeType: "application/pdf", size: 10, uploadedAt: "2027-08-01T00:00:00Z", parsingStatus: "parsed", relevance: "irrelevant", matches: [] };
    expect(synchronizeEvidenceSourceState([source], [evidence])[0]).toMatchObject({ relevance: "irrelevant", evidenceMatches: [] });
  });

  it("derives explicit obligation clauses from award text without model IDs", () => {
    const text = "Program reports must include attendance records, participant eligibility support, and KPI source documentation.";
    const input = request();
    input.files[0] = { ...input.files[0], name: "Award.txt", mimeType: "text/plain", size: text.length, data: `data:text/plain;base64,${Buffer.from(text).toString("base64")}` };
    expect(deriveExplicitSourceRequirements(input)).toContainEqual(expect.objectContaining({ requirement: text, confidence: 1, status: "verified" }));
  });

  it("derives quantified KPI outcome obligations without requiring must or shall wording", () => {
    const text = "Serve at least 300 unduplicated households during the 18-month grant period.";
    const input = request();
    input.files[0] = { ...input.files[0], name: "Award.txt", mimeType: "text/plain", size: text.length, data: `data:text/plain;base64,${Buffer.from(text).toString("base64")}` };
    expect(deriveExplicitSourceRequirements(input)).toContainEqual(expect.objectContaining({ requirement: text, confidence: 1, status: "verified" }));
  });
  it("derives every source-grounded budget line inside an approved-budget section", () => {
    const lines = [
      "APPROVED BUDGET",
      "Personnel: $245,000",
      "Employee Benefits: $55,000",
      "Training and Curriculum: $62,000",
      "Participant Support: $48,000",
      "Local Travel: $20,000",
      "Data and Evaluation: $30,000",
      "Indirect Costs: $20,000",
      "REPORTING CALENDAR",
      "Quarter 1 progress and financial report due January 31, 2027."
    ];
    const input = request();
    input.files[0] = { ...input.files[0], name: "Award.txt", mimeType: "text/plain", size: lines.join("\n").length, data: "data:text/plain;base64," + Buffer.from(lines.join("\n")).toString("base64") };
    const derived = deriveExplicitSourceRequirements(input).map((item) => item.requirement);
    expect(derived).toEqual(expect.arrayContaining(lines.slice(1, 8)));
    expect(derived).not.toContain("REPORTING CALENDAR");
  });
});

function request(): CompilationRequest {
  return {
    organizationName: "Example",
    grantName: "Example Grant",
    reportingPeriod: "Interim Report 1",
    files: [{ role: "awardAgreement", name: "Award.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 3, data: "data:application/octet-stream;base64,YWJj" }]
  };
}

function proposal(requirementId: string, programId: string, qualityId: string, programDetail: string): CompilationResult {
  const result = structuredClone(prototypeFixture);
  result.requirements = [{
    id: requirementId,
    requirement: "Report P2 housing stability assessment results and retain assessment records.",
    source: { sourceName: "Award.docx", locator: "Page 4, Section 7", excerpt: "P2 Housing stability assessments completed; target 270." },
    confidence: 0.99,
    status: "verified"
  }];
  result.programChecks = [{
    id: programId,
    type: "data_conflict",
    title: "P2 — Assessment count conflict",
    detail: programDetail,
    action: "Confirm the correct P2 value.",
    owner: "Program",
    severity: "review",
    sources: [{ sourceName: "Award.docx", locator: "Page 4, Section 7", excerpt: "P2 assessment target." }],
    resolution: "open",
    status: "review"
  }];
  result.qualityChecks = [{ id: qualityId, label: "P2 assessment conflict", detail: programDetail, required: true, status: "review" }];
  result.validation.findings = [
    { id: `finding-${requirementId}`, itemId: `requirement:${requirementId}`, verdict: "source_matched", reason: "Supported.", source: result.requirements[0].source },
    { id: `finding-${programId}`, itemId: `program:${programId}`, verdict: "review", reason: "P2 conflict requires review.", source: result.requirements[0].source }
  ];
  return result;
}
