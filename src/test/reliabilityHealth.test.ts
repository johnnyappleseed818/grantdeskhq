// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { prototypeFixture } from "../data/prototypeFixture";
import type { CompilationResult } from "../types/prototype";
import type { AnalysisManifest, LastKnownGoodRelease, ReliabilityCanaryResult } from "../types/reliability";
import {
  applyRuntimeIntegrity,
  buildAnalysisManifest,
  buildReliabilityScorecard,
  canonicalBusinessStateHash,
  compareAnalysisManifests,
  evaluateReportIntegrity
} from "../../server/reliability";
import {
  assertSafeDerivedRecovery,
  attemptAutomaticRecovery,
  candidatePromotionDecision,
  createReliabilityIncident,
  diagnoseReliabilityFailure,
  validatedConfigurationDecision
} from "../../server/selfHealing";
import { notifyReliabilityResult, reliabilityNotification } from "../../server/reliabilityNotifier";
import { canaryHealthStatus } from "../../server/northstarCanary";

describe("GrantDeskHQ runtime reliability invariants", () => {
  it("detects a wrong Technology actual as critical financial drift", () => {
    const result = financialFixture();
    result.financialAnalysis!.budgetVariances[0].actualAmount = 27_000;
    const integrity = evaluateReportIntegrity(result);
    expect(integrity.status).toBe("unhealthy");
    expect(integrity.assertions.find((item) => item.id === "category-totals")).toMatchObject({ status: "failed", severity: "critical" });
  });

  it("detects a customer-facing financial amount that contradicts canonical BvA state", () => {
    const result = financialFixture();
    result.narrative = [{ id: "technology-summary", text: "Technology & Data Systems actual spending was $27,000.", evidenceType: "source_fact", source: source("Program update", "Financial section", "$27,000"), status: "verified" }];
    const integrity = evaluateReportIntegrity(result);
    expect(integrity.claims.find((item) => item.claimId === "technology-summary")).toMatchObject({ status: "mismatch", structuredValue: 26_200, narrativeValue: 27_000 });
  });

  it("scopes a category claim to that category instead of a total elsewhere in the paragraph", () => {
    const result = financialFixture();
    result.narrative = [{
      id: "financial-summary",
      text: "Total mapped actual spending was $132,980. Technology & Data Systems actual spending was $26,200.",
      evidenceType: "calculation",
      source: source("General ledger", "Calculated BvA", "$132,980 total; $26,200 Technology"),
      status: "verified"
    }];
    const integrity = evaluateReportIntegrity(result);
    expect(integrity.claims.find((item) => item.claimId === "financial-summary")).toMatchObject({ status: "supported", structuredValue: 26_200, narrativeValue: 26_200 });
  });

  it("isolates the 8% indirect-cost rule from a separate 15% reallocation threshold", () => {
    const result = indirectFixture();
    const integrity = evaluateReportIntegrity(result);
    const assertion = integrity.assertions.find((item) => item.id === "indirect-cost");
    expect(assertion, assertion?.detail).toMatchObject({ status: "passed", severity: "critical" });
  });

  it("detects when a generated P6 actual substitutes the 4.3 target for the 4.4 canonical result", () => {
    const result = p6Fixture();
    result.narrative.push({
      id: "generated-p6-summary",
      text: "Average client satisfaction was 4.3 out of 5 across 80 valid responses.",
      evidenceType: "source_fact",
      source: source("Survey workbook", "Summary", "Average score 4.4"),
      status: "verified"
    });
    const integrity = evaluateReportIntegrity(result);
    expect(integrity.assertions.find((item) => item.id === "canonical-narrative-values")).toMatchObject({ status: "failed", severity: "critical" });
    expect(integrity.claims.find((item) => item.claimId === "generated-p6-summary")).toMatchObject({ status: "mismatch", structuredValue: 4.4, narrativeValue: 4.3 });
  });

  it("rejects approval satisfaction without accepted approval evidence", () => {
    const result = assistanceFixture();
    const control = result.financialAnalysis!.controls[0];
    control.transactionIds = [];
    control.requiresAction = false;
    control.status = "passed";
    const integrity = evaluateReportIntegrity(result);
    expect(integrity.assertions.find((item) => item.id === "approval-state")).toMatchObject({ status: "failed", severity: "critical" });
    expect(integrity.assertions.find((item) => item.id === "approval-state")?.detail).toContain("BW-EA-011");
  });

  it("detects evidence disappearing while the source manifest is unchanged", () => {
    const baseline = assistanceFixture();
    const sources = manifestSources();
    const manifest = buildAnalysisManifest({ reportId: "report_a", result: applyRuntimeIntegrity(baseline), sources });
    const missing = structuredClone(baseline);
    missing.evidenceFiles = missing.evidenceFiles?.filter((file) => file.id !== "evidence_ea003");
    const integrity = evaluateReportIntegrity(missing, manifest, sources);
    expect(integrity.assertions.find((item) => item.id === "unchanged-source-persistence")).toMatchObject({ status: "failed", severity: "critical" });
  });

  it("classifies different canonical hashes with unchanged inputs and versions as critical drift", () => {
    const baseline = buildAnalysisManifest({ reportId: "report_a", result: applyRuntimeIntegrity(financialFixture()), sources: manifestSources() });
    const changed: AnalysisManifest = { ...baseline, analysisId: "analysis_b", reportId: "report_b", canonicalBusinessStateHash: "different" };
    const comparison = compareAnalysisManifests(baseline, changed);
    expect(comparison).toMatchObject({ status: "unhealthy", identical: false, sourceFilesChanged: false });
    expect(comparison.events).toContainEqual(expect.objectContaining({ field: "canonical-business-state-hash", level: "critical" }));
  });

  it("blocks an unsupported material claim", () => {
    const result = cloneFixture();
    result.narrative = [{
      id: "unsupported-financial-claim",
      text: "The organization incurred $42,000 of eligible grant costs.",
      evidenceType: "unsupported",
      source: source("", "", ""),
      status: "review"
    }];
    const checked = applyRuntimeIntegrity(result);
    expect(checked.integrity?.assertions.find((item) => item.id === "unsupported-material-claims")).toMatchObject({ status: "failed", severity: "critical" });
    expect(checked.qualityChecks.find((item) => item.id === "deterministic-runtime-integrity")?.status).toBe("blocked");
  });

  it("never reports a canary as healthy when no health assertions could execute", () => {
    expect(buildReliabilityScorecard([]).status).toBe("unknown");
    expect(canaryHealthStatus("dependency_or_network", "healthy")).toBe("unknown");
  });

  it("sends a redacted critical alert through the pluggable notifier", async () => {
    const result = canary("unhealthy");
    const send = vi.fn().mockResolvedValue(undefined);
    await notifyReliabilityResult(result, { send });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ level: "critical", runId: "candidate", failingAssertionIds: ["accuracy"], dashboardPath: "/internal/reliability" }));
    expect(JSON.stringify(reliabilityNotification(result))).not.toMatch(/source content|customer report/i);
  });
});

describe("controlled self-healing", () => {
  it("retries a transient provider failure with bounded backoff and verifies recovery", async () => {
    const diagnosis = diagnoseReliabilityFailure({ assertions: [failed("provider-timeout", "availability", "request timed out")] });
    diagnosis.probableComponent = "model/provider";
    diagnosis.recommendedRecoveryAction = "bounded_retry";
    diagnosis.automaticRecoveryAllowed = true;
    const incident = createReliabilityIncident(diagnosis);
    const retry = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockRejectedValueOnce(new Error("temporary")).mockResolvedValue(undefined);
    const recovered = await attemptAutomaticRecovery(incident, { boundedRetry: retry, retryDelayMs: 1, verify: async () => ({ passed: true, canonicalHash: "restored", detail: "verified" }) });
    expect(retry).toHaveBeenCalledTimes(3);
    expect(recovered).toMatchObject({ lifecycle: "resolved", finalStatus: "resolved" });
    expect(recovered.recoveryAttempts[0]).toMatchObject({ status: "succeeded", verificationResult: "passed", afterCanonicalHash: "restored" });
  });

  it("rebuilds stale derived state and verifies the original canonical hash", async () => {
    const baseline = financialFixture();
    const expectedHash = canonicalBusinessStateHash(baseline);
    let current = structuredClone(baseline);
    current.financialAnalysis!.mappedActualTotal = 27_000;
    const staleHash = canonicalBusinessStateHash(current);
    const diagnosis = diagnoseReliabilityFailure({ assertions: [failed("mapped-total", "financial", "mapped total differs")] });
    const recovered = await attemptAutomaticRecovery(createReliabilityIncident(diagnosis), {
      rebuildDerivedState: async () => { current = structuredClone(baseline); },
      currentCanonicalHash: async () => canonicalBusinessStateHash(current),
      verify: async () => ({ passed: canonicalBusinessStateHash(current) === expectedHash, canonicalHash: canonicalBusinessStateHash(current), detail: "canonical state rebuilt from unchanged sources" })
    });
    expect(recovered.finalStatus).toBe("resolved");
    expect(recovered.recoveryAttempts[0].beforeCanonicalHash).toBe(staleHash);
    expect(recovered.recoveryAttempts[0].afterCanonicalHash).toBe(expectedHash);
  });

  it("requeues an interrupted analysis exactly once", async () => {
    const diagnosis = diagnoseReliabilityFailure({ assertions: [failed("analysis-interrupted", "availability", "job interrupted")] });
    diagnosis.probableComponent = "job execution";
    diagnosis.recommendedRecoveryAction = "requeue_idempotent_job";
    diagnosis.automaticRecoveryAllowed = true;
    const requeue = vi.fn().mockResolvedValue(undefined);
    const recovered = await attemptAutomaticRecovery(createReliabilityIncident(diagnosis), { requeueIdempotentJob: requeue, verify: async () => ({ passed: true, detail: "analysis completed exactly once" }) });
    expect(requeue).toHaveBeenCalledTimes(1);
    expect(recovered.finalStatus).toBe("resolved");
  });

  it("does not promote a failed candidate and keeps the last-known-good release active", () => {
    const lastKnownGood = lkg();
    const candidate = canary("unhealthy");
    expect(candidatePromotionDecision(candidate, lastKnownGood, 0)).toMatchObject({ promote: false, rollback: false });
    expect(validatedConfigurationDecision(candidate, lastKnownGood)).toMatchObject({ accepted: false, active: lastKnownGood });
  });

  it("activates the circuit breaker after three failed verified recovery attempts", async () => {
    const diagnosis = diagnoseReliabilityFailure({ assertions: [failed("service-health", "availability", "unavailable")] });
    diagnosis.recommendedRecoveryAction = "bounded_retry";
    diagnosis.automaticRecoveryAllowed = true;
    let incident = createReliabilityIncident(diagnosis);
    for (let attempt = 0; attempt < 3; attempt += 1) incident = await attemptAutomaticRecovery(incident, { boundedRetry: async () => undefined, retryDelayMs: 1, verify: async () => ({ passed: false, detail: "still unhealthy" }) });
    expect(incident).toMatchObject({ lifecycle: "escalated", finalStatus: "escalated" });
    expect(incident.recoveryAttempts).toHaveLength(3);
  });

  it("refuses to auto-categorize an ambiguous transaction", () => {
    const before = financialFixture();
    before.mappings[0] = { ...before.mappings[0], transactionId: "BW-AMB-001", suggestedCategory: "Unmapped", mappingConfidence: "unmapped", reportTreatment: "needs_category_review", requiresHumanAction: true };
    const after = structuredClone(before);
    after.mappings[0] = { ...after.mappings[0], suggestedCategory: "Technology & Data Systems", mappingConfidence: "high", reportTreatment: "included", requiresHumanAction: false };
    expect(() => assertSafeDerivedRecovery(before, after)).toThrow(/auto-categorize an ambiguous transaction/i);
  });

  it("refuses to fabricate or satisfy the missing EA011 approval", () => {
    const before = assistanceFixture();
    const after = structuredClone(before);
    const control = after.financialAnalysis!.controls[0];
    control.transactionIds = [];
    control.requiresAction = false;
    control.status = "passed";
    expect(() => assertSafeDerivedRecovery(before, after)).toThrow(/satisfy an approval without new approval evidence/i);
  });
});

function cloneFixture(): CompilationResult {
  const result = structuredClone(prototypeFixture);
  result.qualityChecks = result.qualityChecks.filter((item) => item.id !== "deterministic-runtime-integrity");
  result.narrative = [];
  result.programChecks = [];
  result.mappings = [];
  result.financialAnalysis = undefined;
  return result;
}

function financialFixture(): CompilationResult {
  const result = cloneFixture();
  result.mappings = [{ transactionId: "BW-TECH-001", date: "2027-03-01", description: "Technology", amount: 26_200, suggestedCategory: "Technology & Data Systems", confidence: 1, rationale: "Exact category", status: "verified", mappingConfidence: "high", complianceStatus: "clear", reportTreatment: "included" }];
  result.financialAnalysis = {
    ledgerTransactionCount: 1,
    mappedTransactionCount: 1,
    excludedTransactionCount: 0,
    mappedActualTotal: 26_200,
    budgetVariances: [{ category: "Technology & Data Systems", approvedAmount: 18_000, actualAmount: 26_200, varianceAmount: 8_200, variancePercent: 45.6, explanationThreshold: 7_500, explanationRequired: true, status: "explanation_required", transactionIds: ["BW-TECH-001"] }],
    controls: []
  };
  return result;
}

function p6Fixture(): CompilationResult {
  const result = cloneFixture();
  result.requirements = [{ id: "P6", requirement: "P6 Average client satisfaction target is at least 4.3 out of 5.", source: source("Award", "Section 7", "Average client satisfaction target 4.3"), confidence: 1, status: "verified", canonicalType: "reporting_requirement", canonicalSubject: "kpi-p6-client-satisfaction", applicability: "current" }];
  result.narrative = [{ id: "evidence-p6-satisfaction", text: "Average client satisfaction was 4.4 out of 5 across 80 valid responses.", evidenceType: "source_fact", source: source("Survey workbook", "Summary", "Average score 4.4"), status: "verified" }];
  return result;
}

function indirectFixture(): CompilationResult {
  const result = cloneFixture();
  result.requirements = [{
    id: "indirect-rule",
    requirement: "Prior approval is required for category changes of 15% or more. Indirect Costs may not exceed the lesser of $20,000 or 8% of total direct costs actually charged.",
    source: source("Award", "Section 5", "15% reallocation threshold; Indirect Costs capped at $20,000 or 8% of direct costs"),
    confidence: 1,
    status: "verified"
  }, {
    id: "direct-budget",
    requirement: "Approved Program Costs budget: $123,980.",
    source: source("Award", "Budget", "Program Costs $123,980"),
    confidence: 1,
    status: "verified"
  }, {
    id: "indirect-budget",
    requirement: "Approved Indirect Costs budget: $20,000.",
    source: source("Award", "Budget", "Indirect Costs $20,000"),
    confidence: 1,
    status: "verified"
  }];
  result.mappings = [
    { transactionId: "DIRECT", date: "2027-03-01", description: "Direct costs", amount: 123_980, suggestedCategory: "Program Costs", confidence: 1, rationale: "Exact", status: "verified", mappingConfidence: "high", complianceStatus: "clear", reportTreatment: "included" },
    { transactionId: "INDIRECT", date: "2027-03-01", description: "Indirect costs", amount: 9_000, suggestedCategory: "Indirect Costs", confidence: 1, rationale: "Exact", status: "verified", mappingConfidence: "high", complianceStatus: "clear", reportTreatment: "included" }
  ];
  result.financialAnalysis = {
    ledgerTransactionCount: 2,
    mappedTransactionCount: 2,
    excludedTransactionCount: 0,
    mappedActualTotal: 132_980,
    budgetVariances: [
      { category: "Program Costs", approvedAmount: 123_980, actualAmount: 123_980, varianceAmount: 0, variancePercent: 0, explanationThreshold: 7_500, explanationRequired: false, status: "within_budget", transactionIds: ["DIRECT"] },
      { category: "Indirect Costs", approvedAmount: 20_000, actualAmount: 9_000, varianceAmount: -11_000, variancePercent: -55, explanationThreshold: 7_500, explanationRequired: true, status: "explanation_required", transactionIds: ["INDIRECT"] }
    ],
    controls: [{ id: "indirect-cost-limit", title: "Indirect cost limit", detail: "$9,000.00 charged · $123,980.00 eligible direct costs · 8% percentage limit $9,918.40 · current applicable limit $9,918.40 · remaining capacity $918.40.", status: "passed", requiresAction: false, transactionIds: ["INDIRECT"] }]
  };
  return result;
}

function assistanceFixture(): CompilationResult {
  const result = cloneFixture();
  result.mappings = [
    ["BW-EA-003", 1_750], ["BW-EA-006", 2_200], ["BW-EA-011", 1_600]
  ].map(([transactionId, amount]) => ({ transactionId: String(transactionId), date: "2027-04-01", description: "Emergency assistance", amount: Number(amount), suggestedCategory: "Emergency Client Assistance", confidence: 1, rationale: "Exact", status: "verified" as const, mappingConfidence: "high" as const, complianceStatus: "evidence_required" as const, reportTreatment: "included" as const }));
  result.evidenceFiles = [approvalEvidence("evidence_ea003", "BW-EA-003"), approvalEvidence("evidence_ea006", "BW-EA-006")];
  result.financialAnalysis = {
    ledgerTransactionCount: 3,
    mappedTransactionCount: 3,
    excludedTransactionCount: 0,
    mappedActualTotal: 5_550,
    budgetVariances: [{ category: "Emergency Client Assistance", approvedAmount: 70_000, actualAmount: 5_550, varianceAmount: -64_450, variancePercent: -92.1, explanationThreshold: 7_500, explanationRequired: true, status: "explanation_required", transactionIds: ["BW-EA-003", "BW-EA-006", "BW-EA-011"] }],
    controls: [{ id: "assistance-approvals", title: "Approvals", detail: "EA011 unresolved", status: "review", requiresAction: true, transactionIds: ["BW-EA-011"], evidenceTargetTransactionIds: ["BW-EA-003", "BW-EA-006", "BW-EA-011"], evidenceSatisfiedBy: ["evidence_ea003", "evidence_ea006"] }]
  };
  return result;
}

function approvalEvidence(id: string, transactionId: string) {
  return { id, name: `${transactionId}.pdf`, mimeType: "application/pdf", size: 100, uploadedAt: "2027-08-01T00:00:00.000Z", parsingStatus: "parsed" as const, relevance: "matched" as const, matches: [{ targetType: "approval" as const, targetId: `approval:${transactionId}:director`, targetLabel: transactionId, confidence: 1, status: "matched" as const, rationale: "Exact approval", source: source(`${transactionId}.pdf`, "Page 1", transactionId) }] };
}

function manifestSources() { return [{ role: "awardAgreement", name: "award.docx", size: 100, sha256: "a".repeat(64) }, { role: "supportingEvidence", name: "approval.pdf", size: 100, sha256: "b".repeat(64), relevance: "matched", evidenceTargetIds: ["approval:BW-EA-003:director"] }]; }
function source(sourceName: string, locator: string, excerpt: string) { return { sourceName, locator, excerpt }; }
function failed(id: string, area: "availability" | "financial", detail: string) { return { id, area, severity: "critical" as const, status: "failed" as const, detail }; }
function lkg(): LastKnownGoodRelease { return { recordedAt: "2026-08-13T00:00:00.000Z", environment: "qa", applicationRevision: "good", deploymentRevision: "good-revision", primaryModel: "model-good", verifierModel: "verify-good", promptVersion: "prompt-good", canonicalizationSchemaVersion: "schema-good", evaluationVersion: "eval-good", canaryRunId: "run-good", canonicalBusinessStateHash: "hash-good" }; }
function canary(status: ReliabilityCanaryResult["status"]): ReliabilityCanaryResult { return { runId: "candidate", fixtureId: "northstar", trigger: "post_deploy", environment: "qa", status, startedAt: "2026-08-13T00:00:00.000Z", completedAt: "2026-08-13T00:01:00.000Z", durationMs: 60_000, applicationRevision: "candidate", deploymentRevision: "candidate-revision", reportIds: [], assertions: status === "healthy" ? [] : [failed("accuracy", "financial", "failed")], scorecard: { status, financialDeterministicAccuracy: status === "healthy" ? 100 : 0, kpiFactualAccuracy: status === "healthy" ? 100 : 0, obligationCoverage: status === "healthy" ? 100 : 0, evidenceClassificationAccuracy: status === "healthy" ? 100 : 0, evidenceAttributionAccuracy: status === "healthy" ? 100 : 0, approvalStateAccuracy: status === "healthy" ? 100 : 0, unsupportedCriticalClaims: status === "healthy" ? 0 : 1, sameReportDeterminism: status === "healthy" ? "pass" : "fail", crossReportDeterminism: status === "healthy" ? "pass" : "fail", browserApiConsistency: status === "healthy" ? "pass" : "fail", thresholds: { obligationCoverage: 95, evidenceClassificationAccuracy: 95, criticalFabrication: 0 } }, sameReportHashes: [], crossReportHashes: [], failingAssertionIds: status === "healthy" ? [] : ["accuracy"], cleanup: { reportsDeleted: 0, identityDeleted: false, errors: [] }, artifacts: [] }; }
