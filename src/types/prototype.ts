export type SourceRole =
  | "awardAgreement"
  | "approvedBudget"
  | "ledgerExport"
  | "funderTemplate"
  | "programUpdate"
  | "supportingEvidence";

export interface CompilerFile {
  role: SourceRole;
  name: string;
  mimeType: string;
  size: number;
  data: string;
}

export interface CompilationRequest {
  organizationName: string;
  grantName: string;
  reportingPeriod: string;
  files: CompilerFile[];
  setupDecisions?: SetupDecision[];
}

export interface SavedReportSummary {
  id: string;
  organizationName: string;
  grantName: string;
  reportingPeriod: string;
  status: "review_required" | "ready";
  evidenceCoveragePercent: number;
  unresolvedItems: number;
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedCompilationResponse {
  reportId: string;
  report: SavedReportSummary;
  result: CompilationResult;
}

export type ReviewState = "verified" | "review" | "blocked" | "not_evaluated";

export interface SourceReference {
  sourceName: string;
  locator: string;
  excerpt: string;
}

export interface GrantProfileField {
  value: string;
  confidence: number;
  source: SourceReference;
  status: ReviewState;
}

export interface GrantProfile {
  funderName: GrantProfileField;
  grantName: GrantProfileField;
  grantId: GrantProfileField;
  grantStartDate: GrantProfileField;
  grantEndDate: GrantProfileField;
  grantType: GrantProfileField;
  awardAmount?: GrantProfileField;
}

export interface SetupConflict {
  id: string;
  type: "grant_identity" | "reporting_period";
  title: string;
  detail: string;
  enteredValue: string;
  sourceValue: string;
  source: SourceReference;
  status: "action_required";
  suggestedValue?: string;
  suggestedPeriodId?: string;
  suggestedLabel?: string;
  suggestedDueDate?: string;
}

export interface GrantReportingPeriod {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  dueDate: string;
  source: SourceReference;
  confidence: number;
  status: ReviewState;
}

export type WorkflowOwner = "Finance" | "Program" | "Grants" | "Approver";
export type ObligationApplicability = "required_now" | "conditional" | "future" | "not_applicable";

export interface GrantWorkflowObligation {
  id: string;
  title: string;
  detail: string;
  owner: WorkflowOwner;
  applicability: ObligationApplicability;
  trigger: string;
  source: SourceReference;
  confidence: number;
  status: ReviewState;
}

export interface SetupDecision {
  at: string;
  action: "agreement_details_applied" | "reporting_period_applied" | "agreement_workflow_applied";
  detail: string;
  sourceName: string;
  previousGrantName?: string;
  previousReportingPeriod?: string;
  selectedObligationId?: string;
}

export interface ReportInputStatus {
  role: SourceRole;
  label: string;
  available: boolean;
  core: boolean;
  requiredForCompletion: boolean;
  detail: string;
  actionLabel: string;
}

export interface WorkflowSummary {
  readiness: "not_ready" | "needs_review" | "ready_for_review";
  actionRequiredCount: number;
  needsReviewCount: number;
  missingInputCount: number;
}

export interface CompilationPreflightRequest {
  organizationName: string;
  grantName: string;
  reportingPeriod: string;
  file: CompilerFile;
}

export interface CompilationPreflightResult {
  grantProfile: GrantProfile;
  reportingPeriods: GrantReportingPeriod[];
  referencePeriodId: string;
  workflowObligations: GrantWorkflowObligation[];
  setupConflicts: SetupConflict[];
}

export interface CompiledRequirement {
  id: string;
  requirement: string;
  source: SourceReference;
  confidence: number;
  status: ReviewState;
}

export interface CompiledMapping {
  transactionId: string;
  date: string;
  description: string;
  amount: number;
  suggestedCategory: string;
  confidence: number;
  rationale: string;
  status: ReviewState;
  reviewReason?: "exact_budget_match" | "ambiguous" | "duplicate" | "outside_grant_period" | "outside_report_period";
  requiresHumanAction?: boolean;
}

export interface BudgetVarianceResult {
  category: string;
  approvedAmount: number;
  actualAmount: number;
  varianceAmount: number;
  explanationThreshold: number | null;
  explanationRequired: boolean;
  status: "within_budget" | "explanation_required";
  transactionIds: string[];
}

export interface FinancialControlResult {
  id: string;
  title: string;
  detail: string;
  status: "passed" | "review" | "blocked" | "not_evaluated";
  requiresAction: boolean;
  transactionIds: string[];
}

export interface FinancialAnalysis {
  ledgerTransactionCount: number;
  mappedTransactionCount: number;
  excludedTransactionCount: number;
  mappedActualTotal: number;
  budgetVariances: BudgetVarianceResult[];
  controls: FinancialControlResult[];
}

export interface MissingInput {
  id: string;
  question: string;
  assignedRole: string;
  reason: string;
  status: "open" | "answered";
}

export interface NarrativeStatement {
  id: string;
  text: string;
  evidenceType: "source_fact" | "calculation" | "program_response" | "needs_confirmation" | "unsupported";
  source: SourceReference;
  status: ReviewState;
}

export interface QualityCheck {
  id: string;
  label: string;
  detail: string;
  required: boolean;
  status: "passed" | "review" | "blocked" | "not_evaluated";
}

export interface ValidationFinding {
  id: string;
  itemId: string;
  verdict: "source_matched" | "review" | "blocked";
  reason: string;
  source: SourceReference;
}

export interface ValidationSummary {
  evidenceCoveragePercent: number;
  sourceMatchedItems: number;
  itemsNeedingReview: number;
  blockedItems: number;
  method: string;
  findings: ValidationFinding[];
}

export interface CompilationResult {
  reportTitle: string;
  summary: string;
  grantProfile: GrantProfile;
  setupConflicts: SetupConflict[];
  inputStatus: ReportInputStatus[];
  workflow: WorkflowSummary;
  requirements: CompiledRequirement[];
  mappings: CompiledMapping[];
  missingInputs: MissingInput[];
  narrative: NarrativeStatement[];
  qualityChecks: QualityCheck[];
  validation: ValidationSummary;
  warnings: string[];
  financialAnalysis?: FinancialAnalysis;
  generatedAt: string;
  model: string;
}

export type ReadinessSourceRole = "awardAgreement" | "reportingRequirements" | "approvedBudget";

export interface ReadinessFile {
  role: ReadinessSourceRole;
  name: string;
  mimeType: string;
  size: number;
  data: string;
}

export interface ReadinessRequest {
  organizationName: string;
  grantName: string;
  files: ReadinessFile[];
}

export interface ReadinessItem {
  id: string;
  label: string;
  detail: string;
  source: SourceReference;
  confidence: number;
  status: ReviewState;
}

export interface ReadinessGap {
  id: string;
  item: string;
  reason: string;
  suggestedOwner: string;
  status: "open" | "confirmed";
}

export interface ReadinessResult {
  title: string;
  summary: string;
  nextDeadline: { date: string; label: string; source: SourceReference; status: ReviewState };
  obligations: ReadinessItem[];
  financialRequirements: ReadinessItem[];
  programMetrics: ReadinessItem[];
  evidenceGaps: ReadinessGap[];
  validation: ValidationSummary;
  warnings: string[];
  generatedAt: string;
  model: string;
}
