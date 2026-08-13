import { createHash } from "node:crypto";
import type { CompilationResult } from "../src/types/prototype.ts";
import type {
  AnalysisDriftEvent,
  AnalysisManifest,
  FailureDomain,
  LastKnownGoodRelease,
  RecoveryActionType,
  ReliabilityAssertion,
  ReliabilityCanaryResult,
  ReliabilityDiagnosis,
  ReliabilityIncident
} from "../src/types/reliability.ts";
import {
  applicationEnvironment,
  CANONICALIZATION_SCHEMA_VERSION,
  RELIABILITY_EVALUATION_VERSION,
  REPORT_PROMPT_VERSION
} from "./analysisVersions.ts";

export const MAX_AUTOMATIC_RECOVERY_ATTEMPTS = 3;

export interface DiagnosisContext {
  assertions: ReliabilityAssertion[];
  manifest?: AnalysisManifest;
  driftEvents?: AnalysisDriftEvent[];
  dependencyHealth?: { status: string; firestore?: string; storage?: string; errorCategory?: string };
  error?: unknown;
  reportIds?: string[];
}

export interface RecoveryHandlers {
  boundedRetry?: () => Promise<void>;
  requeueIdempotentJob?: () => Promise<void>;
  rebuildDerivedState?: () => Promise<void>;
  invalidateDerivedCache?: () => Promise<void>;
  rerunEvidenceReconciliation?: () => Promise<void>;
  rerunCanary?: () => Promise<void>;
  restoreLastKnownGoodConfig?: () => Promise<void>;
  routeToLastKnownGoodRevision?: () => Promise<void>;
  currentCanonicalHash?: () => Promise<string | undefined>;
  verify: () => Promise<{ passed: boolean; canonicalHash?: string; detail: string }>;
  retryDelayMs?: number;
}

export function diagnoseReliabilityFailure(context: DiagnosisContext): ReliabilityDiagnosis {
  const failed = context.assertions.filter((item) => item.status === "failed");
  const primary = failed.find((item) => item.severity === "critical") || failed[0];
  const component = probableComponent(primary, context);
  const action = recommendedAction(component, context);
  const detectedAt = new Date().toISOString();
  const incidentId = `incident_${createHash("sha256").update(`${detectedAt}\0${primary?.id || context.error || "unknown"}\0${context.manifest?.deploymentRevision || "unknown"}`).digest("hex").slice(0, 24)}`;
  return {
    incidentId,
    severity: primary?.severity === "warning" ? "warning" : "critical",
    detectedAt,
    environment: context.manifest?.environment || applicationEnvironment(),
    failureType: primary?.id || context.dependencyHealth?.errorCategory || (context.error instanceof Error ? context.error.name : "unknown_failure"),
    probableComponent: component,
    confidence: diagnosisConfidence(component, primary, context),
    expectedState: primary?.expected ?? "all critical reliability assertions pass",
    observedState: primary?.actual ?? primary?.detail ?? (context.error instanceof Error ? context.error.message : "health execution did not complete"),
    relevantVersions: {
      applicationRevision: context.manifest?.applicationRevision || "unknown",
      deploymentRevision: context.manifest?.deploymentRevision || "unknown",
      primaryModel: context.manifest?.modelName || "unknown",
      verifierModel: context.manifest?.verifierModel || "unknown",
      promptVersion: context.manifest?.promptVersion || REPORT_PROMPT_VERSION,
      canonicalizationSchemaVersion: context.manifest?.canonicalizationSchemaVersion || CANONICALIZATION_SCHEMA_VERSION,
      parserVersion: context.manifest?.parserVersion || "unknown"
    },
    candidateRootCauses: rootCauseCandidates(component, context),
    recommendedRecoveryAction: action,
    automaticRecoveryAllowed: automaticRecoveryAllowed(action, context)
  };
}

export function createReliabilityIncident(diagnosis: ReliabilityDiagnosis, reportIds: string[] = []): ReliabilityIncident {
  return {
    incidentId: diagnosis.incidentId,
    lifecycle: "diagnosing",
    severity: diagnosis.severity,
    detectedAt: diagnosis.detectedAt,
    updatedAt: diagnosis.detectedAt,
    environment: diagnosis.environment,
    diagnosis,
    recoveryAttempts: [],
    maxAutomaticAttempts: MAX_AUTOMATIC_RECOVERY_ATTEMPTS,
    finalStatus: "open",
    affectedRevision: diagnosis.relevantVersions.deploymentRevision,
    affectedModel: diagnosis.relevantVersions.primaryModel,
    affectedReportIds: reportIds
  };
}

export async function attemptAutomaticRecovery(incident: ReliabilityIncident, handlers: RecoveryHandlers): Promise<ReliabilityIncident> {
  if (!incident.diagnosis.automaticRecoveryAllowed || incident.diagnosis.recommendedRecoveryAction === "none") return {
    ...incident,
    lifecycle: "escalated",
    finalStatus: "escalated",
    updatedAt: new Date().toISOString()
  };
  if (incident.recoveryAttempts.length >= incident.maxAutomaticAttempts) return {
    ...incident,
    lifecycle: "escalated",
    finalStatus: "escalated",
    updatedAt: new Date().toISOString()
  };
  const action = incident.diagnosis.recommendedRecoveryAction;
  const execute = recoveryHandler(action, handlers);
  if (!execute) return { ...incident, lifecycle: "escalated", finalStatus: "escalated", updatedAt: new Date().toISOString() };
  const startedAt = new Date().toISOString();
  const attempt = incident.recoveryAttempts.length + 1;
  const beforeHash = handlers.currentCanonicalHash
    ? await handlers.currentCanonicalHash()
    : incident.recoveryAttempts.at(-1)?.afterCanonicalHash;
  try {
    if (action === "bounded_retry") await boundedExecute(execute, incident.maxAutomaticAttempts, handlers.retryDelayMs ?? 500);
    else await execute();
    const verification = await handlers.verify();
    const completedAt = new Date().toISOString();
    const recoveryAttempt = {
      attempt,
      startedAt,
      completedAt,
      action,
      beforeCanonicalHash: beforeHash,
      afterCanonicalHash: verification.canonicalHash,
      status: verification.passed ? "succeeded" as const : "failed" as const,
      verificationResult: verification.passed ? "passed" as const : "failed" as const,
      detail: verification.detail
    };
    const attempts = [...incident.recoveryAttempts, recoveryAttempt];
    if (verification.passed) return {
      ...incident,
      lifecycle: "resolved",
      finalStatus: "resolved",
      updatedAt: completedAt,
      recoveryAttempts: attempts,
      lastRecoveryAction: action
    };
    return {
      ...incident,
      lifecycle: attempts.length >= incident.maxAutomaticAttempts ? "escalated" : "diagnosing",
      finalStatus: attempts.length >= incident.maxAutomaticAttempts ? "escalated" : "open",
      updatedAt: completedAt,
      recoveryAttempts: attempts,
      lastRecoveryAction: action
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const attempts = [...incident.recoveryAttempts, {
      attempt,
      startedAt,
      completedAt,
      action,
      beforeCanonicalHash: beforeHash,
      status: "failed" as const,
      verificationResult: "unknown" as const,
      detail: error instanceof Error ? error.message : "Recovery failed without diagnostic detail."
    }];
    return {
      ...incident,
      lifecycle: attempts.length >= incident.maxAutomaticAttempts ? "escalated" : "diagnosing",
      finalStatus: attempts.length >= incident.maxAutomaticAttempts ? "escalated" : "open",
      updatedAt: completedAt,
      recoveryAttempts: attempts,
      lastRecoveryAction: action
    };
  }
}

export function validatedConfigurationDecision(candidate: ReliabilityCanaryResult, lastKnownGood: LastKnownGoodRelease | null) {
  const accepted = qualifiesAsLastKnownGood(candidate);
  return {
    accepted,
    active: accepted ? lastKnownGoodFromCanary(candidate) : lastKnownGood,
    reason: accepted
      ? "The model, prompt, schema, and release passed every required reliability gate."
      : "The candidate configuration failed a required gate; the previously validated configuration remains active."
  };
}

export function assertSafeDerivedRecovery(before: CompilationResult, after: CompilationResult) {
  const beforeMappings = new Map(before.mappings.map((item) => [mappingKey(item), item]));
  for (const mapping of after.mappings) {
    const prior = beforeMappings.get(mappingKey(mapping));
    if (!prior) throw new Error("Derived recovery may not add, remove, or replace uploaded ledger rows.");
    if (prior.amount !== mapping.amount || prior.date !== mapping.date || prior.description !== mapping.description) throw new Error("Derived recovery may not alter accounting facts.");
    if ((prior.reportTreatment === "needs_category_review" || prior.mappingConfidence === "unmapped")
      && mapping.reportTreatment !== "needs_category_review" && mapping.mappingConfidence !== "unmapped") throw new Error("Derived recovery may not auto-categorize an ambiguous transaction.");
  }
  if (beforeMappings.size !== after.mappings.length) throw new Error("Derived recovery may not change the ledger population.");
  const beforeEvidence = new Set((before.evidenceFiles || []).map((file) => `${file.name}:${file.size}`));
  const afterEvidence = new Set((after.evidenceFiles || []).map((file) => `${file.name}:${file.size}`));
  if (!sameSet(beforeEvidence, afterEvidence)) throw new Error("Derived recovery may not add, remove, or replace supporting evidence.");
  const beforeApprovals = unresolvedApprovalIds(before);
  const afterApprovals = unresolvedApprovalIds(after);
  if ([...beforeApprovals].some((id) => !afterApprovals.has(id))) throw new Error("Derived recovery may not satisfy an approval without new approval evidence.");
  return true;
}

export function lastKnownGoodFromCanary(result: ReliabilityCanaryResult): LastKnownGoodRelease | null {
  if (!qualifiesAsLastKnownGood(result)) return null;
  return {
    recordedAt: result.completedAt,
    environment: result.environment,
    applicationRevision: result.applicationRevision,
    deploymentRevision: result.deploymentRevision,
    primaryModel: process.env.OPENAI_MODEL?.trim() || "gpt-5.6-terra",
    verifierModel: process.env.OPENAI_VERIFIER_MODEL?.trim() || "gpt-5.6-luna",
    promptVersion: REPORT_PROMPT_VERSION,
    canonicalizationSchemaVersion: CANONICALIZATION_SCHEMA_VERSION,
    evaluationVersion: RELIABILITY_EVALUATION_VERSION,
    canaryRunId: result.runId,
    canonicalBusinessStateHash: result.canonicalBusinessStateHash || ""
  };
}

export function qualifiesAsLastKnownGood(result: ReliabilityCanaryResult) {
  return result.status === "healthy"
    && result.failingAssertionIds.length === 0
    && result.scorecard.financialDeterministicAccuracy === 100
    && result.scorecard.kpiFactualAccuracy === 100
    && result.scorecard.obligationCoverage >= 95
    && result.scorecard.evidenceClassificationAccuracy >= 95
    && result.scorecard.unsupportedCriticalClaims === 0
    && result.scorecard.sameReportDeterminism === "pass"
    && result.scorecard.crossReportDeterminism === "pass"
    && result.scorecard.browserApiConsistency === "pass";
}

export function candidatePromotionDecision(candidate: ReliabilityCanaryResult, lastKnownGood: LastKnownGoodRelease | null, trafficPercent: number) {
  if (qualifiesAsLastKnownGood(candidate)) return { promote: true, rollback: false, reason: "All critical release gates passed." };
  return {
    promote: false,
    rollback: trafficPercent > 0 && Boolean(lastKnownGood),
    reason: trafficPercent > 0 && lastKnownGood
      ? `Candidate failed critical gates; route traffic to last-known-good revision ${lastKnownGood.deploymentRevision}.`
      : "Candidate failed critical gates and must not be promoted."
  };
}

function probableComponent(assertion: ReliabilityAssertion | undefined, context: DiagnosisContext): FailureDomain {
  if (context.dependencyHealth?.status === "unknown" || context.dependencyHealth?.status === "unhealthy") {
    if (context.dependencyHealth.firestore !== "reachable" || context.dependencyHealth.storage !== "reachable") return "database/storage";
    return "service/infrastructure";
  }
  if (!assertion) return context.error ? "job execution" : "unknown";
  if (/parser|parse|source-format/i.test(`${assertion.id} ${assertion.detail}`)) return "parser";
  if (/job|interrupted|queue/i.test(`${assertion.id} ${assertion.detail}`)) return "job execution";
  if (assertion.area === "financial") return "financial integrity";
  if (assertion.area === "kpi" || assertion.id.includes("canonical-narrative")) return "KPI reconciliation";
  if (assertion.area === "evidence") return "evidence reconciliation";
  if (assertion.area === "persistence") return "source binding/persistence";
  if (assertion.area === "workflow") return "action/readiness generation";
  if (assertion.id.includes("browser") || assertion.id.includes("api")) return "browser/API inconsistency";
  if (context.driftEvents?.some((event) => event.field.includes("model"))) return "model/provider";
  if (context.driftEvents?.some((event) => /prompt|schema/.test(event.field))) return "prompt/schema version";
  return assertion.area === "provenance" ? "canonicalization" : "unknown";
}

function recommendedAction(component: FailureDomain, context: DiagnosisContext): RecoveryActionType {
  if (component === "service/infrastructure" || component === "database/storage" || component === "model/provider") return "bounded_retry";
  if (component === "job execution" || component === "parser") return "requeue_idempotent_job";
  if (component === "source binding/persistence" || component === "canonicalization" || component === "financial integrity" || component === "KPI reconciliation" || component === "action/readiness generation") return "rebuild_derived_state";
  if (component === "evidence reconciliation") return "rerun_evidence_reconciliation";
  if (component === "prompt/schema version" && context.driftEvents?.length) return "restore_last_known_good_config";
  return "none";
}

function automaticRecoveryAllowed(action: RecoveryActionType, context: DiagnosisContext) {
  if (["none", "route_to_last_known_good_revision"].includes(action)) return false;
  if (context.assertions.some((item) => item.status === "failed" && /ambiguous|approval.*missing|missing.*approval/i.test(item.detail))) return false;
  return true;
}

function recoveryHandler(action: RecoveryActionType, handlers: RecoveryHandlers) {
  if (action === "bounded_retry") return handlers.boundedRetry;
  if (action === "requeue_idempotent_job") return handlers.requeueIdempotentJob;
  if (action === "rebuild_derived_state") return handlers.rebuildDerivedState;
  if (action === "invalidate_derived_cache") return handlers.invalidateDerivedCache;
  if (action === "rerun_evidence_reconciliation") return handlers.rerunEvidenceReconciliation;
  if (action === "rerun_canary") return handlers.rerunCanary;
  if (action === "restore_last_known_good_config") return handlers.restoreLastKnownGoodConfig;
  if (action === "route_to_last_known_good_revision") return handlers.routeToLastKnownGoodRevision;
  return undefined;
}

async function boundedExecute(execute: () => Promise<void>, maxAttempts: number, baseDelayMs: number) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await execute();
      return;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(baseDelayMs * (2 ** (attempt - 1)), 4_000)));
    }
  }
  throw lastError || new Error("Bounded recovery failed without diagnostic detail.");
}

function diagnosisConfidence(component: FailureDomain, assertion: ReliabilityAssertion | undefined, context: DiagnosisContext) {
  if (component === "unknown") return 0.25;
  if (context.dependencyHealth?.status === "unhealthy") return 0.95;
  if (assertion?.severity === "critical") return 0.9;
  return 0.7;
}

function rootCauseCandidates(component: FailureDomain, context: DiagnosisContext) {
  const candidates = [`Failure localized to ${component}.`];
  if (context.driftEvents?.some((event) => event.field.includes("model"))) candidates.push("Model configuration changed before the observed drift.");
  if (context.driftEvents?.some((event) => /prompt|schema/.test(event.field))) candidates.push("Prompt or canonicalization schema changed before the observed drift.");
  if (context.dependencyHealth?.status !== "healthy") candidates.push("A dependency health check did not complete successfully.");
  if (context.manifest?.sourceFiles.length === 0) candidates.push("Source manifest is unavailable or incomplete.");
  return candidates;
}

function mappingKey(item: CompilationResult["mappings"][number]) { return `${item.transactionId}\0${item.date}\0${item.amount}\0${item.description}`; }
function unresolvedApprovalIds(result: CompilationResult) {
  return new Set(result.financialAnalysis?.controls.filter((control) => /approval/i.test(`${control.id} ${control.title}`) && control.requiresAction).flatMap((control) => control.transactionIds) || []);
}
function sameSet(left: Set<string>, right: Set<string>) { return left.size === right.size && [...left].every((item) => right.has(item)); }
