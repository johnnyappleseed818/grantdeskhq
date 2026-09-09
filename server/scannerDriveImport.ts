import { createHash } from "node:crypto";
import { importGtmChannelSeeds, listGtmChannelSeeds, readGtmScannerImportReceipt, saveGtmScannerImportReceipt, gcpToken, type GtmScannerImportReceipt } from "./persistence.ts";
import { scannerLeadFeedToChannelSeeds, type ScannerLeadFeedRecord } from "../src/lib/gtmChannelSeeds.ts";

export const SCANNER_DRIVE_FOLDER_ID = "1zfDj-tZGTLgVtlzn8isKRCNCyprIf_h2";
const maxBatchBytes = 512_000;
type DriveFile = { id?: string; name?: string; mimeType?: string; parents?: string[]; size?: string };

export async function importScannerDriveBatches(env: NodeJS.ProcessEnv = process.env) {
  const folderId = env.GTM_SCANNER_DRIVE_FOLDER_ID?.trim() || SCANNER_DRIVE_FOLDER_ID;
  if (folderId !== SCANNER_DRIVE_FOLDER_ID) throw new Error("Scanner Drive folder configuration does not match the approved private folder.");
  const token = await gcpToken();
  const list = await driveJson<{ files?: DriveFile[] }>(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed = false`)}&orderBy=createdTime&fields=${encodeURIComponent("files(id,name,mimeType,parents,size)")}`, token);
  const receipts: GtmScannerImportReceipt[] = [];
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
    const receiptId = `scanner_import_${createHash("sha256").update(`${payload.batch_id}:${item.id}:${contentHash}`).digest("hex").slice(0, 32)}`;
    const prior = await readGtmScannerImportReceipt(receiptId);
    if (prior) { receipts.push(prior); continue; }
    const parsed = scannerLeadFeedToChannelSeeds({ batchId: payload.batch_id, sourceFileId: item.id, contentHash, records: payload.records as ScannerLeadFeedRecord[] });
    const existing = new Set((await listGtmChannelSeeds()).map((seed) => seed.deduplicationKey));
    const fresh = parsed.accepted.filter((seed) => !existing.has(seed.deduplicationKey));
    const duplicate = parsed.accepted.length - fresh.length;
    const saved = await importGtmChannelSeeds(fresh);
    const receipt: GtmScannerImportReceipt = { id: receiptId, batchId: payload.batch_id, sourceFileId: item.id, contentHash, processedAt: new Date().toISOString(), accepted: saved.imported, duplicate: duplicate + saved.duplicate, rejected: parsed.rejected.length, pending: saved.imported, canonicalRecordIds: fresh.map((seed) => seed.id), errors: parsed.rejected };
    await saveGtmScannerImportReceipt(receipt); receipts.push(receipt);
  }
  return { folderId, receipts };
}

async function driveJson<T>(url: string, token: string) { const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }); if (!response.ok) throw new Error(`Google Drive API request failed (${response.status}).`); return response.json() as Promise<T>; }
async function driveBytes(url: string, token: string) { const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }); if (!response.ok) throw new Error(`Google Drive API media request failed (${response.status}).`); return new Uint8Array(await response.arrayBuffer()); }
