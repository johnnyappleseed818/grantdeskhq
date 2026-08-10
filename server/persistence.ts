import { createHash, randomUUID } from "node:crypto";
import { canGenerateReviewPackage, isValidCompilationRequestId } from "../src/lib/prototype.ts";
import type { CompilationRequest, CompilationResult, PersistedCompilationResponse, SavedReportSummary } from "../src/types/prototype.ts";
import type { AwardDiscoveryScan, DailySocialScan } from "../src/lib/gtm.ts";
import type { AuthenticatedUser } from "./auth.ts";
import type { BillingEventSnapshot } from "./billing.ts";

const projectId = process.env.GOOGLE_CLOUD_PROJECT || "grantdeskhq-proto-ek-2026";
const bucket = process.env.REPORT_FILES_BUCKET || "grantdeskhq-proto-ek-2026-report-files";
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const compilationVersion = "2026-08-10-assistance-evidence-v6";
let tokenCache: { token: string; expiresAt: number } | null = null;

export async function saveCompilation(user: AuthenticatedUser, request: CompilationRequest, result: CompilationResult) {
  const now = new Date().toISOString();
  const organizationId = `org_${user.uid}`;
  const reportId = compilationReportId(user.uid, request.requestId);
  const accessToken = await gcpToken();
  const sources = await Promise.all(request.files.map(async (file) => {
    const objectName = `${organizationId}/reports/${reportId}/sources/${file.role}-${safeName(file.name)}`;
    await uploadObject(accessToken, objectName, file);
    return { role: file.role, name: file.name, mimeType: file.mimeType, size: file.size, objectName };
  }));
  const summary = summarize(reportId, request, result, now, now);
  await writeDocument(accessToken, `organizations/${organizationId}`, {
    id: organizationId, ownerUid: user.uid, ownerEmail: user.email, name: request.organizationName, createdAt: now, updatedAt: now
  });
  const setupAudit = sanitizeSetupDecisions(request, user.uid);
  await writeDocument(accessToken, `organizations/${organizationId}/reports/${reportId}`, {
    ...summary,
    ownerUid: user.uid,
    requestId: request.requestId || "",
    compilationVersion,
    resultJson: JSON.stringify(result),
    sourcesJson: JSON.stringify(sources),
    auditJson: JSON.stringify([...setupAudit, { at: now, actorUid: user.uid, action: "compiled", detail: "Our AI-powered solution prepared the draft, then completed an independent source check and deterministic validation." }])
  });
  return { reportId, report: summary, result };
}

export async function readCompilationByRequest(user: AuthenticatedUser, requestId: string | undefined): Promise<PersistedCompilationResponse | null> {
  if (!isValidCompilationRequestId(requestId)) return null;
  const reportId = compilationReportId(user.uid, requestId);
  const response = await authorizedFetch(`${firestoreBase}/organizations/org_${user.uid}/reports/${reportId}`, await gcpToken());
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Saved report could not be checked (${response.status}).`);
  const record = decodeFields(((await response.json()) as { fields?: Record<string, FirestoreValue> }).fields || {});
  if (record.ownerUid !== user.uid || record.requestId !== requestId || record.compilationVersion !== compilationVersion || !record.resultJson) return null;
  const result = JSON.parse(String(record.resultJson)) as CompilationResult;
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
  return { reportId, report, result };
}

export function compilationReportId(userUid: string, requestId: string | undefined) {
  if (!isValidCompilationRequestId(requestId)) return `report_${randomUUID().replaceAll("-", "")}`;
  const digest = createHash("sha256").update(`${userUid}:${requestId}`).digest("hex").slice(0, 32);
  return `report_${digest}`;
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

export async function saveReview(user: AuthenticatedUser, reportId: string, result: CompilationResult, itemId: string) {
  if (!/^report_[a-f0-9]{32}$/.test(reportId)) throw new Error("Invalid report identifier.");
  const accessToken = await gcpToken();
  const path = `organizations/org_${user.uid}/reports/${reportId}`;
  const existingResponse = await authorizedFetch(`${firestoreBase}/${path}`, accessToken);
  if (!existingResponse.ok) throw new Error("Saved report was not found.");
  const existing = decodeFields(((await existingResponse.json()) as { fields: Record<string, FirestoreValue> }).fields);
  if (existing.ownerUid !== user.uid) throw new Error("Saved report was not found.");
  const now = new Date().toISOString();
  const priorAudit = JSON.parse(String(existing.auditJson || "[]")) as unknown[];
  const requestLike = { organizationName: String(existing.organizationName), grantName: String(existing.grantName), reportingPeriod: String(existing.reportingPeriod), files: [] } as CompilationRequest;
  const summary = summarize(reportId, requestLike, result, String(existing.createdAt), now, Number(existing.sourceCount || 0));
  await writeDocument(accessToken, path, {
    ...existing,
    ...summary,
    resultJson: JSON.stringify(result),
    auditJson: JSON.stringify([...priorAudit, { at: now, actorUid: user.uid, action: "review_confirmed", itemId }])
  });
  return { report: summary };
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

export async function saveBillingEvent(snapshot: BillingEventSnapshot) {
  const accessToken = await gcpToken();
  const organizationId = `org_${snapshot.uid}`;
  const eventId = safeDocumentId(snapshot.eventId);
  await writeDocument(accessToken, `organizations/${organizationId}/billingEvents/${eventId}`, { ...snapshot });
  await writeDocument(accessToken, `organizations/${organizationId}/billing/current`, { ...snapshot });
}

export async function readBillingStatus(user: AuthenticatedUser) {
  const response = await authorizedFetch(`${firestoreBase}/organizations/org_${user.uid}/billing/current`, await gcpToken());
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Billing status could not be loaded (${response.status}).`);
  const document = await response.json() as { fields?: Record<string, FirestoreValue> };
  const record = decodeFields(document.fields || {});
  return {
    plan: String(record.plan || ""),
    interval: String(record.interval || ""),
    status: String(record.status || ""),
    updatedAt: String(record.updatedAt || "")
  };
}

function summarize(id: string, request: CompilationRequest, result: CompilationResult, createdAt: string, updatedAt: string, sourceCount = request.files.length): SavedReportSummary {
  const unresolvedItems = result.qualityChecks.filter((item) => item.required && item.status !== "passed").length
    + result.validation.findings.filter((item) => item.verdict !== "source_matched").length;
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

async function writeDocument(accessToken: string, path: string, record: Record<string, unknown>) {
  const response = await authorizedFetch(`${firestoreBase}/${path}`, accessToken, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: encodeFields(record) }) });
  if (!response.ok) throw new Error(`Workspace record could not be saved (${response.status}).`);
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
