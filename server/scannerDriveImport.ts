import { createHash } from "node:crypto";
import { importGtmChannelSeeds, listGtmChannelSeeds, readGtmDailyScan, readGtmScannerImportReceipt, saveGtmDailyScan, saveGtmScannerImportReceipt, gcpToken, type GtmScannerImportReceipt } from "./persistence.ts";
import { scannerLeadFeedToChannelSeeds, scannerSocialResearchToSignals, type ScannerLeadFeedRecord, type ScannerSocialResearchRecord } from "../src/lib/gtmChannelSeeds.ts";

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
    const receiptId = `scanner_import_${createHash("sha256").update(`${payload.batch_id}:${contentHash}`).digest("hex").slice(0, 32)}`;
    const prior = await readGtmScannerImportReceipt(receiptId);
    if (prior) { receipts.push(prior); continue; }
    const parsed = scannerLeadFeedToChannelSeeds({ batchId: payload.batch_id, sourceFileId: item.id, contentHash, records: payload.records as ScannerLeadFeedRecord[] });
    const existing = new Set((await listGtmChannelSeeds()).map((seed) => seed.deduplicationKey));
    const social = scannerSocialResearchToSignals({ batchId: payload.batch_id, records: Array.isArray(payload.social_signals) ? payload.social_signals as ScannerSocialResearchRecord[] : [] });
    const fresh = parsed.accepted.filter((seed) => !existing.has(seed.deduplicationKey));
    const duplicate = parsed.accepted.length - fresh.length;
    const saved = await importGtmChannelSeeds(fresh);
    const socialEvidenceAdded = await preserveScannerSocialResearch(social.accepted);
    const receipt: GtmScannerImportReceipt = { id: receiptId, batchId: payload.batch_id, sourceFileId: item.id, contentHash, processedAt: new Date().toISOString(), accepted: saved.imported, duplicate: duplicate + saved.duplicate, rejected: parsed.rejected.length + social.rejected.length, pending: saved.imported, canonicalRecordIds: fresh.map((seed) => seed.id), errors: [...parsed.rejected, ...social.rejected], socialEvidenceAdded };
    await saveGtmScannerImportReceipt(receipt); receipts.push(receipt);
  }
  return { folderId, receipts };
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
async function driveJson<T>(url: string, token: string) { const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }); if (!response.ok) throw new Error(`Google Drive API request failed (${response.status}).`); return response.json() as Promise<T>; }
async function driveBytes(url: string, token: string) { const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }); if (!response.ok) throw new Error(`Google Drive API media request failed (${response.status}).`); return new Uint8Array(await response.arrayBuffer()); }
