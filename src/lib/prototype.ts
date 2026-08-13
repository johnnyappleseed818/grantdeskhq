import type { CompilationPreflightRequest, CompilationRequest, CompilationResult, ReadinessRequest, SourceRole } from "../types/prototype";

export const REQUIRED_SOURCE_ROLES: SourceRole[] = [
  "awardAgreement"
];

export const MAX_FILE_BYTES = 1_000_000;
export const MAX_TOTAL_BYTES = 2_500_000;
export const MAX_EVIDENCE_FILES = 50;
export const MAX_EVIDENCE_FILE_BYTES = 5_000_000;
export const MAX_EVIDENCE_TOTAL_BYTES = 15_000_000;

export interface CompilationUploadLimits {
  maxEvidenceFiles?: number;
  maxEvidenceFileBytes?: number;
  maxEvidenceTotalBytes?: number;
}

export function validateCompilationRequest(input: CompilationRequest, limits: CompilationUploadLimits = {}): string[] {
  const errors: string[] = [];
  if (!input.organizationName.trim()) errors.push("Organization name is required.");
  if (!input.grantName.trim()) errors.push("Grant name is required.");
  if (!input.reportingPeriod.trim()) errors.push("Reporting period is required.");

  for (const role of REQUIRED_SOURCE_ROLES) {
    if (!input.files.some((file) => file.role === role)) errors.push(`Missing required source: ${role}.`);
  }

  const allowedRoles = new Set<SourceRole>(["awardAgreement", "approvedBudget", "ledgerExport", "funderTemplate", "programUpdate", "supportingEvidence"]);
  if (input.files.some((file) => !allowedRoles.has(file.role))) errors.push("One or more source files have an invalid role.");
  for (const role of [...allowedRoles].filter((item) => item !== "supportingEvidence")) {
    if (input.files.filter((file) => file.role === role).length > 1) errors.push(`Only one ${role} source can be supplied.`);
  }

  const coreFiles = input.files.filter((file) => file.role !== "supportingEvidence");
  const evidenceFiles = input.files.filter((file) => file.role === "supportingEvidence");
  const maxEvidenceFiles = limits.maxEvidenceFiles ?? MAX_EVIDENCE_FILES;
  const maxEvidenceFileBytes = limits.maxEvidenceFileBytes ?? MAX_EVIDENCE_FILE_BYTES;
  const maxEvidenceTotalBytes = limits.maxEvidenceTotalBytes ?? MAX_EVIDENCE_TOTAL_BYTES;
  const actualSizes = new Map(input.files.map((file) => [file, encodedFileSize(file.data)]));
  if ([...actualSizes.values()].some((size) => size === null)) errors.push("Every source file must contain valid base64-encoded file data.");
  if (input.files.some((file) => {
    const actual = actualSizes.get(file);
    return actual !== null && actual !== undefined && Math.abs(actual - file.size) > 2;
  })) errors.push("One or more source file sizes do not match the uploaded data.");
  const totalSize = coreFiles.reduce((sum, file) => sum + (actualSizes.get(file) ?? file.size), 0);
  const evidenceTotalSize = evidenceFiles.reduce((sum, file) => sum + (actualSizes.get(file) ?? file.size), 0);
  if (totalSize > MAX_TOTAL_BYTES) errors.push("Core report files must total 2.5 MB or less.");
  if (coreFiles.some((file) => (actualSizes.get(file) ?? file.size) > MAX_FILE_BYTES)) errors.push("Each core report file must be 1 MB or less.");
  if (evidenceFiles.length > maxEvidenceFiles) errors.push(`A report can contain up to ${maxEvidenceFiles} supporting evidence files.`);
  if (evidenceFiles.some((file) => (actualSizes.get(file) ?? file.size) > maxEvidenceFileBytes)) errors.push(`Each supporting evidence file must be ${formatLimit(maxEvidenceFileBytes)} or less.`);
  if (evidenceTotalSize > maxEvidenceTotalBytes) errors.push(`Supporting evidence files must total ${formatLimit(maxEvidenceTotalBytes)} or less.`);
  const evidenceIds = evidenceFiles.flatMap((file) => file.evidenceId ? [file.evidenceId] : []);
  if (new Set(evidenceIds).size !== evidenceIds.length) errors.push("Each supporting evidence file must have a unique identifier.");
  if (input.requestId && !isValidCompilationRequestId(input.requestId)) errors.push("The report request identifier is invalid.");
  return errors;
}

export function encodedFileSize(data: string) {
  const match = data.match(/^data:[^,]*;base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match || match[1].length % 4 !== 0) return null;
  const padding = match[1].endsWith("==") ? 2 : match[1].endsWith("=") ? 1 : 0;
  return (match[1].length / 4) * 3 - padding;
}

export function isValidCompilationRequestId(value: string | undefined): value is string {
  return Boolean(value && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value));
}

export function validateCompilationPreflightRequest(input: CompilationPreflightRequest): string[] {
  const errors: string[] = [];
  if (!input.organizationName.trim()) errors.push("Organization name is required.");
  if (!input.grantName.trim()) errors.push("Grant name is required.");
  if (!input.reportingPeriod.trim()) errors.push("Reporting period is required.");
  if (input.file.role !== "awardAgreement") errors.push("An award agreement or Notice of Award is required.");
  const actualSize = encodedFileSize(input.file.data);
  if (actualSize === null) errors.push("The award document must contain valid base64-encoded file data.");
  else if (Math.abs(actualSize - input.file.size) > 2) errors.push("The award document size does not match the uploaded data.");
  if ((actualSize ?? input.file.size) > MAX_FILE_BYTES) errors.push("The award document must be 1 MB or less.");
  return errors;
}

export function validateReadinessRequest(input: ReadinessRequest): string[] {
  const errors: string[] = [];
  if (!input.organizationName.trim()) errors.push("Organization name is required.");
  if (!input.grantName.trim()) errors.push("Grant name is required.");
  if (!input.files.some((file) => file.role === "awardAgreement")) errors.push("An award agreement is required.");
  const actualSizes = input.files.map((file) => encodedFileSize(file.data));
  if (actualSizes.some((size) => size === null)) errors.push("Every source file must contain valid base64-encoded file data.");
  if (input.files.some((file, index) => actualSizes[index] !== null && Math.abs((actualSizes[index] || 0) - file.size) > 2)) errors.push("One or more source file sizes do not match the uploaded data.");
  const totalSize = input.files.reduce((sum, file, index) => sum + (actualSizes[index] ?? file.size), 0);
  if (totalSize > MAX_TOTAL_BYTES) errors.push("Combined file size must be 2.5 MB or less.");
  if (input.files.some((file, index) => (actualSizes[index] ?? file.size) > MAX_FILE_BYTES)) errors.push("Each file must be 1 MB or less.");
  return errors;
}

export function unresolvedRequiredChecks(result: CompilationResult): QualityCheckSummary {
  const required = result.qualityChecks.filter((check) => check.required);
  return {
    total: required.length,
    unresolved: required.filter((check) => check.status !== "passed" && !check.evidenceSatisfiedBy?.length).length
  };
}

export interface QualityCheckSummary {
  total: number;
  unresolved: number;
}

export function canGenerateReviewPackage(result: CompilationResult): boolean {
  return result.setupConflicts.length === 0
    && result.workflow.readiness !== "not_ready"
    && result.inputStatus.every((item) => !item.requiredForCompletion || item.available)
    && unresolvedRequiredChecks(result).unresolved === 0
    && result.validation.findings.every((finding) => finding.verdict === "source_matched" || Boolean(finding.evidenceSatisfiedBy?.length));
}

export function resultToDownload(result: CompilationResult): string {
  return JSON.stringify({
    notice: "GrantDeskHQ draft output. Professional review required.",
    ...result
  }, null, 2);
}

function formatLimit(bytes: number) {
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${Math.round(bytes / 1_000_000)} MB`;
}
