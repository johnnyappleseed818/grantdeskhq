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
}

export type ReviewState = "verified" | "review" | "blocked";

export interface SourceReference {
  sourceName: string;
  locator: string;
  excerpt: string;
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
  status: "passed" | "review" | "blocked";
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
  requirements: CompiledRequirement[];
  mappings: CompiledMapping[];
  missingInputs: MissingInput[];
  narrative: NarrativeStatement[];
  qualityChecks: QualityCheck[];
  validation: ValidationSummary;
  warnings: string[];
  generatedAt: string;
  model: string;
}
