import { describe, expect, it } from "vitest";
import { prototypeFixture } from "../data/prototypeFixture";
import { canGenerateReviewPackage, validateCompilationRequest, validateReadinessRequest } from "../lib/prototype";
import type { CompilationRequest, CompilationResult, ReadinessRequest, SourceRole } from "../types/prototype";

const requiredRoles: SourceRole[] = ["awardAgreement", "approvedBudget", "ledgerExport", "funderTemplate", "programUpdate"];

function request(): CompilationRequest {
  return {
    organizationName: "Hope Community Services",
    grantName: "Youth Access Initiative",
    reportingPeriod: "January–June 2026",
    files: requiredRoles.map((role) => ({ role, name: `${role}.txt`, mimeType: "text/plain", size: 20, data: "data:text/plain;base64,dGVzdA==" }))
  };
}

describe("prototype request validation", () => {
  it("accepts a complete, small source package", () => {
    expect(validateCompilationRequest(request())).toEqual([]);
  });

  it("allows financial, template, and program sources to be added later", () => {
    const input = request();
    input.files = input.files.filter((file) => file.role === "awardAgreement");
    expect(validateCompilationRequest(input)).toEqual([]);
  });

  it("requires an award document to start compilation", () => {
    const input = request();
    input.files = input.files.filter((file) => file.role !== "awardAgreement");
    expect(validateCompilationRequest(input)).toContain("Missing required source: awardAgreement.");
  });

  it("accepts a UUID request identifier and rejects malformed retry identifiers", () => {
    const valid = request();
    valid.requestId = "3dd8a462-480c-4ed7-a4a3-6fcb92d1427a";
    expect(validateCompilationRequest(valid)).toEqual([]);
    expect(validateCompilationRequest({ ...valid, requestId: "retry-this-report" })).toContain("The report request identifier is invalid.");
  });

  it("accepts an agreement-only readiness audit and rejects a missing agreement", () => {
    const readiness: ReadinessRequest = {
      organizationName: "Hope Community Services",
      grantName: "Youth Access Initiative",
      files: [{ role: "awardAgreement", name: "agreement.txt", mimeType: "text/plain", size: 20, data: "data:text/plain;base64,dGVzdA==" }]
    };
    expect(validateReadinessRequest(readiness)).toEqual([]);
    expect(validateReadinessRequest({ ...readiness, files: [] })).toContain("An award agreement is required.");
  });
});

describe("evidence and export gate", () => {
  it("keeps export blocked while evidence or quality checks remain unresolved", () => {
    expect(canGenerateReviewPackage(prototypeFixture)).toBe(false);
  });

  it("enables export only after required checks and verifier findings are reviewed", () => {
    const resolved: CompilationResult = {
      ...prototypeFixture,
      inputStatus: prototypeFixture.inputStatus.map((item) => ({ ...item, available: true })),
      missingInputs: prototypeFixture.missingInputs.map((item) => ({ ...item, status: "answered" as const })),
      workflow: { readiness: "ready_for_review", actionRequiredCount: 0, needsReviewCount: 0, missingInputCount: 0 },
      qualityChecks: prototypeFixture.qualityChecks.map((check) => ({ ...check, status: "passed" as const })),
      validation: {
        ...prototypeFixture.validation,
        findings: prototypeFixture.validation.findings.map((finding) => ({ ...finding, verdict: "source_matched" as const }))
      }
    };
    expect(canGenerateReviewPackage(resolved)).toBe(true);
  });

  it("does not allow an objective setup conflict to be confirmed away", () => {
    const otherwiseResolved: CompilationResult = {
      ...prototypeFixture,
      setupConflicts: [{
        id: "setup-grant-identity",
        type: "grant_identity",
        title: "Grant details do not match",
        detail: "The uploaded agreement identifies a different grant.",
        enteredValue: "Youth Access Initiative",
        sourceValue: "Workforce Advancement Initiative",
        source: prototypeFixture.grantProfile.grantName.source,
        status: "action_required"
      }],
      inputStatus: prototypeFixture.inputStatus.map((item) => ({ ...item, available: true })),
      missingInputs: prototypeFixture.missingInputs.map((item) => ({ ...item, status: "answered" as const })),
      workflow: { readiness: "not_ready", actionRequiredCount: 1, needsReviewCount: 0, missingInputCount: 0 },
      qualityChecks: prototypeFixture.qualityChecks.map((check) => ({ ...check, status: "passed" as const })),
      validation: { ...prototypeFixture.validation, findings: prototypeFixture.validation.findings.map((finding) => ({ ...finding, verdict: "source_matched" as const })) }
    };
    expect(canGenerateReviewPackage(otherwiseResolved)).toBe(false);
  });

  it("calculates fixture evidence coverage from independently verified items", () => {
    const findings = prototypeFixture.validation.findings;
    const matched = findings.filter((finding) => finding.verdict === "source_matched").length;
    expect(Math.round((matched / findings.length) * 100)).toBe(prototypeFixture.validation.evidenceCoveragePercent);
    expect(prototypeFixture.validation.blockedItems).toBe(1);
  });
});
