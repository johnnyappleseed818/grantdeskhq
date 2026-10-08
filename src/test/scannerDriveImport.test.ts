import { describe, expect, it } from "vitest";
import { scannerReceiptProjection } from "../../server/scannerDriveImport.ts";
import type { GtmScannerImportReceipt } from "../../server/persistence.ts";
import type { ChannelSeedRecord } from "../lib/gtmChannelSeeds.ts";

const receipt: GtmScannerImportReceipt = {
  id: "scanner_import_test", batchId: "batch-test", sourceFileId: "drive-test", contentHash: "a".repeat(64), processedAt: "2026-10-08T00:00:00.000Z",
  rowsSeen: 2, accepted: 1, duplicate: 1, rejected: 1, pending: 1, canonicalRecordIds: ["seed-accepted"],
  errors: [{ sourceRecordKey: "social-rejected", reason: "UNSUPPORTED_SOCIAL_PLATFORM" }],
  rejectionReasons: { UNSUPPORTED_SOCIAL_PLATFORM: 1 }, socialEvidenceAdded: 1, socialCandidatesCreated: 0, socialCandidateDuplicate: 0,
  receiptKind: "IMPORT", alreadyImported: false
};

const seed = { id: "seed-accepted", segment: "DIRECT", lifecycle: "ENRICHMENT_FAILED", rejectionReason: "NO_ROLE_FIT_VERIFIED_PROVIDER_CONTACT", scannerSourceRecordKey: "org-accepted" } as ChannelSeedRecord;

describe("scanner receipt reporting projection", () => {
  it("separates committed organization and social outcomes without contacts or source URLs", () => {
    const [projected] = scannerReceiptProjection([receipt], [seed], [{ id: "signal-1", platform: "reddit", status: "SKIPPED", scannerBatchId: "batch-test", scannerSourceRecordKey: "social-accepted" }]);
    expect(projected.organizationCounts).toEqual({ seen: 2, accepted: 1, duplicate: 1, rejected: 0 });
    expect(projected.socialCounts).toEqual({ seen: 2, stored: 1, rejected: 1, candidateCreated: 0, candidateDuplicate: 0 });
    expect(projected.organizationOutcomes).toEqual([{ sourceRecordKey: "org-accepted", canonicalRecordId: "seed-accepted", segment: "DIRECT", state: "ENRICHMENT_FAILED", reason: "NO_ROLE_FIT_VERIFIED_PROVIDER_CONTACT" }]);
    expect(projected.socialOutcomes).toEqual([{ sourceRecordKey: "social-accepted", socialRecordId: "signal-1", platform: "reddit", state: "SKIPPED" }]);
    expect(projected.socialRejections).toEqual([{ sourceRecordKey: "social-rejected", reason: "UNSUPPORTED_SOCIAL_PLATFORM" }]);
    expect(JSON.stringify(projected)).not.toMatch(/email|sourceUrl|organizationName/i);
  });
});
