import { describe, expect, it } from "vitest";
import { prototypeFixture } from "../data/prototypeFixture";
import { canGenerateReviewPackage, validateCompilationRequest } from "../lib/prototype";
import type { CompilationRequest, CompilationResult, SourceRole } from "../types/prototype";

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

  it("identifies a missing source role", () => {
    const input = request();
    input.files = input.files.filter((file) => file.role !== "ledgerExport");
    expect(validateCompilationRequest(input)).toContain("Missing required source: ledgerExport.");
  });
});

describe("evidence and export gate", () => {
  it("keeps export blocked while evidence or quality checks remain unresolved", () => {
    expect(canGenerateReviewPackage(prototypeFixture)).toBe(false);
  });

  it("enables export only after required checks and verifier findings are reviewed", () => {
    const resolved: CompilationResult = {
      ...prototypeFixture,
      qualityChecks: prototypeFixture.qualityChecks.map((check) => ({ ...check, status: "passed" as const })),
      validation: {
        ...prototypeFixture.validation,
        findings: prototypeFixture.validation.findings.map((finding) => ({ ...finding, verdict: "source_matched" as const }))
      }
    };
    expect(canGenerateReviewPackage(resolved)).toBe(true);
  });

  it("calculates fixture evidence coverage from independently verified items", () => {
    const findings = prototypeFixture.validation.findings;
    const matched = findings.filter((finding) => finding.verdict === "source_matched").length;
    expect(Math.round((matched / findings.length) * 100)).toBe(prototypeFixture.validation.evidenceCoveragePercent);
    expect(prototypeFixture.validation.blockedItems).toBe(1);
  });
});
