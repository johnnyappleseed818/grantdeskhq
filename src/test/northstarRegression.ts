// @vitest-environment node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProgramInsights, buildProgramReadiness } from "../lib/programInsights";
import { buildReportAttention } from "../lib/reportAttention";
import type {
  CompilationRequest,
  CompilationResult,
  CompilerFile,
  PersistedCompilationResponse,
  SourceRole
} from "../types/prototype";

export const NORTHSTAR_FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../tests/fixtures/northstar-interim1"
);

export const NORTHSTAR_CORE_FILES = [
  { name: "GrantDeskHQ_Synthetic_Grant_Agreement_Test_2.docx", role: "awardAgreement" as const },
  { name: "GrantDeskHQ_Synthetic_GL_Interim_Report_1.xlsx", role: "ledgerExport" as const },
  { name: "GrantDeskHQ_Synthetic_Program_Update_Interim_Report_1.docx", role: "programUpdate" as const }
];

export const NORTHSTAR_EVIDENCE_FILES = [
  "01_Enrollment_Records_Interim1.xlsx",
  "02_Assessment_Records_Interim1.xlsx",
  "03_Housing_Placement_and_120_Day_Followup_Interim1.xlsx",
  "04_Benefits_Screening_Records_Interim1.xlsx",
  "05_Client_Satisfaction_Survey_Interim1.xlsx",
  "06_Emergency_Assistance_Support_Interim1.xlsx",
  "07_PD_Approval_BW-EA-003.pdf",
  "08_PD_Approval_BW-EA-006.pdf",
  "09_Irrelevant_Board_Meeting_Notes.pdf"
];

export interface PersistedSourceView {
  role: SourceRole;
  name: string;
  mimeType: string;
  size: number;
  evidenceId?: string;
  uploadedAt?: string;
  parsingStatus?: string;
  relevance?: string;
  evidenceMatches?: unknown[];
}

export type RegressionApiResponse = Omit<PersistedCompilationResponse, "sources"> & { sources?: PersistedSourceView[] };

export function northstarRequest(requestId: string): CompilationRequest {
  return {
    organizationName: "BridgeWorks Family Services",
    grantName: "Northstar Community Fund — Family Stability & Housing Navigation Program",
    reportingPeriod: "February 1 – July 31, 2027",
    requestId,
    files: NORTHSTAR_CORE_FILES.map((file) => fixtureCompilerFile(file.name, file.role))
  };
}

export function northstarEvidenceFiles(): CompilerFile[] {
  return NORTHSTAR_EVIDENCE_FILES.map((name, index) => ({
    ...fixtureCompilerFile(name, "supportingEvidence"),
    evidenceId: `evidence_northstar_${String(index + 1).padStart(2, "0")}`,
    uploadedAt: "2027-08-01T12:00:00.000Z"
  }));
}

export function fixtureCompilerFile(name: string, role: SourceRole): CompilerFile {
  const file = fs.readFileSync(path.join(NORTHSTAR_FIXTURE_DIR, name));
  const mimeType = mimeFor(name);
  return { role, name, mimeType, size: file.byteLength, data: `data:${mimeType};base64,${file.toString("base64")}` };
}

export function fixtureDigest(name: string) {
  return createHash("sha256").update(fs.readFileSync(path.join(NORTHSTAR_FIXTURE_DIR, name))).digest("hex");
}

export function normalizedBusinessState(response: RegressionApiResponse) {
  const { result } = response;
  const evidenceNameById = new Map((result.evidenceFiles || []).map((file) => [file.id, file.name]));
  const insights = buildProgramInsights(result);
  const readiness = buildProgramReadiness(result);
  const mappings = result.mappings.map((mapping) => ({
    transactionId: mapping.transactionId,
    amount: mapping.amount,
    category: mapping.suggestedCategory,
    mappingConfidence: mapping.mappingConfidence || null,
    complianceStatus: mapping.complianceStatus || null,
    reportTreatment: mapping.reportTreatment || null,
    evidenceRequirementStatus: mapping.evidenceRequirementStatus || null
  }));
  const categoryActuals = Object.fromEntries([
    ...new Set(result.financialAnalysis?.budgetVariances.map((item) => item.category) || [])
  ].sort().map((category) => [category, result.financialAnalysis?.budgetVariances.find((item) => item.category === category)?.actualAmount]));
  return {
    reportSources: {
      persisted: (response.sources || []).map((source) => ({
        role: source.role,
        name: source.name,
        size: source.size,
        parsingStatus: source.parsingStatus || null,
        relevance: source.relevance || null,
        evidenceMatchTargets: (source.evidenceMatches || []).map((match) => isRecord(match) ? String(match.targetId || "") : "").filter(Boolean).sort()
      })).sort((left, right) => `${left.role}:${left.name}`.localeCompare(`${right.role}:${right.name}`)),
      inputs: result.inputStatus.map((input) => ({ role: input.role, available: input.available, core: input.core, requiredForCompletion: input.requiredForCompletion })).sort((left, right) => left.role.localeCompare(right.role)),
      evidenceCount: result.evidenceFiles?.length || 0
    },
    requirements: result.requirements.map((item) => ({
      id: item.id,
      canonicalType: item.canonicalType || null,
      canonicalSubject: item.canonicalSubject || null,
      applicability: item.applicability || null,
      status: item.status,
      sourceName: item.source.sourceName
    })).sort((left, right) => left.id.localeCompare(right.id)),
    financialAnalysis: {
      ledgerTransactionCount: result.financialAnalysis?.ledgerTransactionCount || 0,
      mappedTransactionCount: result.financialAnalysis?.mappedTransactionCount || 0,
      excludedTransactionCount: result.financialAnalysis?.excludedTransactionCount || 0,
      mappedActualTotal: result.financialAnalysis?.mappedActualTotal || 0,
      categoryActuals,
      mappings,
      variances: (result.financialAnalysis?.budgetVariances || []).map((item) => ({
        category: item.category,
        approvedAmount: item.approvedAmount,
        actualAmount: item.actualAmount,
        varianceAmount: item.varianceAmount,
        variancePercent: item.variancePercent,
        explanationThreshold: item.explanationThreshold,
        explanationRequired: item.explanationRequired
      })).sort((left, right) => left.category.localeCompare(right.category)),
      controls: (result.financialAnalysis?.controls || []).map((control) => ({ id: control.id, status: control.status, requiresAction: control.requiresAction, transactionIds: [...control.transactionIds].sort(), detail: normalizeText(control.detail) })).sort((left, right) => left.id.localeCompare(right.id))
    },
    kpis: {
      readiness,
      insights: insights.filter((item) => ["households-served", "housing-assessments", "housing-placements", "housing-retention", "benefits-screenings", "client-satisfaction", "satisfaction-unconfirmed"].includes(item.id)).map((item) => ({ id: item.id, status: item.status, value: item.value, sources: item.sources.map((source) => source.sourceName).sort() })).sort((left, right) => left.id.localeCompare(right.id))
    },
    evidenceMatches: (result.evidenceFiles || []).map((file) => ({
      name: file.name,
      parsingStatus: file.parsingStatus,
      relevance: file.relevance,
      matches: file.matches.map((match) => ({ targetType: match.targetType, targetId: match.targetId, status: match.status })).sort((left, right) => left.targetId.localeCompare(right.targetId))
    })).sort((left, right) => left.name.localeCompare(right.name)),
    canonicalProgramState: (result.programChecks || []).map((check) => ({
      id: check.id,
      type: check.type,
      severity: check.severity,
      resolution: check.resolution,
      status: check.status,
      evidenceBackedValue: check.evidenceBackedValue || null,
      evidenceSatisfiedBy: [...(check.evidenceSatisfiedBy || [])].map((id) => evidenceNameById.get(id) || id).sort()
    })).sort((left, right) => left.id.localeCompare(right.id)),
    actions: buildReportAttention(result).map((item) => ({ id: item.id, kind: item.kind })).sort((left, right) => left.id.localeCompare(right.id)),
    reportReadiness: {
      readiness: result.workflow.readiness,
      actionRequiredCount: result.workflow.actionRequiredCount,
      needsReviewCount: result.workflow.needsReviewCount,
      missingInputCount: result.workflow.missingInputCount,
      evidenceCoveragePercent: result.validation.evidenceCoveragePercent,
      sourceMatchedItems: result.validation.sourceMatchedItems,
      itemsNeedingReview: result.validation.itemsNeedingReview,
      blockedItems: result.validation.blockedItems
    }
  };
}

export function splitStructuredSnapshots(response: RegressionApiResponse) {
  const state = normalizedBusinessState(response);
  return {
    "reportSources.json": state.reportSources,
    "requirements.json": state.requirements,
    "financialAnalysis.json": state.financialAnalysis,
    "kpis.json": state.kpis,
    "evidenceMatches.json": state.evidenceMatches,
    "canonicalProgramState.json": state.canonicalProgramState,
    "actions.json": state.actions,
    "integrity.json": integrityDiagnostic(response.result),
    "reportReadiness.json": state.reportReadiness
  };
}

function integrityDiagnostic(result: CompilationResult) {
  return {
    status: result.integrity?.status || null,
    criticalFailureCount: result.integrity?.criticalFailureCount || 0,
    warningCount: result.integrity?.warningCount || 0,
    assertions: (result.integrity?.assertions || []).map((assertion) => ({
      id: assertion.id,
      area: assertion.area,
      severity: assertion.severity,
      status: assertion.status,
      detail: normalizeText(assertion.detail)
    })).sort((left, right) => left.id.localeCompare(right.id)),
    unresolvedQualityChecks: result.qualityChecks.filter((check) => check.required && ["blocked", "review"].includes(check.status)).map((check) => ({
      id: check.id,
      status: check.status,
      detail: normalizeText(check.detail)
    })).sort((left, right) => left.id.localeCompare(right.id))
  };
}

function mimeFor(name: string) {
  if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".csv")) return "text/csv";
  throw new Error(`No fixture MIME type is configured for ${name}.`);
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
