import { createHash } from "node:crypto";
import { importGtmChannelSeeds, listGtmChannelSeeds, readGtmDailyScan, readGtmScannerImportReceipt, saveGtmDailyScan, saveGtmScannerImportReceipt, gcpToken, type GtmScannerImportReceipt } from "./persistence.ts";
import { scannerLeadFeedToChannelSeeds, scannerSocialResearchToSignals, type ScannerLeadFeedRecord, type ScannerSocialResearchRecord } from "../src/lib/gtmChannelSeeds.ts";

export const SCANNER_DRIVE_FOLDER_ID = "1zfDj-tZGTLgVtlzn8isKRCNCyprIf_h2";
const maxBatchBytes = 512_000;
type DriveFile = { id?: string; name?: string; mimeType?: string; parents?: string[]; size?: string };
export interface ScannerDriveImportFileResult { receipt: GtmScannerImportReceipt; importedNow: boolean; }

export async function importScannerDriveBatches(env: NodeJS.ProcessEnv = process.env) {
  const folderId = env.GTM_SCANNER_DRIVE_FOLDER_ID?.trim() || SCANNER_DRIVE_FOLDER_ID;
  if (folderId !== SCANNER_DRIVE_FOLDER_ID) throw new Error("Scanner Drive folder configuration does not match the approved private folder.");
  const token = await gcpToken();
  const list = await driveJson<{ files?: DriveFile[] }>(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed = false`)}&orderBy=createdTime&fields=${encodeURIComponent("files(id,name,mimeType,parents,size)")}`, token);
  const receipts: ScannerDriveImportFileResult[] = [];
  for (const item of list.files || []) {
    if (item.mimeType !== "application/json" || !item.id || !item.name?.endsWith(".json")) continue;
    const metadata = await driveJson<DriveFile>(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?fields=${encodeURIComponent("id,name,mimeType,parents,size")}`, token);
    if (metadata.mimeType !== "application/json" || !metadata.parents?.includes(folderId) || Number(metadata.size || 0) > maxBatchBytes) continue;
    const raw = await driveBytes(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media`, token);
    if (raw.byteLength > maxBatchBytes) continue;
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(Buffer.from(raw).toString("utf8")) as Record<string, unknown>; } catch { continue; }
    if (payload.schema_version !== "grantdeskhq.leadfeed.v1" || typeof payload.batch_id !== "string" || !Array.isArray(payload.records)) continue;
    const contentHash = createHash("sha256").update(raw).digest("hex");
    const receiptId = `scanner_import_${createHash("sha256").update(`${payload.batch_id}:${contentHash}`).digest("hex").slice(0, 32)}`;
    const parsed = scannerLeadFeedToChannelSeeds({ batchId: payload.batch_id, sourceFileId: item.id, contentHash, records: payload.records as ScannerLeadFeedRecord[] });
    const prior = await readGtmScannerImportReceipt(receiptId);
    if (prior) {
      receipts.push({ receipt: await immutableReconciliationReceipt({ prior, batchId: payload.batch_id, sourceFileId: item.id, contentHash, rowsSeen: payload.records.length, errors: parsed.rejected }), importedNow: false });
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
    await saveGtmScannerImportReceipt(receipt); receipts.push({ receipt, importedNow: true });
  }
  return { folderId, receipts };
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
