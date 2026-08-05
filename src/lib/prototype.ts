import type { CompilationRequest, CompilationResult, SourceRole } from "../types/prototype";

export const REQUIRED_SOURCE_ROLES: SourceRole[] = [
  "awardAgreement",
  "approvedBudget",
  "ledgerExport",
  "funderTemplate",
  "programUpdate"
];

export const MAX_FILE_BYTES = 1_000_000;
export const MAX_TOTAL_BYTES = 2_500_000;

export function validateCompilationRequest(input: CompilationRequest): string[] {
  const errors: string[] = [];
  if (!input.organizationName.trim()) errors.push("Organization name is required.");
  if (!input.grantName.trim()) errors.push("Grant name is required.");
  if (!input.reportingPeriod.trim()) errors.push("Reporting period is required.");

  for (const role of REQUIRED_SOURCE_ROLES) {
    if (!input.files.some((file) => file.role === role)) errors.push(`Missing required source: ${role}.`);
  }

  const totalSize = input.files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_TOTAL_BYTES) errors.push("Combined file size must be 2.5 MB or less for this prototype.");
  if (input.files.some((file) => file.size > MAX_FILE_BYTES)) errors.push("Each file must be 1 MB or less for this prototype.");
  if (input.files.some((file) => !file.data.startsWith("data:"))) errors.push("Every source file must contain valid encoded file data.");
  return errors;
}

export function unresolvedRequiredChecks(result: CompilationResult): QualityCheckSummary {
  const required = result.qualityChecks.filter((check) => check.required);
  return {
    total: required.length,
    unresolved: required.filter((check) => check.status !== "passed").length
  };
}

export interface QualityCheckSummary {
  total: number;
  unresolved: number;
}

export function canGenerateReviewPackage(result: CompilationResult): boolean {
  return unresolvedRequiredChecks(result).unresolved === 0
    && result.validation.findings.every((finding) => finding.verdict === "source_matched");
}

export function resultToDownload(result: CompilationResult): string {
  return JSON.stringify({
    notice: "GrantDeskHQ prototype output. Professional review required.",
    ...result
  }, null, 2);
}
