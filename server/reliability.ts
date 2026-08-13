import { createHash } from "node:crypto";
import { buildProgramInsights, buildProgramReadiness } from "../src/lib/programInsights.ts";
import { buildReportAttention } from "../src/lib/reportAttention.ts";
import type { CompilationResult } from "../src/types/prototype.ts";
import type {
  AnalysisComparison,
  AnalysisDriftEvent,
  AnalysisManifest,
  AnalysisPerformance,
  AnalysisSourceManifest,
  MaterialClaimVerification,
  ReliabilityAssertion,
  ReliabilityCanaryResult,
  ReliabilityHealth,
  ReliabilityScorecard,
  ReportIntegrityResult
} from "../src/types/reliability.ts";
import { isMappingIncludedInFinancialAnalysis } from "./financialControls.ts";
import {
  applicationEnvironment,
  applicationRevision,
  CANONICAL_ANALYSIS_VERSION,
  CANONICALIZATION_SCHEMA_VERSION,
  deploymentRevision,
  RELIABILITY_EVALUATION_VERSION,
  REPORT_PROMPT_VERSION,
  SOURCE_PARSER_VERSION
} from "./analysisVersions.ts";

const validTreatments = new Set([
  "included",
  "pending_evidence",
  "provisional",
  "excluded_duplicate",
  "excluded_outside_period",
  "excluded_grant_period",
  "excluded_invalid_date",
  "excluded_period_unavailable",
  "needs_category_review"
]);

const defaultPerformance: AnalysisPerformance = {
  analysisDurationMs: 0,
  parserDurationMs: 0,
  llmDurationMs: 0,
  evidenceReconciliationDurationMs: 0
};

export function applyRuntimeIntegrity(result: CompilationResult, priorManifest?: AnalysisManifest, sources: AnalysisSourceManifest[] = []): CompilationResult {
  const integrity = evaluateReportIntegrity(result, priorManifest, sources);
  const qualityChecks = [
    ...result.qualityChecks.filter((check) => check.id !== "deterministic-runtime-integrity"),
    {
      id: "deterministic-runtime-integrity",
      label: "Report integrity",
      detail: integrity.criticalFailureCount
        ? "GrantDeskHQ detected an internal inconsistency while validating this report. Your data has been preserved, and the report has not been marked ready."
        : "Financial populations, KPI values, provenance, evidence relationships, and material generated claims passed deterministic integrity checks.",
      required: true,
      status: integrity.criticalFailureCount ? "blocked" as const : "passed" as const
    }
  ];
  return { ...result, integrity, qualityChecks };
}

export function evaluateReportIntegrity(result: CompilationResult, priorManifest?: AnalysisManifest, sources: AnalysisSourceManifest[] = []): ReportIntegrityResult {
  const assertions: ReliabilityAssertion[] = [];
  const add = (assertion: ReliabilityAssertion) => assertions.push(assertion);
  const financial = result.financialAnalysis;
  const included = result.mappings.filter((mapping) => isMappingIncludedInFinancialAnalysis(mapping, result.requirements));

  add(check(
    "ledger-population",
    "financial",
    "critical",
    !financial || (result.mappings.length === financial.ledgerTransactionCount && result.mappings.every((mapping) => validTreatments.has(mapping.reportTreatment || ""))),
    "Every ledger row has exactly one recognized report treatment and is represented in the financial population.",
    financial?.ledgerTransactionCount,
    result.mappings.length
  ));

  if (financial) {
    const includedTotal = money(included.reduce((sum, mapping) => sum + mapping.amount, 0));
    const categoryTotals = new Map<string, number>();
    for (const mapping of included) categoryTotals.set(mapping.suggestedCategory, money((categoryTotals.get(mapping.suggestedCategory) || 0) + mapping.amount));
    const categoryMismatches = financial.budgetVariances.flatMap((variance) => sameMoney(categoryTotals.get(variance.category) || 0, variance.actualAmount)
      ? []
      : [`${variance.category}: calculated ${categoryTotals.get(variance.category) || 0}, displayed ${variance.actualAmount}`]);
    add(check("mapped-total", "financial", "critical", sameMoney(includedTotal, financial.mappedActualTotal), "Included ledger rows reconcile to mapped current-period spend.", includedTotal, financial.mappedActualTotal));
    add(check("category-totals", "financial", "critical", categoryMismatches.length === 0, categoryMismatches.length ? categoryMismatches.join("; ") : "Every category actual equals its included mapped ledger rows."));
    add(check("budget-total", "financial", "critical", sameMoney(financial.budgetVariances.reduce((sum, item) => sum + item.actualAmount, 0), financial.mappedActualTotal), "Budget-to-actual category totals reconcile to mapped spend."));
    add(indirectIntegrityAssertion(result, included));
  } else {
    add(notEvaluated("mapped-total", "financial", "No financial analysis is available for this report."));
    add(notEvaluated("category-totals", "financial", "No financial analysis is available for this report."));
    add(notEvaluated("budget-total", "financial", "No financial analysis is available for this report."));
    add(notEvaluated("indirect-cost", "financial", "No applicable indirect-cost calculation is available."));
  }

  const evidenceIds = new Set((result.evidenceFiles || []).map((file) => file.id));
  const brokenEvidenceReferences = evidenceReferences(result).filter((id) => !evidenceIds.has(id));
  add(check("evidence-relationships", "evidence", "critical", brokenEvidenceReferences.length === 0, brokenEvidenceReferences.length
    ? `Accepted evidence relationships refer to missing files: ${[...new Set(brokenEvidenceReferences)].join(", ")}.`
    : "Every evidence-satisfied state has a persisted canonical evidence relationship."));

  const irrelevantAccepted = (result.evidenceFiles || []).filter((file) => file.relevance === "irrelevant" && file.matches.some((match) => match.status === "matched" || match.confirmedByUser));
  add(check("irrelevant-evidence", "evidence", "critical", irrelevantAccepted.length === 0, irrelevantAccepted.length
    ? `Irrelevant evidence has accepted matches: ${irrelevantAccepted.map((file) => file.name).join(", ")}.`
    : "Irrelevant files satisfy no requirement, KPI, transaction, approval, or issue."));

  add(approvalEvidenceIntegrityAssertion(result));

  const provenanceFailures = verifiedItemsWithoutSource(result);
  add(check("verified-provenance", "provenance", "critical", provenanceFailures.length === 0, provenanceFailures.length
    ? `Verified items lack usable source provenance: ${provenanceFailures.join(", ")}.`
    : "Every verified source-derived item has a usable source relationship."));

  const readiness = buildProgramReadiness(result);
  const kpiTotal = readiness.ready + readiness.conflicts + readiness.awaitingConfirmation;
  add(check("kpi-population", "kpi", "critical", kpiTotal === expectedKpiCount(result), "Canonical KPI readiness accounts for each identified KPI exactly once.", expectedKpiCount(result), kpiTotal));

  const claims = verifyMaterialClaims(result);
  const mismatchedClaims = claims.filter((claim) => claim.status === "mismatch");
  const unsupportedClaims = claims.filter((claim) => claim.status === "unsupported");
  add(check("canonical-narrative-values", "claims", "critical", mismatchedClaims.length === 0, mismatchedClaims.length
    ? mismatchedClaims.map((claim) => claim.detail).join(" ")
    : "Material narrative values agree with canonical structured values."));
  add(check("unsupported-material-claims", "claims", "critical", unsupportedClaims.length === 0, unsupportedClaims.length
    ? unsupportedClaims.map((claim) => claim.detail).join(" ")
    : "Every material generated claim has canonical or source-linked support."));

  if (priorManifest) {
    const currentHash = canonicalBusinessStateHash(result, sources);
    add(check("unchanged-source-persistence", "persistence", "critical", currentHash === priorManifest.canonicalBusinessStateHash,
      "Unchanged source hashes must preserve canonical files, mappings, evidence, KPIs, approvals, identities, actions, and readiness.",
      priorManifest.canonicalBusinessStateHash, currentHash));
  }

  const criticalFailureCount = assertions.filter((item) => item.severity === "critical" && item.status === "failed").length;
  const warningCount = assertions.filter((item) => item.severity === "warning" && item.status === "failed").length;
  return {
    status: criticalFailureCount ? "unhealthy" : warningCount ? "degraded" : "healthy",
    checkedAt: new Date().toISOString(),
    assertions,
    claims,
    criticalFailureCount,
    warningCount,
    ...(criticalFailureCount ? { customerMessage: "GrantDeskHQ detected an inconsistency while validating this report. Your data has been preserved, and the report has not been marked ready." } : {})
  };
}

export function buildAnalysisManifest(args: {
  reportId: string;
  result: CompilationResult;
  sources: AnalysisSourceManifest[];
  createdAt?: string;
  performance?: Partial<AnalysisPerformance>;
}): AnalysisManifest {
  const result = args.result;
  const performance = { ...defaultPerformance, ...(result.analysisMetrics || {}), ...(args.performance || {}) };
  return {
    analysisId: `analysis_${createHash("sha256").update(`${args.reportId}\0${args.createdAt || result.generatedAt}\0${canonicalBusinessStateHash(result, args.sources)}`).digest("hex").slice(0, 32)}`,
    reportId: args.reportId,
    canonicalAnalysisVersion: CANONICAL_ANALYSIS_VERSION,
    canonicalizationSchemaVersion: CANONICALIZATION_SCHEMA_VERSION,
    applicationRevision: applicationRevision(),
    deploymentRevision: deploymentRevision(),
    environment: applicationEnvironment(),
    modelName: result.model,
    verifierModel: process.env.OPENAI_VERIFIER_MODEL?.trim() || "gpt-5.6-luna",
    promptVersion: REPORT_PROMPT_VERSION,
    parserVersion: SOURCE_PARSER_VERSION,
    evaluationVersion: RELIABILITY_EVALUATION_VERSION,
    sourceFiles: [...args.sources].sort((left, right) => `${left.role}:${left.name}`.localeCompare(`${right.role}:${right.name}`)),
    sourceCount: args.sources.length,
    evidenceFileCount: args.sources.filter((source) => source.role === "supportingEvidence").length,
    glRowCount: result.financialAnalysis?.ledgerTransactionCount || result.mappings.length,
    requirementCount: result.requirements.length,
    kpiCount: expectedKpiCount(result),
    groupedActionCount: buildReportAttention(result).length,
    canonicalBusinessStateHash: canonicalBusinessStateHash(result, args.sources),
    reportReadinessState: result.workflow.readiness,
    blockerCount: result.workflow.actionRequiredCount + result.workflow.missingInputCount,
    performance,
    createdAt: args.createdAt || new Date().toISOString()
  };
}

export function canonicalBusinessStateHash(result: CompilationResult, sources: AnalysisSourceManifest[] = []) {
  return createHash("sha256").update(JSON.stringify(canonicalBusinessState(result, sources))).digest("hex");
}

export function canonicalBusinessState(result: CompilationResult, sources: AnalysisSourceManifest[] = []) {
  const insights = buildProgramInsights(result).filter((item) => ["households-served", "housing-assessments", "housing-placements", "housing-retention", "benefits-screenings", "client-satisfaction", "satisfaction-unconfirmed"].includes(item.id));
  return {
    sources: sources.map((source) => ({ role: source.role, name: source.name, size: source.size, sha256: source.sha256, relevance: source.relevance || null, evidenceTargetIds: [...(source.evidenceTargetIds || [])].sort() })).sort(byJson),
    inputs: result.inputStatus.map((item) => ({ role: item.role, available: item.available, required: item.requiredForCompletion })).sort(byJson),
    requirements: result.requirements.map((item) => ({ id: item.id, canonicalType: item.canonicalType || null, canonicalSubject: item.canonicalSubject || null, applicability: item.applicability || null, status: item.status, evidence: [...(item.evidenceSatisfiedBy || [])].sort() })).sort(byJson),
    mappings: result.mappings.map((item) => ({ transactionId: item.transactionId, amount: item.amount, category: item.suggestedCategory, treatment: item.reportTreatment || null, confidence: item.mappingConfidence || null, compliance: item.complianceStatus || null, evidence: [...(item.evidenceSatisfiedBy || [])].sort() })).sort(byJson),
    financial: result.financialAnalysis ? {
      ledgerTransactionCount: result.financialAnalysis.ledgerTransactionCount,
      mappedTransactionCount: result.financialAnalysis.mappedTransactionCount,
      excludedTransactionCount: result.financialAnalysis.excludedTransactionCount,
      mappedActualTotal: result.financialAnalysis.mappedActualTotal,
      variances: result.financialAnalysis.budgetVariances.map((item) => ({ category: item.category, approved: item.approvedAmount, actual: item.actualAmount, variance: item.varianceAmount, variancePercent: item.variancePercent, explanationRequired: item.explanationRequired })).sort(byJson),
      controls: result.financialAnalysis.controls.map((item) => ({ id: item.id, status: item.status, requiresAction: item.requiresAction, transactionIds: [...item.transactionIds].sort(), evidence: [...(item.evidenceSatisfiedBy || [])].sort() })).sort(byJson)
    } : null,
    kpis: {
      readiness: buildProgramReadiness(result),
      insights: insights.map((item) => ({ id: item.id, status: item.status, value: item.value })).sort(byJson)
    },
    evidence: (result.evidenceFiles || []).map((file) => ({ name: file.name, parsingStatus: file.parsingStatus, relevance: file.relevance, matches: file.matches.map((match) => ({ targetType: match.targetType, targetId: match.targetId, status: match.status, confirmed: Boolean(match.confirmedByUser) })).sort(byJson) })).sort(byJson),
    programs: (result.programChecks || []).map((item) => ({ id: item.id, type: item.type, severity: item.severity, resolution: item.resolution, status: item.status, evidenceBackedValue: item.evidenceBackedValue || null, evidence: [...(item.evidenceSatisfiedBy || [])].sort() })).sort(byJson),
    actions: buildReportAttention(result).map((item) => ({ id: item.id, kind: item.kind })).sort(byJson),
    readiness: result.workflow,
    integrity: {
      criticalFailures: result.integrity?.assertions.filter((item) => item.severity === "critical" && item.status === "failed").map((item) => item.id).sort() || [],
      unsupportedClaims: result.integrity?.claims.filter((item) => item.status === "unsupported").map((item) => item.claimId).sort() || []
    }
  };
}

export function compareAnalysisManifests(before: AnalysisManifest, after: AnalysisManifest): AnalysisComparison {
  const events: AnalysisDriftEvent[] = [];
  const sourceFilesChanged = stableJson(before.sourceFiles) !== stableJson(after.sourceFiles);
  if (sourceFilesChanged) events.push(drift("source-files", "expected", before.sourceFiles, after.sourceFiles, "The source package changed."));
  compareVersion(events, "application-revision", before.applicationRevision, after.applicationRevision);
  compareVersion(events, "deployment-revision", before.deploymentRevision, after.deploymentRevision);
  compareVersion(events, "model", before.modelName, after.modelName);
  compareVersion(events, "verifier-model", before.verifierModel, after.verifierModel);
  compareVersion(events, "prompt-version", before.promptVersion, after.promptVersion);
  compareVersion(events, "parser-version", before.parserVersion, after.parserVersion);
  compareVersion(events, "schema-version", before.canonicalizationSchemaVersion, after.canonicalizationSchemaVersion);
  compareMaterial(events, "requirement-count", before.requirementCount, after.requirementCount, sourceFilesChanged);
  compareMaterial(events, "kpi-count", before.kpiCount, after.kpiCount, sourceFilesChanged);
  compareMaterial(events, "action-count", before.groupedActionCount, after.groupedActionCount, sourceFilesChanged);
  compareMaterial(events, "readiness", before.reportReadinessState, after.reportReadinessState, sourceFilesChanged);
  if (before.performance.analysisDurationMs > 0
    && after.performance.analysisDurationMs > Math.max(before.performance.analysisDurationMs * 1.75, before.performance.analysisDurationMs + 30_000)) {
    events.push(drift("analysis-duration", "suspicious", before.performance.analysisDurationMs, after.performance.analysisDurationMs, "Analysis duration increased materially relative to the prior comparable run."));
  }
  if (before.canonicalBusinessStateHash !== after.canonicalBusinessStateHash) events.push(drift(
    "canonical-business-state-hash",
    sourceFilesChanged ? "expected" : sameExecutionVersions(before, after) ? "critical" : "suspicious",
    before.canonicalBusinessStateHash,
    after.canonicalBusinessStateHash,
    sourceFilesChanged ? "Canonical state changed after the source package changed." : "Canonical state changed while source hashes were unchanged."
  ));
  const level = events.some((event) => event.level === "critical") ? "unhealthy" : events.some((event) => event.level === "suspicious") ? "degraded" : "healthy";
  return { status: level, identical: before.canonicalBusinessStateHash === after.canonicalBusinessStateHash, sourceFilesChanged, events };
}

export function buildReliabilityScorecard(assertions: ReliabilityAssertion[], gates: Partial<Pick<ReliabilityCanaryResult["scorecard"], "sameReportDeterminism" | "crossReportDeterminism" | "browserApiConsistency">> = {}): ReliabilityScorecard {
  const percent = (areas: ReliabilityAssertion["area"][]) => {
    const applicable = assertions.filter((item) => areas.includes(item.area) && item.status !== "not_evaluated");
    return applicable.length ? Math.round(applicable.filter((item) => item.status === "passed").length / applicable.length * 1000) / 10 : 0;
  };
  const unsupportedCriticalClaims = assertions.filter((item) => item.id === "unsupported-material-claims" && item.status === "failed").length;
  const scorecard: ReliabilityScorecard = {
    status: healthFromAssertions(assertions),
    financialDeterministicAccuracy: percent(["financial"]),
    kpiFactualAccuracy: percent(["kpi", "claims"]),
    obligationCoverage: percent(["provenance"]),
    evidenceClassificationAccuracy: percent(["evidence"]),
    evidenceAttributionAccuracy: percent(["evidence", "provenance"]),
    approvalStateAccuracy: percent(["evidence"]),
    unsupportedCriticalClaims,
    sameReportDeterminism: gates.sameReportDeterminism || "not_evaluated",
    crossReportDeterminism: gates.crossReportDeterminism || "not_evaluated",
    browserApiConsistency: gates.browserApiConsistency || "not_evaluated",
    thresholds: { obligationCoverage: 95, evidenceClassificationAccuracy: 95, criticalFabrication: 0 }
  };
  if ([scorecard.sameReportDeterminism, scorecard.crossReportDeterminism, scorecard.browserApiConsistency].includes("fail")) scorecard.status = "unhealthy";
  if (assertions.some((item) => item.status !== "not_evaluated")
    && (scorecard.obligationCoverage < 95 || scorecard.evidenceClassificationAccuracy < 95)) scorecard.status = scorecard.status === "unhealthy" ? "unhealthy" : "degraded";
  return scorecard;
}

export function verifyMaterialClaims(result: CompilationResult): MaterialClaimVerification[] {
  const facts = [...kpiFacts(result), ...financialFacts(result)];
  return result.narrative.flatMap<MaterialClaimVerification>((statement) => {
    const material = materialClaimType(statement.text);
    if (!material) return [];
    const sourceIds = statement.source?.sourceName ? [statement.source.sourceName] : [];
    const fact = facts.find((candidate) => candidate.pattern.test(statement.text));
    const narrativeValue = fact
      ? fact.id.startsWith("financial:")
        ? extractFinancialClaimValue(statement.text, fact.id.slice("financial:".length, -":actual".length))
        : extractClaimValue(statement.text, fact.patterns)
      : undefined;
    if (fact && narrativeValue !== undefined && !sameNumber(narrativeValue, fact.actual)) return [{
      claimId: statement.id,
      claimType: fact.claimType,
      structuredValue: fact.actual,
      narrativeValue,
      sourceIds,
      status: "mismatch" as const,
      detail: `${statement.id} reports ${narrativeValue}, but canonical ${fact.id} is ${fact.actual}.`
    }];
    const supported = statement.evidenceType === "calculation" || (statement.evidenceType !== "unsupported" && hasUsableSource(statement.source));
    return [{
      claimId: statement.id,
      claimType: fact?.claimType || material,
      structuredValue: fact?.actual,
      narrativeValue,
      sourceIds,
      status: supported ? "supported" as const : "unsupported" as const,
      detail: supported ? `${statement.id} has canonical or source-linked support.` : `${statement.id} is a material claim without canonical or source-linked support.`
    }];
  });
}

function financialFacts(result: CompilationResult) {
  return (result.financialAnalysis?.budgetVariances || []).map((item) => ({
    id: `financial:${item.category}:actual`,
    pattern: new RegExp(escapeRegex(item.category), "i"),
    patterns: [/(?:actual|spent|spending|expenditures?)\D{0,24}\$\s*([\d,]+(?:\.\d+)?)/i],
    actual: item.actualAmount,
    claimType: "financial_amount" as const
  }));
}

function indirectIntegrityAssertion(result: CompilationResult, included: CompilationResult["mappings"]): ReliabilityAssertion {
  const rule = result.requirements.map((item) => `${item.requirement} ${item.source.excerpt}`).find((text) => /indirect/i.test(text) && /%/.test(text) && /direct costs?/i.test(text));
  const control = result.financialAnalysis?.controls.find((item) => item.id === "indirect-cost-limit");
  if (!rule || !control) return notEvaluated("indirect-cost", "financial", "No applicable indirect-cost rule and calculated control were both available.");
  const indirectClause = isolateIndirectCostClause(rule);
  const percent = Number((indirectClause.match(/(\d+(?:\.\d+)?)\s*%\s+of\s+(?:total\s+)?direct costs?/i)
    || indirectClause.match(/(?:indirect costs?).{0,160}?(\d+(?:\.\d+)?)\s*%/i))?.[1]);
  const fixedCap = Number((indirectClause.match(/\$\s*([\d,]+(?:\.\d+)?)/)?.[1] || "").replaceAll(",", ""));
  if (!Number.isFinite(percent)) return check("indirect-cost", "financial", "critical", false, "The indirect-cost percentage could not be derived from its canonical rule.");
  const direct = money(included.filter((item) => !/indirect/i.test(item.suggestedCategory)).reduce((sum, item) => sum + item.amount, 0));
  const charged = money(included.filter((item) => /indirect/i.test(item.suggestedCategory)).reduce((sum, item) => sum + item.amount, 0));
  const percentLimit = money(direct * percent / 100);
  const limit = Number.isFinite(fixedCap) && fixedCap > 0 ? Math.min(fixedCap, percentLimit) : percentLimit;
  const remaining = money(limit - charged);
  const expectedTokens = [currency(direct), currency(limit), `${percent}%`, currency(charged), currency(Math.abs(remaining))];
  const valid = expectedTokens.every((token) => control.detail.includes(token))
    && control.status === (remaining >= -0.005 ? "passed" : "blocked")
    && control.requiresAction === (remaining < -0.005);
  return check("indirect-cost", "financial", "critical", valid,
    valid ? "The indirect-cost calculation uses the contractual percentage, eligible direct-cost base, fixed cap, and charged amount." : `Indirect control does not match the deterministic calculation: direct ${currency(direct)}, ${percent}% limit ${currency(percentLimit)}, applicable limit ${currency(limit)}, charged ${currency(charged)}, remaining ${currency(remaining)}.`);
}

function approvalEvidenceIntegrityAssertion(result: CompilationResult): ReliabilityAssertion {
  const control = result.financialAnalysis?.controls.find((item) => item.id === "assistance-approvals");
  if (!control) return notEvaluated("approval-state", "evidence", "No per-transaction approval control applies to this report.");
  const requiredIds = control.evidenceTargetTransactionIds || control.transactionIds;
  if (!requiredIds.length) return check("approval-state", "evidence", "critical", true, "No transaction-level approvals are required.");
  const unresolved = new Set(control.requiresAction ? control.transactionIds : []);
  const acceptedTargets = new Set((result.evidenceFiles || []).flatMap((file) => file.matches.flatMap((match) =>
    (match.status === "matched" || match.confirmedByUser) && match.targetType === "approval" ? [match.targetId] : []
  )));
  const unsupportedSatisfied = requiredIds.filter((transactionId) => !unresolved.has(transactionId)
    && !acceptedTargets.has(`approval:${transactionId}:director`));
  return check(
    "approval-state",
    "evidence",
    "critical",
    unsupportedSatisfied.length === 0,
    unsupportedSatisfied.length
      ? `Approval state was satisfied without accepted approval evidence for: ${unsupportedSatisfied.join(", ")}.`
      : "Every satisfied transaction-level approval has accepted canonical approval evidence; unresolved approvals remain open.",
    "accepted evidence or unresolved status for every required approval",
    unsupportedSatisfied
  );
}

function kpiFacts(result: CompilationResult) {
  const byId = new Map(buildProgramInsights(result).map((item) => [item.id, item]));
  const value = (id: string) => byId.get(id)?.value || "";
  return [
    { id: "P1", pattern: /households? served|unduplicated households?/i, patterns: [/(?:served|serving)\D{0,24}(\d+(?:\.\d+)?)/i, /(\d+(?:\.\d+)?)\s+unduplicated households/i], actual: firstNumber(value("households-served")), claimType: "participant_count" as const },
    { id: "P2", pattern: /housing[- ]stability assessments?|completed assessments?/i, patterns: [/(?:assessment|assessments)\D{0,24}(\d+(?:\.\d+)?)/i, /(\d+(?:\.\d+)?)\s+housing[- ]stability assessments/i], actual: firstNumber(value("housing-assessments")), claimType: "kpi_result" as const },
    { id: "P3", pattern: /housing placements?|stable[- ]housing placements?|households? placed/i, patterns: [/(?:placements?|placed)\D{0,24}(\d+(?:\.\d+)?)/i, /(\d+(?:\.\d+)?)\s+(?:stable[- ]housing )?placements/i], actual: firstNumber(value("housing-placements")), claimType: "kpi_result" as const },
    { id: "P4", pattern: /120[- ]day|housing retention|remained stably housed/i, patterns: [/(\d+(?:\.\d+)?)\s*%/], actual: firstNumber(value("housing-retention")), claimType: "kpi_result" as const },
    { id: "P5", pattern: /benefits screenings?/i, patterns: [/(?:screenings?)\D{0,24}(\d+(?:\.\d+)?)/i, /(\d+(?:\.\d+)?)\s+benefits screenings/i], actual: firstNumber(value("benefits-screenings")), claimType: "kpi_result" as const },
    { id: "P6", pattern: /client[- ]satisfaction|average(?: client)? satisfaction/i, patterns: [/(?:satisfaction|average)\D{0,35}(\d+(?:\.\d+)?)/i, /(\d+(?:\.\d+)?)\s+(?:out of|\/)+\s*5/i], actual: firstNumber(value("client-satisfaction")), claimType: "kpi_result" as const }
  ].filter((item) => Number.isFinite(item.actual));
}

function expectedKpiCount(result: CompilationResult) {
  const subjects = new Set(result.requirements.flatMap((item) => item.canonicalSubject?.startsWith("kpi-p") ? [item.canonicalSubject.slice(0, 6)] : []));
  if (subjects.size) return subjects.size;
  const insights = buildProgramInsights(result).filter((item) => ["households-served", "housing-assessments", "housing-placements", "housing-retention", "benefits-screenings", "client-satisfaction", "satisfaction-unconfirmed"].includes(item.id));
  return new Set(insights.map((item) => item.id === "satisfaction-unconfirmed" ? "client-satisfaction" : item.id)).size;
}

function verifiedItemsWithoutSource(result: CompilationResult) {
  const failures: string[] = [];
  for (const item of result.requirements) if (item.status === "verified" && !hasUsableSource(item.source)) failures.push(`requirement:${item.id}`);
  for (const item of result.narrative) if (item.status === "verified" && item.evidenceType !== "calculation" && !hasUsableSource(item.source)) failures.push(`narrative:${item.id}`);
  for (const item of result.programChecks || []) if (item.status === "verified" && !item.sources.some(hasUsableSource)) failures.push(`program:${item.id}`);
  for (const [name, field] of Object.entries(result.grantProfile)) if (field?.status === "verified" && !hasUsableSource(field.source)) failures.push(`profile:${name}`);
  return failures;
}

function evidenceReferences(result: CompilationResult) {
  return [
    ...result.requirements.flatMap((item) => item.evidenceSatisfiedBy || []),
    ...result.mappings.flatMap((item) => item.evidenceSatisfiedBy || []),
    ...(result.programChecks || []).flatMap((item) => item.evidenceSatisfiedBy || []),
    ...result.qualityChecks.flatMap((item) => item.evidenceSatisfiedBy || []),
    ...result.validation.findings.flatMap((item) => item.evidenceSatisfiedBy || []),
    ...(result.financialAnalysis?.controls || []).flatMap((item) => item.evidenceSatisfiedBy || [])
  ];
}

function materialClaimType(text: string): MaterialClaimVerification["claimType"] | null {
  if (!/(?:\$\s*[\d,]+|\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?\s*(?:\/|out of)\s*\d+(?:\.\d+)?|\b\d{4}-\d{2}-\d{2}\b|\b\d+(?:\.\d+)?\s+(?:participants?|households?|responses?|assessments?|placements?|screenings?)\b|approved|compliant|required|deadline|due date|target|variance)/i.test(text)) return null;
  if (/\$|financial|spend|cost|budget/i.test(text)) return "financial_amount";
  if (/deadline|due date/i.test(text)) return "deadline";
  if (/approval|approved/i.test(text)) return "approval_status";
  if (/variance/i.test(text)) return "variance";
  if (/target/i.test(text)) return "target";
  if (/households?|participants?|responses?/i.test(text)) return "participant_count";
  return "material_statement";
}

function extractClaimValue(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = Number(match?.[1]?.replaceAll(",", ""));
    if (match?.[1] && Number.isFinite(value)) return value;
  }
  return undefined;
}

function extractFinancialClaimValue(text: string, category: string) {
  const categoryPattern = escapeRegex(category);
  const afterCategory = text.match(new RegExp(`${categoryPattern}.{0,100}?(?:actual(?: spending)?|spent|spending|expenditures?)?\\D{0,20}\\$\\s*([\\d,]+(?:\\.\\d+)?)`, "i"));
  if (afterCategory?.[1]) return Number(afterCategory[1].replaceAll(",", ""));
  const beforeCategory = text.match(new RegExp(`\\$\\s*([\\d,]+(?:\\.\\d+)?).{0,60}?${categoryPattern}`, "i"));
  if (beforeCategory?.[1]) return Number(beforeCategory[1].replaceAll(",", ""));
  return undefined;
}

function isolateIndirectCostClause(value: string) {
  const clauses = value.split(/[;\n]|(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  const exact = clauses.find((item) => /indirect/i.test(item) && /\d+(?:\.\d+)?\s*%/.test(item) && /direct costs?/i.test(item));
  if (exact) return exact;
  const indirectIndex = value.search(/indirect/i);
  if (indirectIndex < 0) return value;
  return value.slice(Math.max(0, indirectIndex - 120), indirectIndex + 260);
}

function check(id: string, area: ReliabilityAssertion["area"], severity: ReliabilityAssertion["severity"], passed: boolean, detail: string, expected?: unknown, actual?: unknown): ReliabilityAssertion {
  return { id, area, severity, status: passed ? "passed" : "failed", detail, ...(expected !== undefined ? { expected } : {}), ...(actual !== undefined ? { actual } : {}) };
}

function notEvaluated(id: string, area: ReliabilityAssertion["area"], detail: string): ReliabilityAssertion {
  return { id, area, severity: "info", status: "not_evaluated", detail };
}

function healthFromAssertions(assertions: ReliabilityAssertion[]): ReliabilityHealth {
  if (assertions.some((item) => item.severity === "critical" && item.status === "failed")) return "unhealthy";
  if (assertions.some((item) => item.status === "failed")) return "degraded";
  if (!assertions.some((item) => item.status !== "not_evaluated")) return "unknown";
  return "healthy";
}

function drift(field: string, level: AnalysisDriftEvent["level"], before: unknown, after: unknown, detail: string): AnalysisDriftEvent {
  return { id: `drift_${createHash("sha256").update(`${field}\0${stableJson(before)}\0${stableJson(after)}`).digest("hex").slice(0, 20)}`, level, field, before, after, detail };
}

function compareVersion(events: AnalysisDriftEvent[], field: string, before: string, after: string) {
  if (before !== after) events.push(drift(field, "expected", before, after, `${field.replaceAll("-", " ")} changed.`));
}

function compareMaterial(events: AnalysisDriftEvent[], field: string, before: unknown, after: unknown, sourceFilesChanged: boolean) {
  if (before === after) return;
  events.push(drift(field, sourceFilesChanged ? "expected" : "suspicious", before, after, `${field.replaceAll("-", " ")} changed${sourceFilesChanged ? " with the source package" : " while source hashes were unchanged"}.`));
}

function sameExecutionVersions(left: AnalysisManifest, right: AnalysisManifest) {
  return left.applicationRevision === right.applicationRevision
    && left.modelName === right.modelName
    && left.verifierModel === right.verifierModel
    && left.promptVersion === right.promptVersion
    && left.parserVersion === right.parserVersion
    && left.canonicalizationSchemaVersion === right.canonicalizationSchemaVersion;
}

function hasUsableSource(source: { sourceName: string; locator: string; excerpt: string }) {
  return Boolean(source?.sourceName?.trim() && source?.locator?.trim() && source?.excerpt?.trim() && !/^(?:unknown|not found|not stated|information required)$/i.test(source.locator.trim()));
}

function byJson(left: unknown, right: unknown) { return stableJson(left).localeCompare(stableJson(right)); }
function stableJson(value: unknown) { return JSON.stringify(sortValue(value)); }
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortValue(item)]));
  return value;
}
function firstNumber(value: string) { return Number(value.match(/-?\d+(?:\.\d+)?/)?.[0]); }
function sameNumber(left: number, right: number) { return Math.abs(left - right) < 0.05; }
function sameMoney(left: number, right: number) { return Math.abs(left - right) < 0.005; }
function money(value: number) { return Math.round(value * 100) / 100; }
function currency(value: number) { return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
