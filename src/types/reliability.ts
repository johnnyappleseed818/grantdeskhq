export type ReliabilityHealth = "healthy" | "degraded" | "unhealthy" | "unknown";
export type ReliabilitySeverity = "critical" | "warning" | "info";
export type ReliabilityCheckStatus = "passed" | "failed" | "not_evaluated";

export interface AnalysisPerformance {
  analysisDurationMs: number;
  parserDurationMs: number;
  llmDurationMs: number;
  evidenceReconciliationDurationMs: number;
  requestedModelTokens?: number;
}

export interface MaterialClaimVerification {
  claimId: string;
  claimType: "financial_amount" | "kpi_result" | "date" | "deadline" | "target" | "variance" | "approval_status" | "participant_count" | "material_statement";
  structuredValue?: string | number;
  narrativeValue?: string | number;
  sourceIds: string[];
  status: "supported" | "mismatch" | "unsupported";
  detail: string;
}

export interface ReliabilityAssertion {
  id: string;
  area: "availability" | "financial" | "kpi" | "provenance" | "evidence" | "persistence" | "determinism" | "workflow" | "claims" | "performance";
  severity: ReliabilitySeverity;
  status: ReliabilityCheckStatus;
  detail: string;
  expected?: unknown;
  actual?: unknown;
}

export interface ReportIntegrityResult {
  status: ReliabilityHealth;
  checkedAt: string;
  assertions: ReliabilityAssertion[];
  claims: MaterialClaimVerification[];
  criticalFailureCount: number;
  warningCount: number;
  customerMessage?: string;
}

export interface AnalysisSourceManifest {
  role: string;
  name: string;
  size: number;
  sha256: string;
  relevance?: string;
  evidenceTargetIds?: string[];
}

export interface AnalysisManifest {
  analysisId: string;
  reportId: string;
  canonicalAnalysisVersion: string;
  canonicalizationSchemaVersion: string;
  applicationRevision: string;
  deploymentRevision: string;
  environment: string;
  modelName: string;
  verifierModel: string;
  promptVersion: string;
  parserVersion: string;
  evaluationVersion: string;
  sourceFiles: AnalysisSourceManifest[];
  sourceCount: number;
  evidenceFileCount: number;
  glRowCount: number;
  requirementCount: number;
  kpiCount: number;
  groupedActionCount: number;
  canonicalBusinessStateHash: string;
  reportReadinessState: string;
  blockerCount: number;
  performance: AnalysisPerformance;
  createdAt: string;
}

export interface AnalysisDriftEvent {
  id: string;
  level: "expected" | "suspicious" | "critical";
  field: string;
  before: unknown;
  after: unknown;
  detail: string;
}

export interface AnalysisComparison {
  status: ReliabilityHealth;
  identical: boolean;
  sourceFilesChanged: boolean;
  events: AnalysisDriftEvent[];
}

export interface ReliabilityScorecard {
  status: ReliabilityHealth;
  financialDeterministicAccuracy: number;
  kpiFactualAccuracy: number;
  obligationCoverage: number;
  evidenceClassificationAccuracy: number;
  evidenceAttributionAccuracy: number;
  approvalStateAccuracy: number;
  unsupportedCriticalClaims: number;
  sameReportDeterminism: "pass" | "fail" | "not_evaluated";
  crossReportDeterminism: "pass" | "fail" | "not_evaluated";
  browserApiConsistency: "pass" | "fail" | "not_evaluated";
  thresholds: {
    obligationCoverage: number;
    evidenceClassificationAccuracy: number;
    criticalFabrication: number;
  };
}

export interface CanaryDiagnosticArtifact {
  kind: "manifest" | "canonical_state" | "expected_actual_diff" | "invariants" | "actions" | "evidence" | "browser_screenshot";
  objectName: string;
}

export interface ReliabilityCanaryResult {
  runId: string;
  fixtureId: string;
  trigger: "daily" | "post_deploy" | "manual" | "test";
  environment: string;
  status: ReliabilityHealth;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  applicationRevision: string;
  deploymentRevision: string;
  reportIds: string[];
  assertions: ReliabilityAssertion[];
  scorecard: ReliabilityScorecard;
  sameReportHashes: string[];
  crossReportHashes: string[];
  canonicalBusinessStateHash?: string;
  analysisPerformance?: AnalysisPerformance;
  failingAssertionIds: string[];
  cleanup: { reportsDeleted: number; identityDeleted: boolean; errors: string[] };
  artifacts: CanaryDiagnosticArtifact[];
  errorCategory?: string;
  /** Bounded, secret-safe operational detail when the canary cannot complete. */
  errorDetail?: string;
}

export interface ReliabilityDashboardSnapshot {
  environment: string;
  applicationRevision: string;
  deploymentRevision: string;
  overallHealth: ReliabilityHealth;
  latestCanary: ReliabilityCanaryResult | null;
  lastSuccessfulCanary: string | null;
  recentDriftEvents: AnalysisDriftEvent[];
  recentDeployments: string[];
  activeIncidents: ReliabilityIncident[];
  escalatedIncidents: ReliabilityIncident[];
  lastKnownGood: LastKnownGoodRelease | null;
}

export type IncidentLifecycle = "detected" | "diagnosing" | "recovering" | "verifying" | "resolved" | "escalated" | "unknown";
export type FailureDomain =
  | "service/infrastructure"
  | "database/storage"
  | "job execution"
  | "source binding/persistence"
  | "parser"
  | "model/provider"
  | "prompt/schema version"
  | "canonicalization"
  | "financial integrity"
  | "KPI reconciliation"
  | "evidence reconciliation"
  | "action/readiness generation"
  | "browser/API inconsistency"
  | "unknown";

export type RecoveryActionType =
  | "bounded_retry"
  | "requeue_idempotent_job"
  | "rebuild_derived_state"
  | "invalidate_derived_cache"
  | "rerun_evidence_reconciliation"
  | "rerun_canary"
  | "restore_last_known_good_config"
  | "route_to_last_known_good_revision"
  | "none";

export interface ReliabilityDiagnosis {
  incidentId: string;
  severity: "critical" | "warning";
  detectedAt: string;
  environment: string;
  failureType: string;
  probableComponent: FailureDomain;
  confidence: number;
  expectedState: unknown;
  observedState: unknown;
  relevantVersions: Record<string, string>;
  candidateRootCauses: string[];
  recommendedRecoveryAction: RecoveryActionType;
  automaticRecoveryAllowed: boolean;
}

export interface RecoveryAttempt {
  attempt: number;
  startedAt: string;
  completedAt: string;
  action: RecoveryActionType;
  beforeCanonicalHash?: string;
  afterCanonicalHash?: string;
  status: "succeeded" | "failed" | "not_attempted";
  verificationResult: "passed" | "failed" | "unknown";
  detail: string;
}

export interface ReliabilityIncident {
  incidentId: string;
  lifecycle: IncidentLifecycle;
  severity: "critical" | "warning";
  detectedAt: string;
  updatedAt: string;
  environment: string;
  diagnosis: ReliabilityDiagnosis;
  recoveryAttempts: RecoveryAttempt[];
  maxAutomaticAttempts: number;
  finalStatus: "open" | "resolved" | "escalated" | "unknown";
  affectedRevision?: string;
  affectedModel?: string;
  affectedReportIds: string[];
  lastRecoveryAction?: RecoveryActionType;
  rollback?: {
    failedRevision: string;
    lastKnownGoodRevision: string;
    reason: string;
    rollbackAt: string;
    postRollbackCanaryStatus: ReliabilityHealth;
  };
}

export interface LastKnownGoodRelease {
  recordedAt: string;
  environment: string;
  applicationRevision: string;
  deploymentRevision: string;
  primaryModel: string;
  verifierModel: string;
  promptVersion: string;
  canonicalizationSchemaVersion: string;
  evaluationVersion: string;
  canaryRunId: string;
  canonicalBusinessStateHash: string;
}
