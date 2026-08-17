import { createHash, randomUUID } from "node:crypto";
import { canGenerateReviewPackage, encodedFileSize, isValidCompilationRequestId, MAX_EVIDENCE_FILE_BYTES, MAX_EVIDENCE_FILES, MAX_EVIDENCE_TOTAL_BYTES } from "../src/lib/prototype.ts";
import type { CompilationRequest, CompilationResult, CompilerFile, PersistedCompilationResponse, PersistedReportSource, SavedReportSummary, SupportingEvidenceFile } from "../src/types/prototype.ts";
import type { AwardDiscoveryScan, DailySocialScan } from "../src/lib/gtm.ts";
import type { ShadowPipelineStatus } from "../src/lib/gtmShadow.ts";
import type { ControlPlaneQueueReconciliation } from "../src/lib/gtmControlPlaneQueue.ts";
import type { ContactEnrichmentRecord, EnrichmentUsage, SuppressionCheck } from "../src/lib/contactEnrichment.ts";
import type { AuthenticatedUser } from "./auth.ts";
import { normalizeAttribution, type Attribution, type BillingEventSnapshot } from "./billing.ts";
import { subscriptionIsEntitled } from "../src/content/pricing.ts";
import { analyzeSupportingEvidence, applyEvidenceMatches, buildEvidenceTargets, normalizeSupportingEvidenceFiles } from "./evidenceReconciliation.ts";
import { applyDeterministicAccuracyChecks } from "./accuracy.ts";
import { normalizeCompilationSources } from "./sourceNormalization.ts";
import { applyWorkflowState, normalizeExplicitRequirementStatuses } from "./workflowState.ts";
import { buildReportAttention } from "../src/lib/reportAttention.ts";
import { canonicalizeRequirements } from "./reportCompiler.ts";
import { CANONICAL_ANALYSIS_VERSION, CANONICALIZATION_SCHEMA_VERSION, REPORT_PROMPT_VERSION, SOURCE_PARSER_VERSION } from "./analysisVersions.ts";
import { applyRuntimeIntegrity, buildAnalysisManifest, compareAnalysisManifests } from "./reliability.ts";
import type { AnalysisManifest, AnalysisSourceManifest } from "../src/types/reliability.ts";
import type { AnalysisDriftEvent, LastKnownGoodRelease, ReliabilityCanaryResult, ReliabilityDashboardSnapshot, ReliabilityIncident } from "../src/types/reliability.ts";
import { applicationEnvironment, applicationRevision, deploymentRevision } from "./analysisVersions.ts";

const projectId = process.env.GOOGLE_CLOUD_PROJECT || "grantdeskhq-proto-ek-2026";
const bucket = process.env.REPORT_FILES_BUCKET || "grantdeskhq-proto-ek-2026-report-files";
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
export const COMPILATION_VERSION = CANONICAL_ANALYSIS_VERSION;
let tokenCache: { token: string; expiresAt: number } | null = null;

export async function saveCompilation(user: AuthenticatedUser, request: CompilationRequest, result: CompilationResult) {
  const now = new Date().toISOString();
  const organizationId = `org_${user.uid}`;
  const reportId = compilationReportId(user.uid, request.requestId);
  const accessToken = await gcpToken();
  const sources = await Promise.all(request.files.map(async (file) => {
    const evidenceId = file.role === "supportingEvidence" ? safeEvidenceId(file.evidenceId || `evidence_${randomUUID().replaceAll("-", "")}`) : undefined;
    const evidenceSuffix = evidenceId ? `${evidenceId}-` : "";
    const objectName = `${organizationId}/reports/${reportId}/sources/${file.role}-${evidenceSuffix}${safeName(file.name)}`;
    await uploadObject(accessToken, objectName, file);
    return { role: file.role, name: file.name, mimeType: file.mimeType, size: file.size, objectName, sha256: sourceFileHash(file), ...(evidenceId ? { evidenceId, uploadedAt: file.uploadedAt || now } : {}) };
  }));
  const finalized = finalizeReliabilityWorkflow(request, result, undefined, sources);
  const manifest = buildAnalysisManifest({ reportId, result: finalized, sources: manifestSources(sources), createdAt: now });
  const persistedResult = { ...finalized, analysisManifest: manifest };
  const summary = summarize(reportId, request, persistedResult, now, now);
  await writeDocument(accessToken, `organizations/${organizationId}`, {
    id: organizationId, ownerUid: user.uid, ownerEmail: user.email, name: request.organizationName, createdAt: now, updatedAt: now
  });
  const setupAudit = sanitizeSetupDecisions(request, user.uid);
  await writeDocument(accessToken, `organizations/${organizationId}/reports/${reportId}`, {
    ...summary,
    ownerUid: user.uid,
    requestId: request.requestId || "",
    compilationVersion: COMPILATION_VERSION,
    resultJson: JSON.stringify(persistedResult),
    coreResultJson: JSON.stringify(persistedResult),
    manifestJson: JSON.stringify(manifest),
    sourcesJson: JSON.stringify(sources),
    coreSourcesJson: JSON.stringify(sources.filter((source) => source.role !== "supportingEvidence")),
    auditJson: JSON.stringify([...setupAudit, { at: now, actorUid: user.uid, action: "compiled", detail: "Our AI-powered solution prepared the draft, then completed an independent source check and deterministic validation." }])
  });
  await persistAnalysisManifest(accessToken, `organizations/${organizationId}/reports/${reportId}`, manifest);
  return { reportId, report: summary, result: persistedResult, sources: publicSources(sources), manifest };
}

export async function readCompilationByRequest(user: AuthenticatedUser, requestId: string | undefined): Promise<PersistedCompilationResponse | null> {
  if (!isValidCompilationRequestId(requestId)) return null;
  const reportId = compilationReportId(user.uid, requestId);
  const accessToken = await gcpToken();
  const response = await authorizedFetch(`${firestoreBase}/organizations/org_${user.uid}/reports/${reportId}`, accessToken);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Saved report could not be checked (${response.status}).`);
  const record = decodeFields(((await response.json()) as { fields?: Record<string, FirestoreValue> }).fields || {});
  if (record.ownerUid !== user.uid || record.requestId !== requestId || record.compilationVersion !== COMPILATION_VERSION || !record.resultJson) return null;
  const result = await reconcilePersistedResult(record, JSON.parse(String(record.resultJson)) as CompilationResult, accessToken);
  const report: SavedReportSummary = {
    id: reportId,
    organizationName: String(record.organizationName || ""),
    grantName: String(record.grantName || ""),
    reportingPeriod: String(record.reportingPeriod || ""),
    status: record.status === "ready" ? "ready" : "review_required",
    evidenceCoveragePercent: Number(record.evidenceCoveragePercent || 0),
    unresolvedItems: Number(record.unresolvedItems || 0),
    sourceCount: Number(record.sourceCount || 0),
    createdAt: String(record.createdAt || ""),
    updatedAt: String(record.updatedAt || "")
  };
  return { reportId, report, result, sources: publicSources(persistedSources(record)), ...(parseAnalysisManifest(record.manifestJson) ? { manifest: parseAnalysisManifest(record.manifestJson)! } : {}) };
}

export async function readCompilationById(user: AuthenticatedUser, reportId: string): Promise<PersistedCompilationResponse | null> {
  if (!/^report_[a-f0-9]{32}$/.test(reportId)) return null;
  const accessToken = await gcpToken();
  const response = await authorizedFetch(`${firestoreBase}/organizations/org_${user.uid}/reports/${reportId}`, accessToken);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Saved report could not be loaded (${response.status}).`);
  const record = decodeFields(((await response.json()) as { fields?: Record<string, FirestoreValue> }).fields || {});
  if (record.ownerUid !== user.uid || !record.resultJson) return null;
  const result = await reconcilePersistedResult(record, JSON.parse(String(record.resultJson)) as CompilationResult, accessToken);
  const report: SavedReportSummary = {
    id: reportId,
    organizationName: String(record.organizationName || ""),
    grantName: String(record.grantName || ""),
    reportingPeriod: String(record.reportingPeriod || ""),
    status: record.status === "ready" ? "ready" : "review_required",
    evidenceCoveragePercent: Number(record.evidenceCoveragePercent || 0),
    unresolvedItems: Number(record.unresolvedItems || 0),
    sourceCount: Number(record.sourceCount || 0),
    createdAt: String(record.createdAt || ""),
    updatedAt: String(record.updatedAt || "")
  };
  return { reportId, report, result, sources: publicSources(persistedSources(record)), ...(parseAnalysisManifest(record.manifestJson) ? { manifest: parseAnalysisManifest(record.manifestJson)! } : {}) };
}

export function compilationReportId(userUid: string, requestId: string | undefined) {
  if (!isValidCompilationRequestId(requestId)) return `report_${randomUUID().replaceAll("-", "")}`;
  const digest = createHash("sha256").update(`${userUid}:${requestId}`).digest("hex").slice(0, 32);
  return `report_${digest}`;
}

export function compilationAnalysisCacheKey(request: CompilationRequest) {
  const digest = createHash("sha256");
  digest.update(COMPILATION_VERSION);
  digest.update(`\0${CANONICALIZATION_SCHEMA_VERSION}\0${REPORT_PROMPT_VERSION}\0${SOURCE_PARSER_VERSION}`);
  digest.update(`\0${process.env.OPENAI_MODEL || "gpt-5.6-terra"}\0${process.env.OPENAI_VERIFIER_MODEL || "gpt-5.6-luna"}`);
  digest.update("\0");
  digest.update(request.organizationName.trim());
  digest.update("\0");
  digest.update(request.grantName.trim());
  digest.update("\0");
  digest.update(request.reportingPeriod.trim());
  for (const file of [...request.files].sort((left, right) => `${left.role}:${left.name}`.localeCompare(`${right.role}:${right.name}`))) {
    digest.update("\0");
    digest.update(file.role);
    digest.update("\0");
    digest.update(file.name);
    digest.update("\0");
    digest.update(file.mimeType);
    digest.update("\0");
    digest.update(String(file.size));
    digest.update("\0");
    digest.update(createHash("sha256").update(file.data).digest());
  }
  return digest.digest("hex");
}

export async function readCompilationAnalysisCache(request: CompilationRequest): Promise<CompilationResult | null> {
  const accessToken = await gcpToken();
  return readCachedJson<CompilationResult>(accessToken, `analysisCache/${compilationAnalysisCacheKey(request)}`, "resultJson");
}

export async function finalizeCompilationAnalysisCache(request: CompilationRequest, candidate: CompilationResult): Promise<CompilationResult> {
  const accessToken = await gcpToken();
  const path = `analysisCache/${compilationAnalysisCacheKey(request)}`;
  const created = await writeDocumentIfAbsent(accessToken, path, {
    compilationVersion: COMPILATION_VERSION,
    createdAt: new Date().toISOString(),
    resultJson: JSON.stringify(candidate)
  });
  if (created) return candidate;
  return await readCachedJson<CompilationResult>(accessToken, path, "resultJson") || candidate;
}

export function sanitizeSetupDecisions(request: CompilationRequest, actorUid: string) {
  const allowed = new Set(["agreement_details_applied", "reporting_period_applied", "agreement_workflow_applied"]);
  return (request.setupDecisions || []).slice(-10).flatMap((decision) => {
    if (!allowed.has(decision.action)) return [];
    const timestamp = Number.isFinite(Date.parse(decision.at)) ? decision.at : new Date().toISOString();
    return [{
      at: timestamp,
      actorUid,
      action: decision.action,
      detail: String(decision.detail || "").trim().slice(0, 500),
      sourceName: safeName(String(decision.sourceName || "Award agreement")),
      ...(decision.previousGrantName ? { previousGrantName: String(decision.previousGrantName).trim().slice(0, 240) } : {}),
      ...(decision.previousReportingPeriod ? { previousReportingPeriod: String(decision.previousReportingPeriod).trim().slice(0, 160) } : {}),
      ...(decision.selectedObligationId ? { selectedObligationId: String(decision.selectedObligationId).trim().slice(0, 120) } : {})
    }];
  });
}

export async function listReports(user: AuthenticatedUser): Promise<SavedReportSummary[]> {
  const response = await authorizedFetch(`${firestoreBase}/organizations/org_${user.uid}/reports?pageSize=50&orderBy=updatedAt%20desc`, await gcpToken());
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Saved reports could not be loaded (${response.status}).`);
  const body = await response.json() as { documents?: Array<{ fields?: Record<string, FirestoreValue> }> };
  return (body.documents || []).map((document) => decodeFields(document.fields || {}) as unknown as SavedReportSummary);
}

export async function deleteReport(user: AuthenticatedUser, reportId: string) {
  const record = await readOwnedReportRecord(user, reportId);
  const sources = persistedSources(record.existing);
  for (const source of sources) await deleteObject(record.accessToken, source.objectName);
  await deleteAnalysisManifestHistory(record.accessToken, record.path);
  const response = await authorizedFetch(`${firestoreBase}/${record.path}`, record.accessToken, { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error(`Saved report could not be deleted (${response.status}).`);
  return { reportId, deleted: true };
}

async function deleteAnalysisManifestHistory(accessToken: string, reportPath: string) {
  const response = await authorizedFetch(`${firestoreBase}/${reportPath}/analyses?pageSize=100`, accessToken);
  if (response.status === 404) return;
  if (!response.ok) throw new Error(`Analysis manifest history could not be enumerated for cleanup (${response.status}).`);
  const body = await response.json() as { documents?: Array<{ name?: string }> };
  for (const document of body.documents || []) {
    const relative = document.name?.split("/documents/")[1];
    if (!relative?.startsWith(`${reportPath}/analyses/`)) continue;
    const deleted = await authorizedFetch(`${firestoreBase}/${relative}`, accessToken, { method: "DELETE" });
    if (!deleted.ok && deleted.status !== 404) throw new Error(`Analysis manifest history could not be cleaned up (${deleted.status}).`);
  }
}

export async function saveReview(user: AuthenticatedUser, reportId: string, itemId: string, resolution: "resolved" | "not_applicable" = "resolved") {
  if (!/^report_[a-f0-9]{32}$/.test(reportId)) throw new Error("Invalid report identifier.");
  const accessToken = await gcpToken();
  const path = `organizations/org_${user.uid}/reports/${reportId}`;
  const existingResponse = await authorizedFetch(`${firestoreBase}/${path}`, accessToken);
  if (!existingResponse.ok) throw new Error("Saved report was not found.");
  const existing = decodeFields(((await existingResponse.json()) as { fields: Record<string, FirestoreValue> }).fields);
  if (existing.ownerUid !== user.uid || !existing.resultJson) throw new Error("Saved report was not found.");
  const sources = persistedSources(existing);
  const current = await reconcilePersistedResult(existing, JSON.parse(String(existing.resultJson)) as CompilationResult, accessToken);
  const reviewed = applyBoundedReviewDecision(current, itemId, resolution);
  const result = refreshEvidenceWorkflow(existing, sources, reviewed);
  const now = new Date().toISOString();
  const priorAudit = JSON.parse(String(existing.auditJson || "[]")) as unknown[];
  const requestLike = reportRequest(existing, sources);
  const finalized = withAnalysisManifest(reportId, requestLike, result, sources, now);
  const summary = summarize(reportId, requestLike, finalized.result, String(existing.createdAt), now, Number(existing.sourceCount || 0));
  await writeDocument(accessToken, path, {
    ...existing,
    ...summary,
    resultJson: JSON.stringify(finalized.result),
    manifestJson: JSON.stringify(finalized.manifest),
    auditJson: JSON.stringify([...priorAudit, { at: now, actorUid: user.uid, action: "review_confirmed", itemId, resolution }])
  });
  await persistAnalysisManifest(accessToken, path, finalized.manifest, parseAnalysisManifest(existing.manifestJson));
  return { reportId, report: summary, result: finalized.result, sources: publicSources(sources), manifest: finalized.manifest };
}

export function applyBoundedReviewDecision(result: CompilationResult, itemId: string, resolution: "resolved" | "not_applicable" = "resolved") {
  const programId = itemId.startsWith("program-") ? itemId.slice("program-".length) : "";
  const programCheck = programId ? result.programChecks?.find((check) => check.id === programId) : undefined;
  const qualityCheck = result.qualityChecks.find((check) => check.id === itemId);
  const finding = result.validation.findings.find((item) => item.id === itemId);
  if (programCheck && (programCheck.resolution !== "open" || programCheck.severity === "info")) throw new Error("This report item no longer requires review.");
  if (!programCheck && qualityCheck?.status !== "review" && finding?.verdict !== "review") throw new Error("This report item is not an open review decision.");

  const useEvidenceBackedValue = resolution === "resolved" && programCheck?.type === "data_conflict" && programCheck.evidenceBackedValue;
  const narrativeId = programCheck ? `evidence-backed-${programCheck.id}` : "";
  const evidenceSource = programCheck?.sources.at(-1);
  const narrative = useEvidenceBackedValue && evidenceSource
    ? [...result.narrative.filter((statement) => statement.id !== narrativeId), {
        id: narrativeId,
        text: `${result.grantProfile.granteeName?.value || "The organization"} completed ${programCheck.evidenceBackedValue} housing stability assessments during the reporting period.`,
        evidenceType: "source_fact" as const,
        source: evidenceSource,
        status: "verified" as const
      }]
    : result.narrative;
  return {
    ...result,
    narrative,
    qualityChecks: result.qualityChecks.map((check) => check.id === itemId && check.status === "review"
      ? { ...check, status: "passed" as const, required: programCheck ? false : check.required, detail: `${check.detail} Reviewed and confirmed by the signed-in user.` }
      : check),
    validation: {
      ...result.validation,
      findings: result.validation.findings.map((item) => item.id === itemId && item.verdict === "review"
        ? { ...item, verdict: "source_matched" as const, reason: `${item.reason} A professional reviewer confirmed this item.` }
        : item)
    },
    programChecks: result.programChecks?.map((check) => check.id === programId ? { ...check, resolution } : check)
  };
}

export async function addSupportingEvidence(user: AuthenticatedUser, reportId: string, files: CompilerFile[], replaceEvidenceId?: string): Promise<PersistedCompilationResponse> {
  const reconciliationStartedAt = Date.now();
  validateEvidenceFiles(files);
  if (replaceEvidenceId && !isEvidenceId(replaceEvidenceId)) throw new Error("Invalid evidence identifier.");
  const record = await readOwnedReportRecord(user, reportId);
  const priorResult = await reconcilePersistedResult(record.existing, JSON.parse(String(record.existing.resultJson)) as CompilationResult, record.accessToken);
  const priorSources = persistedSources(record.existing);
  const priorEvidence = (priorResult.evidenceFiles || []).filter((file) => file.id !== replaceEvidenceId);
  const remainingSources = sourcesAfterEvidenceReplacement(priorSources, replaceEvidenceId);
  const incomingIds = files.flatMap((file) => file.evidenceId ? [file.evidenceId] : []);
  if (new Set(incomingIds).size !== incomingIds.length || incomingIds.some((id) => priorEvidence.some((file) => file.id === id))) throw new Error("Each supporting evidence file must have a unique identifier.");
  const maxFiles = configuredPositiveInteger("EVIDENCE_MAX_FILES", MAX_EVIDENCE_FILES);
  const maxBytes = configuredPositiveInteger("EVIDENCE_MAX_TOTAL_BYTES", MAX_EVIDENCE_TOTAL_BYTES);
  if (priorEvidence.length + files.length > maxFiles) throw new Error(`A report can contain up to ${maxFiles} supporting evidence files.`);
  const aggregateBytes = priorEvidence.reduce((sum, file) => sum + file.size, 0) + files.reduce((sum, file) => sum + file.size, 0);
  if (aggregateBytes > maxBytes) throw new Error(`Supporting evidence exceeds the report's configured aggregate upload limit.`);

  const analyzed = normalizeSupportingEvidenceFiles(await analyzeSupportingEvidenceCached(record.accessToken, files, priorResult));
  const mergedEvidence = [...priorEvidence, ...analyzed];
  const uploadedSources = await Promise.all(files.map(async (file, index) => {
    const evidence = analyzed[index];
    const objectName = `org_${user.uid}/reports/${reportId}/sources/supportingEvidence-${safeEvidenceId(evidence.id)}-${safeName(file.name)}`;
    await uploadObject(record.accessToken, objectName, file);
    return evidenceSourceRecord(file, evidence, objectName);
  }));
  const now = new Date().toISOString();
  const sourceRecords = [...remainingSources, ...uploadedSources];
  assertCoreSourceBindingsPreserved(priorSources, sourceRecords);
  const updatedResult = refreshEvidenceWorkflow(record.existing, sourceRecords, {
    ...applyEvidenceMatches(priorResult, mergedEvidence),
    analysisMetrics: {
      ...(priorResult.analysisMetrics || { analysisDurationMs: 0, parserDurationMs: 0, llmDurationMs: 0, evidenceReconciliationDurationMs: 0 }),
      evidenceReconciliationDurationMs: Date.now() - reconciliationStartedAt
    }
  });
  const authoritativeSources = synchronizeEvidenceSourceState(sourceRecords, updatedResult.evidenceFiles || []);
  const requestLike = reportRequest(record.existing, authoritativeSources);
  const finalized = withAnalysisManifest(reportId, requestLike, updatedResult, authoritativeSources, now);
  const summary = summarize(reportId, requestLike, finalized.result, String(record.existing.createdAt), now, authoritativeSources.length);
  const audit = JSON.parse(String(record.existing.auditJson || "[]")) as unknown[];
  await writeDocument(record.accessToken, record.path, {
    ...record.existing,
    ...summary,
    resultJson: JSON.stringify(finalized.result),
    manifestJson: JSON.stringify(finalized.manifest),
    sourcesJson: JSON.stringify(authoritativeSources),
    auditJson: JSON.stringify([...audit, { at: now, actorUid: user.uid, action: replaceEvidenceId ? "evidence_replaced" : "evidence_added", evidenceIds: analyzed.map((item) => item.id) }])
  });
  await persistAnalysisManifest(record.accessToken, record.path, finalized.manifest, parseAnalysisManifest(record.existing.manifestJson));
  const replacedSource = priorSources.find((source) => source.evidenceId === replaceEvidenceId);
  if (replacedSource?.objectName) await deleteObject(record.accessToken, replacedSource.objectName);
  return { reportId, report: summary, result: finalized.result, sources: publicSources(authoritativeSources), manifest: finalized.manifest };
}

export async function removeSupportingEvidence(user: AuthenticatedUser, reportId: string, evidenceId: string): Promise<PersistedCompilationResponse> {
  if (!isEvidenceId(evidenceId)) throw new Error("Invalid evidence identifier.");
  const record = await readOwnedReportRecord(user, reportId);
  const priorResult = await reconcilePersistedResult(record.existing, JSON.parse(String(record.existing.resultJson)) as CompilationResult, record.accessToken);
  const priorSources = persistedSources(record.existing);
  const removedSource = priorSources.find((source) => source.evidenceId === evidenceId);
  if (!removedSource) throw new Error("Supporting evidence file was not found.");
  const sourceRecords = priorSources.filter((source) => !(source.role === "supportingEvidence" && source.evidenceId === evidenceId));
  assertCoreSourceBindingsPreserved(priorSources, sourceRecords);
  const evidenceFiles = (priorResult.evidenceFiles || []).filter((file) => file.id !== evidenceId);
  const updatedResult = refreshEvidenceWorkflow(record.existing, sourceRecords, applyEvidenceMatches(priorResult, evidenceFiles));
  const authoritativeSources = synchronizeEvidenceSourceState(sourceRecords, updatedResult.evidenceFiles || []);
  const now = new Date().toISOString();
  const requestLike = reportRequest(record.existing, authoritativeSources);
  const finalized = withAnalysisManifest(reportId, requestLike, updatedResult, authoritativeSources, now);
  const summary = summarize(reportId, requestLike, finalized.result, String(record.existing.createdAt), now, authoritativeSources.length);
  const audit = JSON.parse(String(record.existing.auditJson || "[]")) as unknown[];
  await writeDocument(record.accessToken, record.path, {
    ...record.existing,
    ...summary,
    resultJson: JSON.stringify(finalized.result),
    manifestJson: JSON.stringify(finalized.manifest),
    sourcesJson: JSON.stringify(authoritativeSources),
    auditJson: JSON.stringify([...audit, { at: now, actorUid: user.uid, action: "evidence_removed", evidenceId }])
  });
  await persistAnalysisManifest(record.accessToken, record.path, finalized.manifest, parseAnalysisManifest(record.existing.manifestJson));
  await deleteObject(record.accessToken, removedSource.objectName);
  return { reportId, report: summary, result: finalized.result, sources: publicSources(authoritativeSources), manifest: finalized.manifest };
}

export async function confirmEvidenceMatch(user: AuthenticatedUser, reportId: string, evidenceId: string, targetId: string): Promise<PersistedCompilationResponse> {
  if (!isEvidenceId(evidenceId) || !targetId.trim()) throw new Error("Invalid evidence match.");
  const record = await readOwnedReportRecord(user, reportId);
  const priorResult = await reconcilePersistedResult(record.existing, JSON.parse(String(record.existing.resultJson)) as CompilationResult, record.accessToken);
  const sources = persistedSources(record.existing);
  let found = false;
  const evidenceFiles = (priorResult.evidenceFiles || []).map((file) => {
    if (file.id !== evidenceId) return file;
    return {
      ...file,
      relevance: "matched" as const,
      matches: file.matches.map((match) => {
        if (match.targetId !== targetId) return match;
        found = true;
        return { ...match, status: "matched" as const, confirmedByUser: true };
      })
    };
  });
  if (!found) throw new Error("Suggested evidence match was not found.");
  const confirmedFile = evidenceFiles.find((file) => file.id === evidenceId)!;
  const updatedSources = sources.map((source) => source.evidenceId === evidenceId ? { ...source, relevance: confirmedFile.relevance, evidenceMatches: confirmedFile.matches } : source);
  const updatedResult = refreshEvidenceWorkflow(record.existing, updatedSources, applyEvidenceMatches(priorResult, evidenceFiles));
  const authoritativeSources = synchronizeEvidenceSourceState(updatedSources, updatedResult.evidenceFiles || []);
  const now = new Date().toISOString();
  const requestLike = reportRequest(record.existing, authoritativeSources);
  const finalized = withAnalysisManifest(reportId, requestLike, updatedResult, authoritativeSources, now);
  const summary = summarize(reportId, requestLike, finalized.result, String(record.existing.createdAt), now, authoritativeSources.length);
  const audit = JSON.parse(String(record.existing.auditJson || "[]")) as unknown[];
  await writeDocument(record.accessToken, record.path, {
    ...record.existing,
    ...summary,
    resultJson: JSON.stringify(finalized.result),
    manifestJson: JSON.stringify(finalized.manifest),
    sourcesJson: JSON.stringify(authoritativeSources),
    auditJson: JSON.stringify([...audit, { at: now, actorUid: user.uid, action: "evidence_match_confirmed", evidenceId, targetId }])
  });
  await persistAnalysisManifest(record.accessToken, record.path, finalized.manifest, parseAnalysisManifest(record.existing.manifestJson));
  return { reportId, report: summary, result: finalized.result, sources: publicSources(authoritativeSources), manifest: finalized.manifest };
}

export async function saveGtmDailyScan(scan: DailySocialScan) {
  const accessToken = await gcpToken();
  await writeDocument(accessToken, "gtm/daily-social", {
    generatedAt: scan.generatedAt,
    itemCount: scan.items.length,
    scanJson: JSON.stringify(scan)
  });
  return scan;
}

export async function readGtmDailyScan(): Promise<DailySocialScan | null> {
  const response = await authorizedFetch(`${firestoreBase}/gtm/daily-social`, await gcpToken());
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Daily GTM signals could not be loaded (${response.status}).`);
  const document = await response.json() as { fields?: Record<string, FirestoreValue> };
  const record = decodeFields(document.fields || {});
  if (!record.scanJson) return null;
  return JSON.parse(String(record.scanJson)) as DailySocialScan;
}

export async function saveReliabilityCanaryResult(result: ReliabilityCanaryResult) {
  const accessToken = await gcpToken();
  const record = {
    runId: result.runId,
    status: result.status,
    completedAt: result.completedAt,
    deploymentRevision: result.deploymentRevision,
    canaryJson: JSON.stringify(result)
  };
  await writeDocument(accessToken, `reliability/canary/runs/${safeDocumentId(result.runId)}`, record);
  await writeDocument(accessToken, "reliability/canary", record);
  return result;
}

export async function saveReliabilityDriftEvents(events: AnalysisDriftEvent[]) {
  if (!events.length) return [];
  const accessToken = await gcpToken();
  const recordedAt = new Date().toISOString();
  await Promise.all(events.map((event) => writeDocument(accessToken, `reliability/canary/driftEvents/${safeDocumentId(event.id)}`, {
    id: event.id,
    level: event.level,
    field: event.field,
    recordedAt,
    eventJson: JSON.stringify(event)
  })));
  return events;
}

export async function readLatestReliabilityCanary(): Promise<ReliabilityCanaryResult | null> {
  const response = await authorizedFetch(`${firestoreBase}/reliability/canary`, await gcpToken());
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Reliability state could not be loaded (${response.status}).`);
  const record = decodeFields(((await response.json()) as { fields?: Record<string, FirestoreValue> }).fields || {});
  return parseCanaryResult(record.canaryJson);
}

export async function readReliabilityDashboard(): Promise<ReliabilityDashboardSnapshot> {
  const accessToken = await gcpToken();
  const [latest, runs, drift, incidents, lastKnownGood] = await Promise.all([
    readLatestReliabilityCanary(),
    queryReliabilityCollection<ReliabilityCanaryResult>(accessToken, "reliability/canary/runs?pageSize=20&orderBy=completedAt%20desc", "canaryJson"),
    queryReliabilityCollection<AnalysisDriftEvent>(accessToken, "reliability/canary/driftEvents?pageSize=20&orderBy=recordedAt%20desc", "eventJson"),
    queryReliabilityCollection<ReliabilityIncident>(accessToken, "reliability/canary/incidents?pageSize=50&orderBy=updatedAt%20desc", "incidentJson"),
    readLastKnownGoodRelease()
  ]);
  return {
    environment: applicationEnvironment(),
    applicationRevision: applicationRevision(),
    deploymentRevision: deploymentRevision(),
    overallHealth: latest?.status || "unknown",
    latestCanary: latest,
    lastSuccessfulCanary: runs.find((run) => run.status === "healthy")?.completedAt || null,
    recentDriftEvents: drift,
    recentDeployments: [...new Set(runs.map((run) => run.deploymentRevision).filter(Boolean))].slice(0, 10),
    activeIncidents: incidents.filter((incident) => ["open", "unknown"].includes(incident.finalStatus)),
    escalatedIncidents: incidents.filter((incident) => incident.finalStatus === "escalated"),
    lastKnownGood
  };
}

export async function saveReliabilityIncident(incident: ReliabilityIncident) {
  await writeDocument(await gcpToken(), `reliability/canary/incidents/${safeDocumentId(incident.incidentId)}`, {
    incidentId: incident.incidentId,
    lifecycle: incident.lifecycle,
    severity: incident.severity,
    updatedAt: incident.updatedAt,
    incidentJson: JSON.stringify(incident)
  });
  return incident;
}

export async function saveLastKnownGoodRelease(release: LastKnownGoodRelease) {
  await writeDocument(await gcpToken(), "reliability/last-known-good", {
    recordedAt: release.recordedAt,
    deploymentRevision: release.deploymentRevision,
    releaseJson: JSON.stringify(release)
  });
  return release;
}

export async function readLastKnownGoodRelease(): Promise<LastKnownGoodRelease | null> {
  const response = await authorizedFetch(`${firestoreBase}/reliability/last-known-good`, await gcpToken());
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Last-known-good release could not be loaded (${response.status}).`);
  const record = decodeFields(((await response.json()) as { fields?: Record<string, FirestoreValue> }).fields || {});
  try { return record.releaseJson ? JSON.parse(String(record.releaseJson)) as LastKnownGoodRelease : null; }
  catch { return null; }
}

export async function saveReliabilityArtifact(runId: string, kind: string, value: unknown) {
  const accessToken = await gcpToken();
  const objectName = `reliability/canary/${safeDocumentId(runId)}/${safeName(kind)}.json`;
  const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const response = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body
  });
  if (!response.ok) throw new Error(`Reliability diagnostic artifact could not be stored (${response.status}).`);
  return objectName;
}

export async function checkReliabilityDependencies() {
  const startedAt = Date.now();
  try {
    const accessToken = await gcpToken();
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const [firestore, storage, modelProvider] = await Promise.all([
      authorizedFetch(`${firestoreBase}/reliability/canary`, accessToken),
      authorizedFetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o?maxResults=1&fields=kind`, accessToken),
      apiKey
        ? fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) })
        : Promise.resolve(null)
    ]);
    const firestoreReachable = firestore.ok || firestore.status === 404;
    const storageReachable = storage.ok;
    const modelReachable = Boolean(modelProvider?.ok);
    return {
      status: firestoreReachable && storageReachable && modelReachable ? "healthy" : "unhealthy",
      firestore: firestoreReachable ? "reachable" : `error_${firestore.status}`,
      storage: storageReachable ? "reachable" : `error_${storage.status}`,
      modelProvider: modelProvider ? modelReachable ? "reachable" : `error_${modelProvider.status}` : "not_configured",
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    return { status: "unknown", firestore: "unknown", storage: "unknown", durationMs: Date.now() - startedAt, errorCategory: error instanceof Error ? error.name : "unknown_error" };
  }
}

export async function saveGtmAwardScan(scan: AwardDiscoveryScan) {
  const accessToken = await gcpToken();
  await writeDocument(accessToken, "gtm/daily-awards", {
    generatedAt: scan.generatedAt,
    itemCount: scan.opportunities.length,
    scanJson: JSON.stringify(scan)
  });
  return scan;
}

export async function readGtmAwardScan(): Promise<AwardDiscoveryScan | null> {
  const response = await authorizedFetch(`${firestoreBase}/gtm/daily-awards`, await gcpToken());
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Daily GTM award signals could not be loaded (${response.status}).`);
  const document = await response.json() as { fields?: Record<string, FirestoreValue> };
  const record = decodeFields(document.fields || {});
  if (!record.scanJson) return null;
  return JSON.parse(String(record.scanJson)) as AwardDiscoveryScan;
}

export async function saveGtmControlPlaneReconciliation(reconciliation: ControlPlaneQueueReconciliation) {
  const accessToken = await gcpToken();
  const persisted = { ...reconciliation, generatedAt: new Date().toISOString() };
  await writeDocument(accessToken, "gtm/control-plane-reconciliation", {
    generatedAt: persisted.generatedAt,
    cardCount: persisted.cards.length,
    uniqueOrganizationCount: persisted.uniqueOrganizations,
    reconciliationJson: JSON.stringify(persisted)
  });
  return persisted;
}

export async function readGtmControlPlaneReconciliation(): Promise<ControlPlaneQueueReconciliation | null> {
  const response = await authorizedFetch(firestoreBase + "/gtm/control-plane-reconciliation", await gcpToken());
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("GTM Control Plane reconciliation could not be loaded (" + response.status + ").");
  const record = decodeFields(((await response.json()) as { fields?: Record<string, FirestoreValue> }).fields || {});
  try { return record.reconciliationJson ? JSON.parse(String(record.reconciliationJson)) as ControlPlaneQueueReconciliation : null; }
  catch { return null; }
}

export async function saveGtmShadowStatus(status: ShadowPipelineStatus) {
  const accessToken = await gcpToken();
  await writeDocument(accessToken, "gtm/shadow-status", { generatedAt: status.generatedAt, statusJson: JSON.stringify(status) });
  return status;
}

export async function readGtmShadowStatus(): Promise<ShadowPipelineStatus | null> {
  const response = await authorizedFetch(firestoreBase + "/gtm/shadow-status", await gcpToken());
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("GTM shadow status could not be loaded (status " + response.status + ").");
  const document = await response.json() as { fields?: Record<string, FirestoreValue> };
  const record = decodeFields(document.fields || {});
  return record.statusJson ? JSON.parse(String(record.statusJson)) as ShadowPipelineStatus : null;
}

export async function saveGtmContactEnrichment(record: ContactEnrichmentRecord) {
  const accessToken = await gcpToken();
  await writeDocument(accessToken, `gtm/contact-enrichments/records/${safeGtmContactDocumentId(record.id)}`, {
    updatedAt: record.updatedAt,
    recordJson: JSON.stringify(record)
  });
  return record;
}

export async function readGtmContactEnrichment(id: string): Promise<ContactEnrichmentRecord | null> {
  const accessToken = await gcpToken();
  const response = await authorizedFetch(`${firestoreBase}/gtm/contact-enrichments/records/${safeGtmContactDocumentId(id)}`, accessToken);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GTM contact enrichment could not be loaded (${response.status}).`);
  const document = await response.json() as { fields?: Record<string, FirestoreValue> };
  const record = decodeFields(document.fields || {});
  try { return record.recordJson ? JSON.parse(String(record.recordJson)) as ContactEnrichmentRecord : null; }
  catch { return null; }
}

export async function saveGtmEnrichmentUsage(usage: EnrichmentUsage) {
  const accessToken = await gcpToken();
  await writeDocument(accessToken, "gtm/contact-enrichment-usage/records/current", {
    updatedAt: usage.updatedAt,
    usageJson: JSON.stringify(usage)
  });
  return usage;
}

export async function readGtmEnrichmentUsage(): Promise<EnrichmentUsage | null> {
  const accessToken = await gcpToken();
  const response = await authorizedFetch(`${firestoreBase}/gtm/contact-enrichment-usage/records/current`, accessToken);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GTM contact-enrichment usage could not be loaded (${response.status}).`);
  const document = await response.json() as { fields?: Record<string, FirestoreValue> };
  const record = decodeFields(document.fields || {});
  try { return record.usageJson ? JSON.parse(String(record.usageJson)) as EnrichmentUsage : null; }
  catch { return null; }
}

export async function readGtmContactSuppression(email: string): Promise<SuppressionCheck> {
  const normalizedEmail = email.trim().toLowerCase();
  const checkedAt = new Date().toISOString();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    return { status: "UNKNOWN", reasons: ["A valid direct business email is required before suppression history can be checked."], checkedAt, sourcesChecked: [] };
  }
  try {
    const accessToken = await gcpToken();
    const response = await authorizedFetch(`${firestoreBase}/gtm/contact-suppressions/records/${contactSuppressionDocumentId(normalizedEmail)}`, accessToken);
    if (!response.ok && response.status !== 404) throw new Error(`Suppression document status ${response.status}`);
    const document = response.status === 404 ? null : await response.json() as { fields?: Record<string, FirestoreValue> };
    const record = document ? decodeFields(document.fields || {}) : {};
    const suppressionReasons = parseSuppressionReasons(record.reasonsJson);
    if (suppressionReasons.length) return { status: "BLOCKED", reasons: suppressionReasons, checkedAt, sourcesChecked: ["gtm/contact-suppressions/records"] };
    const existingSignup = await organizationExistsForEmail(accessToken, normalizedEmail);
    if (existingSignup) return { status: "BLOCKED", reasons: ["existing signup or customer record"], checkedAt, sourcesChecked: ["gtm/contact-suppressions/records", "organizations.ownerEmail"] };
    return { status: "CLEAR", reasons: [], checkedAt, sourcesChecked: ["gtm/contact-suppressions/records", "organizations.ownerEmail"] };
  } catch {
    return { status: "UNKNOWN", reasons: ["GTM suppression and contact history could not be read safely."], checkedAt, sourcesChecked: [] };
  }
}

export async function recordGtmContactSuppression(email: string, reasons: string[], source: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) return;
  const accessToken = await gcpToken();
  const documentId = contactSuppressionDocumentId(normalizedEmail);
  const existingResponse = await authorizedFetch(`${firestoreBase}/gtm/contact-suppressions/records/${documentId}`, accessToken);
  if (!existingResponse.ok && existingResponse.status !== 404) throw new Error(`GTM suppression record could not be read (${existingResponse.status}).`);
  const existing = existingResponse.status === 404
    ? []
    : parseSuppressionReasons(decodeFields(((await existingResponse.json()) as { fields?: Record<string, FirestoreValue> }).fields || {}).reasonsJson);
  const allowed = new Set(["unsubscribe", "opt_out", "do_not_contact", "complaint", "hard_bounce", "prior_outreach", "existing_signup", "existing_customer", "duplicate_contact"]);
  const merged = [...new Set([...existing, ...reasons.map((reason) => reason.trim().toLowerCase()).filter((reason) => allowed.has(reason))])];
  await writeDocument(accessToken, `gtm/contact-suppressions/records/${documentId}`, {
    emailHash: documentId,
    reasonsJson: JSON.stringify(merged),
    source: source.slice(0, 160),
    updatedAt: new Date().toISOString()
  });
}

export type LifecycleEventName = "account_created" | "first_report_started" | "checkout_started" | "subscription_started";

export async function saveLifecycleEvent(user: AuthenticatedUser, event: LifecycleEventName, attributionInput: unknown = {}) {
  const accessToken = await gcpToken();
  const organizationId = `org_${user.uid}`;
  const attribution = normalizeAttribution(attributionInput);
  if (Object.keys(attribution).length) {
    await writeDocument(accessToken, `organizations/${organizationId}/billing/attribution`, { attributionJson: JSON.stringify(attribution), updatedAt: new Date().toISOString() });
  }
  await writeDocumentIfAbsent(accessToken, `organizations/${organizationId}/lifecycleEvents/${event}`, {
    event,
    uid: user.uid,
    occurredAt: new Date().toISOString(),
    attributionJson: JSON.stringify(attribution)
  });
  return attribution;
}

export async function readBillingAttribution(user: AuthenticatedUser): Promise<Attribution> {
  const response = await authorizedFetch(`${firestoreBase}/organizations/org_${user.uid}/billing/attribution`, await gcpToken());
  if (response.status === 404) return {};
  if (!response.ok) throw new Error(`Billing attribution could not be loaded (${response.status}).`);
  const document = await response.json() as { fields?: Record<string, FirestoreValue> };
  return storedAttribution(decodeFields(document.fields || {}).attributionJson);
}

export function shouldApplyBillingEvent(snapshot: BillingEventSnapshot, priorEventId = "", priorEventAt = "") {
  return snapshot.eventId !== priorEventId && (!priorEventAt || snapshot.stripeEventCreatedAt >= priorEventAt);
}

export async function saveBillingEvent(snapshot: BillingEventSnapshot) {
  const accessToken = await gcpToken();
  const organizationId = `org_${snapshot.uid}`;
  const eventPath = `organizations/${organizationId}/billingEvents/${safeDocumentId(snapshot.eventId)}`;
  const created = await writeDocumentIfAbsent(accessToken, eventPath, billingRecord(snapshot));
  if (!created) return { duplicate: true, applied: false };

  const currentPath = `organizations/${organizationId}/billing/current`;
  const currentResponse = await authorizedFetch(`${firestoreBase}/${currentPath}`, accessToken);
  if (currentResponse.status !== 404 && !currentResponse.ok) throw new Error(`Billing status could not be loaded (${currentResponse.status}).`);
  const prior = currentResponse.status === 404 ? {} : decodeFields(((await currentResponse.json()) as { fields?: Record<string, FirestoreValue> }).fields || {});
  const priorEventAt = String(prior.stripeEventCreatedAt || "");
  if (shouldApplyBillingEvent(snapshot, String(prior.eventId || ""), priorEventAt)) {
    await writeDocument(accessToken, currentPath, billingRecord(mergeBillingSnapshot(prior, snapshot)));
  }
  if (snapshot.subscriptionStatus === "active" || snapshot.subscriptionStatus === "trialing") {
    await writeDocumentIfAbsent(accessToken, `organizations/${organizationId}/lifecycleEvents/subscription_started`, {
      event: "subscription_started",
      uid: snapshot.uid,
      occurredAt: snapshot.updatedAt,
      attributionJson: JSON.stringify(snapshot.attribution)
    });
  }
  return { duplicate: false, applied: shouldApplyBillingEvent(snapshot, String(prior.eventId || ""), priorEventAt) };
}

export async function readBillingStatus(user: AuthenticatedUser) {
  const response = await authorizedFetch(`${firestoreBase}/organizations/org_${user.uid}/billing/current`, await gcpToken());
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Billing status could not be loaded (${response.status}).`);
  const document = await response.json() as { fields?: Record<string, FirestoreValue> };
  const record = decodeFields(document.fields || {});
  const subscriptionStatus = String(record.subscriptionStatus || "");
  return {
    stripeCustomerId: String(record.stripeCustomerId || ""),
    stripeSubscriptionId: String(record.stripeSubscriptionId || ""),
    stripePriceId: String(record.stripePriceId || ""),
    planKey: String(record.planKey || ""),
    subscriptionStatus,
    foundingPricingApplied: record.foundingPricingApplied === true,
    currentPeriodStart: String(record.currentPeriodStart || ""),
    currentPeriodEnd: String(record.currentPeriodEnd || ""),
    cancelAtPeriodEnd: record.cancelAtPeriodEnd === true,
    entitlementActive: subscriptionIsEntitled(subscriptionStatus),
    updatedAt: String(record.updatedAt || "")
  };
}

function billingRecord(snapshot: BillingEventSnapshot) {
  return { ...snapshot, attributionJson: JSON.stringify(snapshot.attribution) };
}

function mergeBillingSnapshot(prior: Record<string, unknown>, snapshot: BillingEventSnapshot): BillingEventSnapshot {
  const invoice = snapshot.eventType.startsWith("invoice.");
  return {
    ...snapshot,
    stripeCustomerId: snapshot.stripeCustomerId || String(prior.stripeCustomerId || ""),
    stripeSubscriptionId: snapshot.stripeSubscriptionId || String(prior.stripeSubscriptionId || ""),
    stripePriceId: snapshot.stripePriceId || String(prior.stripePriceId || ""),
    currentPeriodStart: snapshot.currentPeriodStart || String(prior.currentPeriodStart || ""),
    currentPeriodEnd: snapshot.currentPeriodEnd || String(prior.currentPeriodEnd || ""),
    cancelAtPeriodEnd: invoice ? prior.cancelAtPeriodEnd === true : snapshot.cancelAtPeriodEnd,
    attribution: { ...storedAttribution(prior.attributionJson), ...snapshot.attribution }
  };
}

function storedAttribution(value: unknown): Attribution {
  try { return normalizeAttribution(JSON.parse(String(value || "{}"))); }
  catch { return {}; }
}

function summarize(id: string, request: CompilationRequest, result: CompilationResult, createdAt: string, updatedAt: string, sourceCount = request.files.length): SavedReportSummary {
  const unresolvedItems = buildReportAttention(result).length;
  return { id, organizationName: request.organizationName, grantName: request.grantName, reportingPeriod: request.reportingPeriod, status: canGenerateReviewPackage(result) ? "ready" : "review_required", evidenceCoveragePercent: result.validation.evidenceCoveragePercent, unresolvedItems, sourceCount, createdAt, updatedAt };
}

async function uploadObject(accessToken: string, objectName: string, file: CompilationRequest["files"][number]) {
  const encoded = file.data.split(",", 2)[1];
  if (!encoded) throw new Error(`Source file ${file.name} is invalid.`);
  const response = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": file.mimeType }, body: Buffer.from(encoded, "base64")
  });
  if (!response.ok) throw new Error(`Source file ${file.name} could not be stored.`);
}

async function deleteObject(accessToken: string, objectName: string) {
  const response = await authorizedFetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}`, accessToken, { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error("Supporting evidence metadata was updated, but the prior stored object could not be removed.");
}

export interface StoredSource {
  role: CompilerFile["role"];
  name: string;
  mimeType: string;
  size: number;
  objectName: string;
  sha256?: string;
  evidenceId?: string;
  uploadedAt?: string;
  parsingStatus?: SupportingEvidenceFile["parsingStatus"];
  relevance?: SupportingEvidenceFile["relevance"];
  evidenceMatches?: SupportingEvidenceFile["matches"];
}

async function readOwnedReportRecord(user: AuthenticatedUser, reportId: string) {
  if (!/^report_[a-f0-9]{32}$/.test(reportId)) throw new Error("Invalid report identifier.");
  const accessToken = await gcpToken();
  const path = `organizations/org_${user.uid}/reports/${reportId}`;
  const response = await authorizedFetch(`${firestoreBase}/${path}`, accessToken);
  if (!response.ok) throw new Error("Saved report was not found.");
  const existing = decodeFields(((await response.json()) as { fields: Record<string, FirestoreValue> }).fields);
  if (existing.ownerUid !== user.uid || !existing.resultJson) throw new Error("Saved report was not found.");
  return { accessToken, path, existing };
}

function evidenceSourceRecord(file: CompilerFile, evidence: SupportingEvidenceFile, objectName: string): StoredSource {
  return {
    role: "supportingEvidence",
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    objectName,
    sha256: sourceFileHash(file),
    evidenceId: evidence.id,
    uploadedAt: evidence.uploadedAt,
    parsingStatus: evidence.parsingStatus,
    relevance: evidence.relevance,
    evidenceMatches: evidence.matches
  };
}

function publicSources(sources: StoredSource[]): PersistedReportSource[] {
  return sources.map((source) => ({
    role: source.role,
    name: source.name,
    mimeType: source.mimeType,
    size: source.size,
    evidenceId: source.evidenceId,
    uploadedAt: source.uploadedAt,
    parsingStatus: source.parsingStatus,
    relevance: source.relevance,
    evidenceMatches: source.evidenceMatches
  }));
}

function manifestSources(sources: StoredSource[]): AnalysisSourceManifest[] {
  return sources.map((source) => ({
    role: source.role,
    name: source.name,
    size: source.size,
    sha256: source.sha256 || createHash("sha256").update(`${source.role}\0${source.objectName}\0${source.size}`).digest("hex"),
    ...(source.relevance ? { relevance: source.relevance } : {}),
    ...(source.evidenceMatches?.length ? { evidenceTargetIds: source.evidenceMatches.filter((match) => match.status === "matched" || match.confirmedByUser).map((match) => match.targetId).sort() } : {})
  }));
}

function sourceFileHash(file: CompilerFile) {
  const encoded = file.data.split(",", 2)[1] || "";
  return createHash("sha256").update(Buffer.from(encoded, "base64")).digest("hex");
}

function finalizeReliabilityWorkflow(request: CompilationRequest, result: CompilationResult, priorManifest?: AnalysisManifest, sources: StoredSource[] = []) {
  return applyWorkflowState(request, applyRuntimeIntegrity(result, priorManifest, manifestSources(sources)));
}

function withAnalysisManifest(reportId: string, request: CompilationRequest, result: CompilationResult, sources: StoredSource[], createdAt: string) {
  const finalized = finalizeReliabilityWorkflow(request, result, undefined, sources);
  const manifest = buildAnalysisManifest({ reportId, result: finalized, sources: manifestSources(sources), createdAt });
  return { result: { ...finalized, analysisManifest: manifest }, manifest };
}

function parseAnalysisManifest(value: unknown): AnalysisManifest | undefined {
  try {
    const parsed = JSON.parse(String(value || "")) as Partial<AnalysisManifest>;
    return parsed?.analysisId && parsed?.canonicalBusinessStateHash && Array.isArray(parsed.sourceFiles) ? parsed as AnalysisManifest : undefined;
  } catch {
    return undefined;
  }
}

async function persistAnalysisManifest(accessToken: string, reportPath: string, manifest: AnalysisManifest, prior?: AnalysisManifest) {
  await writeDocument(accessToken, `${reportPath}/analyses/${safeDocumentId(manifest.analysisId)}`, {
    analysisId: manifest.analysisId,
    createdAt: manifest.createdAt,
    canonicalBusinessStateHash: manifest.canonicalBusinessStateHash,
    deploymentRevision: manifest.deploymentRevision,
    manifestJson: JSON.stringify(manifest)
  });
  if (prior) await saveReliabilityDriftEvents(compareAnalysisManifests(prior, manifest).events);
}

export function synchronizeEvidenceSourceState(sources: StoredSource[], evidenceFiles: SupportingEvidenceFile[]) {
  const authoritative = new Map(evidenceFiles.map((file) => [file.id, file]));
  return sources.map((source) => {
    if (!source.evidenceId) return source;
    const evidence = authoritative.get(source.evidenceId);
    return evidence ? {
      ...source,
      parsingStatus: evidence.parsingStatus,
      relevance: evidence.relevance,
      evidenceMatches: evidence.matches
    } : source;
  });
}

function refreshEvidenceWorkflow(record: Record<string, unknown>, sources: StoredSource[], result: CompilationResult) {
  const request = reportRequest(record, sources);
  return finalizeReliabilityWorkflow(request, applyWorkflowState(request, result), undefined, sources);
}

async function reconcilePersistedResult(record: Record<string, unknown>, result: CompilationResult, accessToken: string) {
  const sources = persistedSources(record);
  const request = reportRequest(record, sources);
  let normalized = normalizeExplicitRequirementStatuses(canonicalizePersistedRequirements(restoreCoreFinancialBaseline(record, result)));
  if (mappingsNeedDeterministicRecovery(normalized)) normalized = await recoverDeterministicFinancialState(request, sources, normalized, accessToken);
  const reconciled = applyWorkflowState(request, applyEvidenceMatches(normalized, result.evidenceFiles || []));
  return finalizeReliabilityWorkflow(request, reconciled, parseAnalysisManifest(record.manifestJson), sources);
}

function canonicalizePersistedRequirements(result: CompilationResult): CompilationResult {
  const requirements = canonicalizeRequirements(result.requirements);
  const retainedIds = new Set(requirements.map((item) => item.id));
  return {
    ...result,
    requirements,
    validation: {
      ...result.validation,
      findings: result.validation.findings.filter((finding) => !finding.itemId.startsWith("requirement:") || retainedIds.has(finding.itemId.slice("requirement:".length)))
    }
  };
}

function restoreCoreFinancialBaseline(record: Record<string, unknown>, current: CompilationResult) {
  const core = parseCompilationResult(record.coreResultJson);
  if (!core || core.mappings.length !== current.mappings.length || mappingsNeedDeterministicRecovery(core)) return current;
  const transactionIds = new Set(core.mappings.map((mapping) => mapping.transactionId));
  const financialFinding = (item: CompilationResult["validation"]["findings"][number]) => item.itemId === "ledger"
    || item.itemId.startsWith("mapping:")
    || transactionIds.has(item.itemId)
    || transactionIds.has(item.itemId.replace(/^mapping:/, ""));
  return {
    ...current,
    mappings: core.mappings,
    financialAnalysis: core.financialAnalysis,
    qualityChecks: [
      ...current.qualityChecks.filter((check) => check.id !== "deterministic-ledger" && !check.id.startsWith("deterministic-financial-")),
      ...core.qualityChecks.filter((check) => check.id === "deterministic-ledger" || check.id.startsWith("deterministic-financial-"))
    ],
    validation: {
      ...current.validation,
      findings: [...current.validation.findings.filter((finding) => !financialFinding(finding)), ...core.validation.findings.filter(financialFinding)]
    }
  };
}

async function recoverDeterministicFinancialState(request: CompilationRequest, sources: StoredSource[], result: CompilationResult, accessToken: string) {
  const ledgerSource = sources.find((source) => source.role === "ledgerExport");
  if (!ledgerSource) return result;
  try {
    const ledger = await downloadStoredSource(accessToken, ledgerSource);
    const requestWithLedger = {
      ...request,
      files: request.files.map((file) => file.role === "ledgerExport" && file.name === ledger.name ? ledger : file)
    };
    const normalized = await normalizeCompilationSources(requestWithLedger);
    if (!normalized.ledgerRows.length) return result;
    return applyDeterministicAccuracyChecks(normalized.request, result, normalized.ledgerRows);
  } catch (error) {
    console.error("GrantDeskHQ financial-state recovery skipped:", error instanceof Error ? error.message : "Unknown error");
    return result;
  }
}

async function downloadStoredSource(accessToken: string, source: StoredSource): Promise<CompilerFile> {
  const response = await authorizedFetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(source.objectName)}?alt=media`, accessToken);
  if (!response.ok) throw new Error(`Stored accounting source could not be read (${response.status}).`);
  const data = Buffer.from(await response.arrayBuffer()).toString("base64");
  return { role: source.role, name: source.name, mimeType: source.mimeType, size: source.size, data: `data:${source.mimeType};base64,${data}` };
}

export function mappingsNeedDeterministicRecovery(result: Pick<CompilationResult, "mappings">) {
  if (result.mappings.length < 10) return false;
  const unresolved = result.mappings.filter((mapping) => mapping.reportTreatment === "needs_category_review" || mapping.mappingConfidence === "unmapped").length;
  return unresolved >= 3 && unresolved / result.mappings.length >= 0.5;
}

function parseCompilationResult(value: unknown): CompilationResult | null {
  try {
    const parsed = JSON.parse(String(value || "")) as Partial<CompilationResult>;
    return parsed && Array.isArray(parsed.mappings) && Array.isArray(parsed.qualityChecks) && parsed.validation ? parsed as CompilationResult : null;
  } catch {
    return null;
  }
}

export function sourcesAfterEvidenceReplacement(priorSources: StoredSource[], replaceEvidenceId?: string) {
  if (!replaceEvidenceId) return [...priorSources];
  return priorSources.filter((source) => !(source.role === "supportingEvidence" && source.evidenceId === replaceEvidenceId));
}

export function persistedSources(record: Record<string, unknown>): StoredSource[] {
  const current = parseStoredSources(record.sourcesJson);
  const immutableCore = parseStoredSources(record.coreSourcesJson).filter((source) => source.role !== "supportingEvidence");
  const merged = [...immutableCore, ...current];
  return [...new Map(merged.map((source) => [storedSourceKey(source), source])).values()];
}

function parseStoredSources(value: unknown): StoredSource[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.filter(isStoredSource) : [];
  } catch {
    return [];
  }
}

function isStoredSource(value: unknown): value is StoredSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<StoredSource>;
  return typeof source.role === "string" && typeof source.name === "string" && typeof source.objectName === "string";
}

function storedSourceKey(source: StoredSource) {
  return source.evidenceId ? `evidence:${source.evidenceId}` : `core:${source.role}:${source.objectName}`;
}

function assertCoreSourceBindingsPreserved(before: StoredSource[], after: StoredSource[]) {
  const afterKeys = new Set(after.filter((source) => source.role !== "supportingEvidence").map(storedSourceKey));
  const missing = before.filter((source) => source.role !== "supportingEvidence" && !afterKeys.has(storedSourceKey(source)));
  if (missing.length) throw new Error("Supporting evidence could not be updated because a core report source binding would be lost.");
}

function reportRequest(record: Record<string, unknown>, sources: StoredSource[]): CompilationRequest {
  return {
    organizationName: String(record.organizationName || ""),
    grantName: String(record.grantName || ""),
    reportingPeriod: String(record.reportingPeriod || ""),
    files: sources.map((source) => ({ role: source.role, name: source.name, mimeType: source.mimeType, size: source.size, data: "data:application/octet-stream;base64," }))
  };
}

function validateEvidenceFiles(files: CompilerFile[]) {
  if (!files.length || files.some((file) => file.role !== "supportingEvidence")) throw new Error("Only supporting evidence files can be added here.");
  const actualSizes = files.map((file) => encodedFileSize(file.data));
  if (actualSizes.some((size) => size === null)) throw new Error("Every evidence file must contain valid base64-encoded file data.");
  if (files.some((file, index) => Math.abs((actualSizes[index] || 0) - file.size) > 2)) throw new Error("One or more evidence file sizes do not match the uploaded data.");
  if (files.some((file) => file.evidenceId && !isEvidenceId(file.evidenceId))) throw new Error("One or more supporting evidence identifiers are invalid.");
  if (files.some((file) => !isSupportedEvidenceFile(file))) throw new Error("One or more supporting evidence files use an unsupported format.");
  const maxFileBytes = configuredPositiveInteger("EVIDENCE_MAX_FILE_BYTES", MAX_EVIDENCE_FILE_BYTES);
  if (actualSizes.some((size) => (size || 0) > maxFileBytes)) throw new Error("One or more supporting evidence files exceed the configured file limit.");
}

function isSupportedEvidenceFile(file: CompilerFile) {
  return /\.(xlsx|csv|pdf|docx|txt|png|jpe?g)$/i.test(file.name);
}

function configuredPositiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function isEvidenceId(value: string) {
  return /^evidence_[a-zA-Z0-9_-]{8,80}$/.test(value);
}

function safeEvidenceId(value: string) {
  if (!isEvidenceId(value)) throw new Error("Invalid evidence identifier.");
  return value;
}

type CachedEvidenceAnalysis = Pick<SupportingEvidenceFile, "parsingStatus" | "relevance" | "matches" | "parsingMessage">;

async function analyzeSupportingEvidenceCached(accessToken: string, files: CompilerFile[], result: CompilationResult) {
  const targetFingerprint = createHash("sha256").update(JSON.stringify(
    buildEvidenceTargets(result).map((target) => ({ id: target.id, type: target.type })).sort((left, right) => left.id.localeCompare(right.id))
  )).digest("hex");
  const keys = files.map((file) => evidenceAnalysisCacheKey(file, targetFingerprint));
  const cached = await Promise.all(keys.map((key) => readCachedJson<CachedEvidenceAnalysis>(accessToken, `evidenceAnalysisCache/${key}`, "analysisJson")));
  const missingIndexes = cached.flatMap((value, index) => value ? [] : [index]);
  const analyzedMissing = missingIndexes.length
    ? await analyzeSupportingEvidence(missingIndexes.map((index) => files[index]), result)
    : [];
  const analyzedByIndex = new Map(missingIndexes.map((index, offset) => [index, analyzedMissing[offset]]));

  return Promise.all(files.map(async (file, index) => {
    let analysis = cached[index];
    const candidate = analyzedByIndex.get(index);
    if (!analysis && candidate) {
      const cacheCandidate: CachedEvidenceAnalysis = {
        parsingStatus: candidate.parsingStatus,
        relevance: candidate.relevance,
        matches: candidate.matches,
        parsingMessage: candidate.parsingMessage
      };
      if (candidate.parsingStatus === "parsed") {
        const path = `evidenceAnalysisCache/${keys[index]}`;
        const created = await writeDocumentIfAbsent(accessToken, path, {
          compilationVersion: COMPILATION_VERSION,
          createdAt: new Date().toISOString(),
          analysisJson: JSON.stringify(cacheCandidate)
        });
        analysis = created ? cacheCandidate : await readCachedJson<CachedEvidenceAnalysis>(accessToken, path, "analysisJson") || cacheCandidate;
      } else {
        analysis = cacheCandidate;
      }
    }
    const fallback: CachedEvidenceAnalysis = analysis || {
      parsingStatus: "failed",
      relevance: "review",
      matches: [],
      parsingMessage: "Evidence analysis is temporarily unavailable."
    };
    return {
      id: file.evidenceId || `evidence_${randomUUID().replaceAll("-", "")}`,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      uploadedAt: file.uploadedAt && Number.isFinite(Date.parse(file.uploadedAt)) ? file.uploadedAt : new Date().toISOString(),
      ...fallback
    } satisfies SupportingEvidenceFile;
  }));
}

function evidenceAnalysisCacheKey(file: CompilerFile, targetFingerprint: string) {
  const digest = createHash("sha256");
  digest.update(COMPILATION_VERSION);
  digest.update("\0");
  digest.update(targetFingerprint);
  digest.update("\0");
  digest.update(file.name);
  digest.update("\0");
  digest.update(file.mimeType);
  digest.update("\0");
  digest.update(String(file.size));
  digest.update("\0");
  digest.update(createHash("sha256").update(file.data).digest());
  return digest.digest("hex");
}

async function readCachedJson<T>(accessToken: string, path: string, field: string): Promise<T | null> {
  const response = await authorizedFetch(`${firestoreBase}/${path}`, accessToken);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Analysis cache could not be read (${response.status}).`);
  const record = decodeFields(((await response.json()) as { fields?: Record<string, FirestoreValue> }).fields || {});
  if (record.compilationVersion !== COMPILATION_VERSION || !record[field]) return null;
  try { return JSON.parse(String(record[field])) as T; }
  catch { return null; }
}

async function queryReliabilityCollection<T>(accessToken: string, path: string, field: string): Promise<T[]> {
  const response = await authorizedFetch(`${firestoreBase}/${path}`, accessToken);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Reliability history could not be loaded (${response.status}).`);
  const body = await response.json() as { documents?: Array<{ fields?: Record<string, FirestoreValue> }> };
  return (body.documents || []).flatMap((document) => {
    const record = decodeFields(document.fields || {});
    try { return record[field] ? [JSON.parse(String(record[field])) as T] : []; }
    catch { return []; }
  });
}

function parseCanaryResult(value: unknown): ReliabilityCanaryResult | null {
  try {
    const parsed = JSON.parse(String(value || "")) as Partial<ReliabilityCanaryResult>;
    return parsed?.runId && parsed?.status && Array.isArray(parsed.assertions) ? parsed as ReliabilityCanaryResult : null;
  } catch {
    return null;
  }
}

async function writeDocumentIfAbsent(accessToken: string, path: string, record: Record<string, unknown>) {
  const response = await authorizedFetch(`${firestoreBase}/${path}?currentDocument.exists=false`, accessToken, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encodeFields(record) })
  });
  if (response.ok) return true;
  if (response.status === 409 || response.status === 412) return false;
  throw new Error(`Analysis cache could not be saved (${response.status}).`);
}

async function writeDocument(accessToken: string, path: string, record: Record<string, unknown>) {
  const url = `${firestoreBase}/${path}`;
  const init = { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: encodeFields(record) }) };
  const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);
  const maxAttempts = 5;
  let response: Response | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    response = await authorizedFetch(url, accessToken, init);
    if (response.ok || !retryableStatuses.has(response.status) || attempt === maxAttempts) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    const configuredBase = Number(process.env.PERSISTENCE_RETRY_BASE_MS);
    const base = Number.isFinite(configuredBase) && configuredBase >= 0 ? configuredBase : 500;
    const delay = Number.isFinite(retryAfter) && retryAfter >= 0
      ? Math.min(retryAfter * 1000, 10_000)
      : Math.min(base * (2 ** (attempt - 1)), 10_000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  if (!response?.ok) throw new Error(`Workspace record could not be saved (${response?.status || 503}).`);
}

async function gcpToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } });
  if (!response.ok) throw new Error("Cloud service credentials are unavailable.");
  const body = await response.json() as { access_token: string; expires_in: number };
  tokenCache = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

function authorizedFetch(url: string, token: string, init: RequestInit = {}) {
  return fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
}

type FirestoreValue = { stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean };
function encodeFields(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === "number" ? (Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }) : typeof value === "boolean" ? { booleanValue: value } : { stringValue: String(value ?? "") }]));
}
function decodeFields(fields: Record<string, FirestoreValue>) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.stringValue ?? (value.integerValue !== undefined ? Number(value.integerValue) : value.doubleValue ?? value.booleanValue ?? "")]));
}
function safeName(name: string) { return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120); }
function safeDocumentId(value: string) {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 140);
  if (!safe) throw new Error("Invalid billing event identifier.");
  return safe;
}

function safeGtmContactDocumentId(value: string) {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180);
  if (!/^contact_[a-zA-Z0-9_-]+$/.test(safe)) throw new Error("Invalid GTM contact enrichment identifier.");
  return safe;
}

function contactSuppressionDocumentId(email: string) {
  return `email_${createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 40)}`;
}

function parseSuppressionReasons(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.filter((reason): reason is string => typeof reason === "string" && reason.trim().length > 0).map((reason) => reason.trim()) : [];
  } catch {
    return [];
  }
}

async function organizationExistsForEmail(accessToken: string, email: string) {
  const response = await authorizedFetch(`${firestoreBase}:runQuery`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "organizations" }],
        where: { fieldFilter: { field: { fieldPath: "ownerEmail" }, op: "EQUAL", value: { stringValue: email } } },
        limit: 1
      }
    })
  });
  if (!response.ok) throw new Error(`Organization suppression query could not be completed (${response.status}).`);
  const rows = await response.json() as Array<{ document?: unknown }>;
  return rows.some((row) => Boolean(row.document));
}
