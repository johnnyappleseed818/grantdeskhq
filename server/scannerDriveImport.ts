import { createHash } from "node:crypto";
import { importGtmChannelSeeds, listGtmChannelSeeds, listGtmScannerImportReceipts, readGtmDailyScan, readGtmScannerImportReceipt, saveGtmDailyScan, saveGtmScannerImportReceipt, gcpToken, type GtmScannerImportReceipt } from "./persistence.ts";
import { scannerLeadFeedToChannelSeeds, scannerSocialResearchToSignals, type ChannelSeedRecord, type ScannerLeadFeedRecord, type ScannerSocialResearchRecord } from "../src/lib/gtmChannelSeeds.ts";

export const SCANNER_DRIVE_FOLDER_ID = "1zfDj-tZGTLgVtlzn8isKRCNCyprIf_h2";
const maxBatchBytes = 512_000;
type DriveFile = { id?: string; name?: string; mimeType?: string; parents?: string[]; size?: string };
type DriveFilePage = { files?: DriveFile[]; nextPageToken?: string };
export interface ScannerDriveReceiptMirror { state: "MIRRORED" | "FAILED"; fileId: string; error: string; }
export interface ScannerDriveImportFileResult { receipt: GtmScannerImportReceipt; importedNow: boolean; mirror: ScannerDriveReceiptMirror; }
export interface ScannerReceiptProjection {
  id: string;
  batchId: string;
  sourceFileId: string;
  contentHash: string;
  processedAt: string;
  receiptKind: string;
  rowsSeen: number;
  accepted: number;
  duplicate: number;
  rejected: number;
  pending: number;
  canonicalRecordIds: string[];
  canonicalRecordsPresent: string[];
  missingCanonicalRecordIds: string[];
  rejectionReasons: Record<string, number>;
  socialEvidenceAdded: number;
  quarantined: boolean;
  quarantineReason: string | null;
}

/** A scheduler retry is safe here: the durable batch receipt is already
 * written before mirroring, so the next invocation retries only the missing
 * immutable Drive receipt and cannot reinsert a candidate or call a provider. */
export function scannerReceiptMirrorRetryRequired(receipts: readonly ScannerDriveImportFileResult[]) {
  return receipts.some((item) => item.mirror.state === "FAILED");
}

export async function importScannerDriveBatches(env: NodeJS.ProcessEnv = process.env) {
  const folderId = env.GTM_SCANNER_DRIVE_FOLDER_ID?.trim() || SCANNER_DRIVE_FOLDER_ID;
  if (folderId !== SCANNER_DRIVE_FOLDER_ID) throw new Error("Scanner Drive folder configuration does not match the approved private folder.");
  const token = await gcpToken();
  const files = await listDriveFolderFiles(folderId, token);
  const historicReceipts = await listGtmScannerImportReceipts();
  const receiptByBatchId = new Map(historicReceipts
    .filter((receipt) => receipt.receiptKind === "IMPORT" || !receipt.receiptKind)
    .map((receipt) => [receipt.batchId, receipt]));
  const receipts: ScannerDriveImportFileResult[] = [];
  for (const item of files) {
    // Private receipt mirrors share this folder but are never feed inputs.
    if (item.name?.startsWith("grantdeskhq-receipt-")) continue;
    if (item.mimeType !== "application/json" || !item.id || !item.name?.endsWith(".json")) continue;
    const metadata = await driveJson<DriveFile>(scannerDriveFileUrl(item.id, { fields: "id,name,mimeType,parents,size" }), token);
    if (metadata.mimeType !== "application/json" || !metadata.parents?.includes(folderId) || Number(metadata.size || 0) > maxBatchBytes) continue;
    const raw = await driveBytes(scannerDriveFileUrl(item.id, { alt: "media" }), token);
    if (raw.byteLength > maxBatchBytes) continue;
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(Buffer.from(raw).toString("utf8")) as Record<string, unknown>; } catch { continue; }
    if (payload.schema_version !== "grantdeskhq.leadfeed.v1" || typeof payload.batch_id !== "string" || !Array.isArray(payload.records)) continue;
    const contentHash = createHash("sha256").update(raw).digest("hex");
    const receiptId = `scanner_import_${createHash("sha256").update(`${payload.batch_id}:${contentHash}`).digest("hex").slice(0, 32)}`;
    const parsed = scannerLeadFeedToChannelSeeds({ batchId: payload.batch_id, sourceFileId: item.id, contentHash, records: payload.records as ScannerLeadFeedRecord[] });
    const prior = await readGtmScannerImportReceipt(receiptId);
    if (prior) {
      const receipt = await immutableReconciliationReceipt({ prior, batchId: payload.batch_id, sourceFileId: item.id, contentHash, rowsSeen: payload.records.length, errors: parsed.rejected });
      receipts.push({ receipt, importedNow: false, mirror: await mirrorReceiptToDrive(receipt, folderId, token) });
      continue;
    }
    const priorBatch = receiptByBatchId.get(payload.batch_id);
    if (priorBatch && priorBatch.contentHash !== contentHash) {
      const conflictId = `scanner_import_quarantined_${createHash("sha256").update(`${payload.batch_id}:${priorBatch.contentHash}:${contentHash}`).digest("hex").slice(0, 28)}`;
      const existingConflict = await readGtmScannerImportReceipt(conflictId);
      const receipt = existingConflict || buildScannerBatchConflictReceipt({ id: conflictId, prior: priorBatch, batchId: payload.batch_id, sourceFileId: item.id, contentHash, records: payload.records as ScannerLeadFeedRecord[] });
      if (!existingConflict) await saveGtmScannerImportReceipt(receipt);
      receipts.push({ receipt, importedNow: false, mirror: await mirrorReceiptToDrive(receipt, folderId, token) });
      continue;
    }
    const existing = new Set((await listGtmChannelSeeds()).map((seed) => seed.deduplicationKey));
    const social = scannerSocialResearchToSignals({ batchId: payload.batch_id, records: Array.isArray(payload.social_signals) ? payload.social_signals as ScannerSocialResearchRecord[] : [] });
    const fresh = parsed.accepted.filter((seed) => !existing.has(seed.deduplicationKey));
    const duplicate = parsed.accepted.length - fresh.length;
    const saved = await importGtmChannelSeeds(fresh);
    const socialEvidenceAdded = await preserveScannerSocialResearch(social.accepted);
    const errors = [...parsed.rejected, ...social.rejected];
    const receipt: GtmScannerImportReceipt = { id: receiptId, batchId: payload.batch_id, sourceFileId: item.id, contentHash, processedAt: new Date().toISOString(), rowsSeen: payload.records.length, accepted: saved.imported, duplicate: duplicate + saved.duplicate, rejected: errors.length, pending: saved.imported, canonicalRecordIds: fresh.map((seed) => seed.id), errors, rejectionReasons: groupRejectionReasons(errors), socialEvidenceAdded, receiptKind: "IMPORT", alreadyImported: false };
    await saveGtmScannerImportReceipt(receipt);
    receiptByBatchId.set(payload.batch_id, receipt);
    receipts.push({ receipt, importedNow: true, mirror: await mirrorReceiptToDrive(receipt, folderId, token) });
  }
  return { folderId, receipts };
}

/** Receipt export is intentionally independent of scanner import. The durable
 * Firestore receipt is the authority; this bounded retry only checks or creates
 * its deterministic Drive mirror and cannot reinsert candidates or touch a
 * contact provider. */
export async function retryScannerDriveReceiptMirrors(env: NodeJS.ProcessEnv = process.env) {
  const folderId = env.GTM_SCANNER_DRIVE_FOLDER_ID?.trim() || SCANNER_DRIVE_FOLDER_ID;
  if (folderId !== SCANNER_DRIVE_FOLDER_ID) throw new Error("Scanner Drive folder configuration does not match the approved private folder.");
  const receipts = await listGtmScannerImportReceipts();
  const limit = scannerReceiptMirrorRetryLimit(env);
  const selected = receipts.slice(0, limit);
  const token = await gcpToken();
  const results: ScannerDriveImportFileResult[] = [];
  for (const receipt of selected) results.push({ receipt, importedNow: false, mirror: await mirrorReceiptToDrive(receipt, folderId, token) });
  return { folderId, totalReceipts: receipts.length, attempted: results.length, deferred: Math.max(0, receipts.length - results.length), receipts: results };
}

export function scannerReceiptMirrorRetryLimit(env: NodeJS.ProcessEnv = process.env) {
  const configured = Number(env.GTM_SCANNER_RECEIPT_MIRROR_MAX_PER_RUN || 100);
  return Number.isInteger(configured) && configured > 0 ? Math.min(250, configured) : 100;
}

/** Scheduler-authenticated reporting projection. Receipt bindings and opaque
 * canonical IDs are exposed, but no organization, contact, email, or provider
 * payload is returned. This reads committed Firestore state, never logs. */
export function scannerReceiptProjection(receipts: ReadonlyArray<GtmScannerImportReceipt>, channelSeeds: ReadonlyArray<Pick<ChannelSeedRecord, "id">>, batchId = ""): ScannerReceiptProjection[] {
  const canonicalIds = new Set(channelSeeds.map((seed) => seed.id));
  return receipts
    .filter((receipt) => !batchId || receipt.batchId === batchId)
    .map((receipt) => {
      const ids = [...new Set(receipt.canonicalRecordIds || [])];
      const canonicalRecordsPresent = ids.filter((id) => canonicalIds.has(id));
      return {
        id: receipt.id,
        batchId: receipt.batchId,
        sourceFileId: receipt.sourceFileId,
        contentHash: receipt.contentHash,
        processedAt: receipt.processedAt,
        receiptKind: receipt.receiptKind || "IMPORT",
        rowsSeen: receipt.rowsSeen || 0,
        accepted: receipt.accepted,
        duplicate: receipt.duplicate,
        rejected: receipt.rejected,
        pending: receipt.pending,
        canonicalRecordIds: ids,
        canonicalRecordsPresent,
        missingCanonicalRecordIds: ids.filter((id) => !canonicalIds.has(id)),
        rejectionReasons: receipt.rejectionReasons || groupRejectionReasons(receipt.errors || []),
        socialEvidenceAdded: receipt.socialEvidenceAdded || 0,
        quarantined: Boolean(receipt.quarantined),
        quarantineReason: receipt.quarantineReason || null
      };
    });
}

/** Drive returns at most one page unless the caller follows nextPageToken. A
 * bounded complete folder view is required so an older file cannot hide a
 * newer immutable batch or a conflicting reuse of its batch ID. */
export async function listDriveFolderFiles(folderId: string, token: string, maximum = 2_500): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken = "";
  do {
    const page = await driveJson<DriveFilePage>(scannerDriveFolderPageUrl(folderId, pageToken), token);
    for (const item of page.files || []) {
      if (files.length >= maximum) break;
      files.push(item);
    }
    const nextPageToken = String(page.nextPageToken || "");
    if (!nextPageToken || files.length >= maximum) break;
    if (seenPageTokens.has(nextPageToken)) throw new Error("Google Drive folder pagination returned a repeated continuation token.");
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  } while (files.length < maximum);
  return files;
}

export function scannerDriveFolderPageUrl(folderId: string, pageToken = "") {
  const query = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    orderBy: "createdTime",
    pageSize: "100",
    fields: "nextPageToken,files(id,name,mimeType,parents,size)",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true"
  });
  if (pageToken) query.set("pageToken", pageToken);
  return `https://www.googleapis.com/drive/v3/files?${query}`;
}

/** The private feed may be moved into a Shared Drive because service accounts
 * cannot own files in My Drive. Every exact-file read therefore advertises
 * Shared Drive support without widening access beyond the configured parent. */
export function scannerDriveFileUrl(fileId: string, params: Record<string, string>) {
  const query = new URLSearchParams({ ...params, supportsAllDrives: "true" });
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${query}`;
}

/** A changed file claiming an already-processed batch ID is untrusted. Keep
 * both immutable byte identities and record every supplied row as quarantined;
 * it must never create new organization/contact inventory or provider work. */
export function buildScannerBatchConflictReceipt(input: { id: string; prior: GtmScannerImportReceipt; batchId: string; sourceFileId: string; contentHash: string; records: readonly ScannerLeadFeedRecord[] }): GtmScannerImportReceipt {
  const errors = input.records.map((record, index) => ({ sourceRecordKey: typeof record?.source_record_key === "string" && record.source_record_key.trim() ? record.source_record_key.trim() : `row-${index + 1}`, reason: "BATCH_ID_CONTENT_HASH_CONFLICT" }));
  return {
    id: input.id,
    batchId: input.batchId,
    sourceFileId: input.sourceFileId,
    contentHash: input.contentHash,
    processedAt: new Date().toISOString(),
    rowsSeen: input.records.length,
    accepted: 0,
    duplicate: 0,
    rejected: errors.length,
    pending: 0,
    canonicalRecordIds: [],
    errors,
    rejectionReasons: groupRejectionReasons(errors),
    receiptKind: "QUARANTINE",
    alreadyImported: true,
    quarantined: true,
    quarantineReason: "BATCH_ID_CONTENT_HASH_CONFLICT",
    conflictingReceiptId: input.prior.id
  };
}

/** Writes a compact, immutable receipt mirror to the same private folder. The
 * deterministic filename makes re-observation safe: existing mirrors are
 * reused, while a write permission failure is surfaced rather than hidden. */
export async function mirrorReceiptToDrive(receipt: GtmScannerImportReceipt, folderId: string, token: string): Promise<ScannerDriveReceiptMirror> {
  const name = `grantdeskhq-receipt-${receipt.id}.json`;
  try {
    const query = `'${folderId}' in parents and name = '${name}' and trashed = false`;
    const existingQuery = new URLSearchParams({
      q: query,
      fields: "files(id,name,mimeType,parents)",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true"
    });
    const existing = await driveJson<{ files?: DriveFile[] }>(`https://www.googleapis.com/drive/v3/files?${existingQuery}`, token);
    const prior = (existing.files || []).find((item) => item.id && item.mimeType === "application/json" && item.parents?.includes(folderId));
    if (prior?.id) return { state: "MIRRORED", fileId: prior.id, error: "" };
    const boundary = `gdh_receipt_${receipt.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const metadata = JSON.stringify({ name, mimeType: "application/json", parents: [folderId], appProperties: { grantdeskhq_receipt_id: receipt.id, grantdeskhq_receipt_kind: receipt.receiptKind || "IMPORT" } });
    const content = JSON.stringify({ schema_version: "grantdeskhq.feed-receipt.v1", receipt }, null, 2);
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    const uploadQuery = new URLSearchParams({ uploadType: "multipart", fields: "id,name,mimeType,parents", supportsAllDrives: "true" });
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files?${uploadQuery}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(safeDriveError("receipt mirror upload", response.status, await response.json().catch(() => null)));
    const created = await response.json() as DriveFile;
    if (!created.id || created.name !== name || created.mimeType !== "application/json" || !created.parents?.includes(folderId)) throw new Error("Google Drive receipt mirror upload returned invalid metadata.");
    return { state: "MIRRORED", fileId: created.id, error: "" };
  } catch (error) {
    return { state: "FAILED", fileId: "", error: error instanceof Error ? error.message : "Google Drive receipt mirror upload failed." };
  }
}

/** Older immutable receipts did not contain a row-level loss funnel. Reading
 * the same immutable bytes once writes an append-only reconciliation receipt;
 * it never reinserts candidates or mutates the original receipt. */
async function immutableReconciliationReceipt(input: { prior: GtmScannerImportReceipt; batchId: string; sourceFileId: string; contentHash: string; rowsSeen: number; errors: Array<{ sourceRecordKey: string; reason: string }> }) {
  const id = `scanner_import_reconciled_${createHash("sha256").update(`${input.prior.id}:v2`).digest("hex").slice(0, 28)}`;
  const existing = await readGtmScannerImportReceipt(id);
  if (existing) return existing;
  const receipt = buildScannerReconciliationReceipt(input);
  await saveGtmScannerImportReceipt(receipt);
  return receipt;
}

/** Pure receipt construction keeps re-observation of an old immutable batch
 * distinct from any candidate insertion. */
export function buildScannerReconciliationReceipt(input: { prior: GtmScannerImportReceipt; batchId: string; sourceFileId: string; contentHash: string; rowsSeen: number; errors: Array<{ sourceRecordKey: string; reason: string }> }): GtmScannerImportReceipt {
  const id = `scanner_import_reconciled_${createHash("sha256").update(`${input.prior.id}:v2`).digest("hex").slice(0, 28)}`;
  const errors = input.prior.errors?.length ? input.prior.errors : input.errors;
  return {
    id, batchId: input.batchId, sourceFileId: input.sourceFileId, contentHash: input.contentHash,
    processedAt: new Date().toISOString(), rowsSeen: input.rowsSeen,
    accepted: input.prior.accepted, duplicate: input.prior.duplicate, rejected: input.prior.rejected,
    pending: input.prior.pending, canonicalRecordIds: input.prior.canonicalRecordIds,
    errors, rejectionReasons: groupRejectionReasons(errors), socialEvidenceAdded: input.prior.socialEvidenceAdded,
    receiptKind: "RECONCILIATION", originalReceiptId: input.prior.id, alreadyImported: true
  };
}

function groupRejectionReasons(errors: Array<{ reason: string }>) {
  return errors.reduce<Record<string, number>>((counts, item) => {
    counts[item.reason] = (counts[item.reason] || 0) + 1;
    return counts;
  }, {});
}

async function preserveScannerSocialResearch(items: ReturnType<typeof scannerSocialResearchToSignals>["accepted"]) {
  if (!items.length) return 0;
  const prior = await readGtmDailyScan();
  const known = new Map((prior?.items || []).map((item) => [item.id, item]));
  let added = 0;
  for (const item of items) if (!known.has(item.id)) { known.set(item.id, item); added++; }
  if (!added && prior) return 0;
  const now = new Date().toISOString();
  const itemsWithResearch = [...known.values()];
  await saveGtmDailyScan(prior ? { ...prior, generatedAt: now, items: itemsWithResearch, itemsExamined: prior.itemsExamined + added, itemsRespondedSkipped: itemsWithResearch.filter((item) => item.status !== "ACTIONABLE").length, coverage: `${prior.coverage} Imported ${added} older anonymous scanner research item${added === 1 ? "" : "s"}; these are research-only and never outreach leads.` } : { generatedAt: now, windowDays: 0, queryCount: 0, sourceCount: 1, itemsExamined: added, itemsQualified: 0, itemsSuppressed: 0, itemsRespondedSkipped: added, errors: [], coverage: "Imported older anonymous scanner research evidence only.", items: itemsWithResearch, limitations: ["Imported anonymous research is retained for content/product review only and cannot create an outreach lead."] });
  return added;

}
export function safeDriveError(operation: string, status: number, body: unknown) { const error = body && typeof body === "object" ? (body as { error?: { status?: unknown; errors?: Array<{ reason?: unknown }> } }).error : null; const statusText = typeof error?.status === "string" && /^[A-Z_]+$/.test(error.status) ? error.status : "UNKNOWN"; const reason = typeof error?.errors?.[0]?.reason === "string" && /^[a-zA-Z0-9_]+$/.test(error.errors[0].reason) ? error.errors[0].reason : "unknown"; return `Google Drive ${operation} failed (${status}; ${statusText}; ${reason}).`; }
async function driveJson<T>(url: string, token: string) { const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }); if (!response.ok) throw new Error(safeDriveError("metadata request", response.status, await response.json().catch(() => null))); return response.json() as Promise<T>; }
async function driveBytes(url: string, token: string) { const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }); if (!response.ok) throw new Error(safeDriveError("media request", response.status, await response.json().catch(() => null))); return new Uint8Array(await response.arrayBuffer()); }
