import { randomUUID } from "node:crypto";
import { canGenerateReviewPackage } from "../src/lib/prototype.ts";
import type { CompilationRequest, CompilationResult, SavedReportSummary } from "../src/types/prototype.ts";
import type { DailySocialScan } from "../src/lib/gtm.ts";
import type { AuthenticatedUser } from "./auth.ts";

const projectId = process.env.GOOGLE_CLOUD_PROJECT || "grantdeskhq-proto-ek-2026";
const bucket = process.env.REPORT_FILES_BUCKET || "grantdeskhq-proto-ek-2026-report-files";
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
let tokenCache: { token: string; expiresAt: number } | null = null;

export async function saveCompilation(user: AuthenticatedUser, request: CompilationRequest, result: CompilationResult) {
  const now = new Date().toISOString();
  const organizationId = `org_${user.uid}`;
  const reportId = `report_${randomUUID().replaceAll("-", "")}`;
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
  await writeDocument(accessToken, `organizations/${organizationId}/reports/${reportId}`, {
    ...summary,
    ownerUid: user.uid,
    resultJson: JSON.stringify(result),
    sourcesJson: JSON.stringify(sources),
    auditJson: JSON.stringify([{ at: now, actorUid: user.uid, action: "compiled", detail: "AI draft compiled, independently verified and deterministically checked." }])
  });
  return { reportId, report: summary, result };
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
