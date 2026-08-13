// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyDeterministicAccuracyChecks } from "../../server/accuracy";
import { normalizeCompilationSources } from "../../server/sourceNormalization";
import { validateCompilationRequest } from "../lib/prototype";
import { prototypeFixture } from "../data/prototypeFixture";
import type { CompilationResult, CompiledMapping, CompiledRequirement, SourceReference } from "../types/prototype";
import {
  NORTHSTAR_CORE_FILES,
  NORTHSTAR_EVIDENCE_FILES,
  NORTHSTAR_FIXTURE_DIR,
  fixtureDigest,
  northstarEvidenceFiles,
  northstarRequest
} from "./northstarRegression";

const manifest = JSON.parse(fs.readFileSync(path.join(NORTHSTAR_FIXTURE_DIR, "manifest.json"), "utf8")) as {
  files: Array<{ name: string; role: string; sha256: string }>;
};
const financialGolden = JSON.parse(fs.readFileSync(path.resolve(NORTHSTAR_FIXTURE_DIR, "../../golden/northstar-interim1/financialAnalysis.json"), "utf8"));

describe("Northstar / BridgeWorks golden fixture", () => {
  it("pins all three core inputs and nine independent evidence files byte-for-byte", () => {
    expect(manifest.files).toHaveLength(12);
    expect(manifest.files.map((file) => file.name)).toEqual([
      ...NORTHSTAR_CORE_FILES.map((file) => file.name),
      ...NORTHSTAR_EVIDENCE_FILES
    ]);
    for (const file of manifest.files) {
      expect(fs.statSync(path.join(NORTHSTAR_FIXTURE_DIR, file.name)).size, file.name).toBeGreaterThan(0);
      expect(fixtureDigest(file.name), file.name).toBe(file.sha256);
    }
  });

  it("accepts all nine evidence files in one request without changing core roles", () => {
    const request = northstarRequest("11111111-2222-4333-8444-555555555555");
    request.files.push(...northstarEvidenceFiles());
    expect(validateCompilationRequest(request)).toEqual([]);
    expect(request.files.filter((file) => file.role === "supportingEvidence")).toHaveLength(9);
    expect(request.files.filter((file) => file.role === "awardAgreement")).toHaveLength(1);
    expect(request.files.filter((file) => file.role === "ledgerExport")).toHaveLength(1);
    expect(request.files.filter((file) => file.role === "programUpdate")).toHaveLength(1);
    expect(request.files.some((file) => file.role === "approvedBudget" || file.role === "funderTemplate")).toBe(false);
  });

  it("keeps supporting evidence in its assigned role even when its content resembles a core source", async () => {
    const request = northstarRequest("22222222-3333-4444-8555-666666666666");
    request.files = northstarEvidenceFiles();
    const normalized = await normalizeCompilationSources(request);
    expect(normalized.request.files.every((file) => file.role === "supportingEvidence")).toBe(true);
    expect(normalized.correctedLedgerRole).toBe(false);
    expect(normalized.ledgerRows).toEqual([]);
  });

  it("calculates the complete financial ground truth from the real XLSX fixture", async () => {
    const request = northstarRequest("33333333-4444-4555-8666-777777777777");
    const normalized = await normalizeCompilationSources(request);
    expect(normalized.ledgerRows).toHaveLength(56);
    const checked = applyDeterministicAccuracyChecks(normalized.request, seededCompilation(normalized.ledgerRows), normalized.ledgerRows);
    const mappings = checked.mappings;
    const categoryActuals = Object.fromEntries((checked.financialAnalysis?.budgetVariances || []).map((variance) => [variance.category, variance.actualAmount]));
    expect(categoryActuals).toMatchObject(financialGolden.categoryActuals);

    const unresolved = mappings.filter((mapping) => mapping.reportTreatment === "needs_category_review");
    expect(unresolved.map((mapping) => mapping.transactionId)).toEqual(["BW-AMB-001"]);

    const duplicate = mappings.filter((mapping) => mapping.transactionId === "BW-LGL-003");
    expect(duplicate.filter((mapping) => mapping.reportTreatment === "included")).toHaveLength(1);
    expect(duplicate.filter((mapping) => mapping.reportTreatment === "excluded_duplicate")).toHaveLength(1);
    expect(mappings.find((mapping) => mapping.transactionId === "BW-OOP-001")?.reportTreatment).toBe("excluded_outside_period");
    expect(mappings.find((mapping) => mapping.transactionId === "BW-OOG-001")?.reportTreatment).toBe("excluded_grant_period");

    expect(checked.financialAnalysis?.budgetVariances.find((item) => item.category === "Technology & Data Systems")).toMatchObject({
      approvedAmount: 18_000,
      actualAmount: 26_200,
      varianceAmount: 8_200,
      variancePercent: 45.6,
      explanationThreshold: 7_500,
      explanationRequired: true
    });
    const indirect = checked.financialAnalysis?.controls.find((control) => control.id === "indirect-cost-limit");
    expect(indirect).toMatchObject({ status: "passed", requiresAction: false });
    expect(indirect?.detail).toContain("$123,980.00 eligible direct costs");
    expect(indirect?.detail).toContain("$9,918.40");
    expect(indirect?.detail).toContain("8%, capped at $20,000.00");
    expect(indirect?.detail).toContain("$918.40 remaining capacity");
    expect(indirect?.detail).not.toContain("15%, capped");
  });

  it("reconstructs financial controls from the award when model requirements and mappings are unusable", async () => {
    const request = northstarRequest("44444444-5555-4666-8777-888888888888");
    const normalized = await normalizeCompilationSources(request);
    const sparse = seededCompilation(normalized.ledgerRows);
    sparse.requirements = [];
    sparse.mappings = sparse.mappings.map((mapping) => ({
      ...mapping,
      suggestedCategory: "Unmapped",
      confidence: 0,
      status: "blocked" as const,
      mappingConfidence: "unmapped" as const,
      reportTreatment: "needs_category_review" as const,
      requiresHumanAction: true
    }));

    const checked = applyDeterministicAccuracyChecks(normalized.request, sparse, normalized.ledgerRows);
    expect(checked.mappings.filter((mapping) => mapping.reportTreatment === "needs_category_review").map((mapping) => mapping.transactionId)).toEqual(["BW-AMB-001"]);
    expect(Object.fromEntries((checked.financialAnalysis?.budgetVariances || []).map((item) => [item.category, item.actualAmount]))).toMatchObject(financialGolden.categoryActuals);
    expect(checked.financialAnalysis?.controls.find((control) => control.id === "indirect-cost-limit")?.detail).toContain("$9,918.40");
    expect(checked.financialAnalysis?.controls.find((control) => control.id === "material-variance")?.detail).toContain("$8,200");
  });
});

function seededCompilation(rows: Array<{ id: string; date: string; description: string; amount: number; account: string; vendor: string }>): CompilationResult {
  const source: SourceReference = {
    sourceName: NORTHSTAR_CORE_FILES[0].name,
    locator: "Approved Grant Budget and Sections 5, 10",
    excerpt: "Source-verified synthetic award terms."
  };
  const requirement = (id: string, text: string): CompiledRequirement => ({ id, requirement: text, source: { ...source, excerpt: text }, confidence: 1, status: "verified" });
  const requirements = [
    requirement("BUD-PER", "Personnel — $120,000."),
    requirement("BUD-FR", "Fringe Benefits — $30,000."),
    requirement("BUD-EA", "Emergency Client Assistance — $70,000."),
    requirement("BUD-LGL", "Legal & Benefits Navigation — $35,000."),
    requirement("BUD-TECH", "Technology & Data Systems — $18,000."),
    requirement("BUD-TRV", "Local Travel — $12,000."),
    requirement("BUD-EVAL", "Evaluation — $20,000."),
    requirement("BUD-IND", "Indirect Costs — $20,000."),
    requirement("VAR", "Each financial report must explain any category variance of $7,500 or more from the approved budget."),
    requirement("REALLOC", "Prior written approval is required for any change of 15% or more to a single approved category."),
    requirement("INDIRECT", "Indirect Costs may not exceed the lesser of $20,000 or 8% of total direct costs actually charged to the grant."),
    requirement("EA-DOC", "Emergency client assistance requires a payment record and documentation of the housing-related purpose."),
    requirement("EA-APPROVAL", "Assistance above $1,500 per household must include written Program Director approval.")
  ];
  const mappings: CompiledMapping[] = rows.map((row) => ({
    transactionId: row.id,
    date: row.date,
    description: row.description,
    amount: row.amount,
    suggestedCategory: suggestedCategory(row.id),
    confidence: 0.7,
    rationale: row.id === "BW-TECH-004" ? "Confirm that equipment is allowable within approved case-management and reporting tools." : "Suggested from ledger account and description.",
    status: "review"
  }));
  const field = (value: string) => ({ value, confidence: 1, source, status: "verified" as const });
  return {
    ...prototypeFixture,
    grantProfile: {
      funderName: field("Northstar Community Fund"),
      grantName: field("Family Stability & Housing Navigation Program"),
      grantId: field("NSCF-2027-014"),
      grantStartDate: field("2027-02-01"),
      grantEndDate: field("2028-07-31"),
      grantType: field("Restricted"),
      granteeName: field("BridgeWorks Family Services"),
      awardAmount: field("$325,000")
    },
    requirements,
    mappings,
    narrative: [],
    programChecks: [],
    setupConflicts: [],
    qualityChecks: [],
    validation: { ...prototypeFixture.validation, findings: [], sourceMatchedItems: 0, itemsNeedingReview: 0, blockedItems: 0 }
  };
}

function suggestedCategory(id: string) {
  if (id.startsWith("BW-PAY-")) return "Personnel";
  if (id.startsWith("BW-FR-")) return "Fringe Benefits";
  if (id.startsWith("BW-EA-")) return "Emergency Client Assistance";
  if (id.startsWith("BW-LGL-")) return "Legal & Benefits Navigation";
  if (id.startsWith("BW-TECH-") || id === "BW-OOP-001" || id === "BW-OOG-001") return "Technology & Data Systems";
  if (id.startsWith("BW-TRV-")) return "Local Travel";
  if (id.startsWith("BW-EVAL-")) return "Evaluation";
  if (id.startsWith("BW-IND-")) return "Indirect Costs";
  return "Unmapped";
}
