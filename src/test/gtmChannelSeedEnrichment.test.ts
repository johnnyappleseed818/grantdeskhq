import { describe, expect, it } from "vitest";
import { backgroundJobFailed, backgroundJobProcessing, providerJobIsStale, providerLeadIsVerified, scannerSeedNeedsPublicContactScan, superSearchBatchLimit, superSearchEligibleSeed, superSearchProviderReferences } from "../../server/gtmChannelSeedEnrichment.ts";

describe("Instantly channel-seed enrichment reconciliation", () => {
  it("accepts Instantly's documented lead verification enum without creating a second verification job", () => {
    expect(providerLeadIsVerified({ verification_status: 1 })).toBe(true);
    expect(providerLeadIsVerified({ verification_status: 11 })).toBe(false);
    expect(providerLeadIsVerified({ verification_status: -3 })).toBe(false);
  });

  it("treats an in-progress provider job beyond the configured timeout as stale", () => {
    expect(providerJobIsStale({ enrichmentSubmittedAt: "2026-09-01T00:00:00.000Z" }, Date.parse("2026-09-01T02:00:00.000Z"), { INSTANTLY_ENRICHMENT_STALE_MS: "3600000" })).toBe(true);
    expect(providerJobIsStale({ enrichmentSubmittedAt: "2026-09-01T00:00:00.000Z" }, Date.parse("2026-09-01T00:30:00.000Z"), { INSTANTLY_ENRICHMENT_STALE_MS: "3600000" })).toBe(false);
  });

  it("keeps the provider resource and background-job identities distinct, including legacy records", () => {
    expect(superSearchProviderReferences({ enrichmentResourceId: "list_1", enrichmentOperationId: "operation_1", enrichmentBackgroundJobId: "background_1", enrichmentJobId: "background_1" })).toEqual({ resourceId: "list_1", operationId: "operation_1", backgroundJobId: "background_1" });
    expect(superSearchProviderReferences({ enrichmentResourceId: "list_legacy", enrichmentJobId: "operation_legacy" })).toEqual({ resourceId: "list_legacy", operationId: "operation_legacy", backgroundJobId: "" });
    expect(backgroundJobProcessing({ status: "queued" })).toBe(true);
    expect(backgroundJobProcessing({ status: "completed" })).toBe(false);
    expect(backgroundJobFailed({ status: "failed" })).toBe(true);
  });

  it("retries a prior no-contact scanner record only until bounded official pages have been examined", () => {
    const seed = { enrichmentTerminalAt: "2026-09-15T00:00:00.000Z", enrichmentLastProviderError: "NO_EXPLICIT_PUBLISHED_ROLE_FIT_EMAIL", scrapeGraphEvidence: { pagesExamined: ["https://example.org/"] } };
    expect(scannerSeedNeedsPublicContactScan(seed, { GTM_SCRAPEGRAPH_PAGES_PER_ORG: "3" })).toBe(true);
    expect(scannerSeedNeedsPublicContactScan({ ...seed, scrapeGraphEvidence: { pagesExamined: ["https://example.org/", "https://example.org/team", "https://example.org/contact"] } }, { GTM_SCRAPEGRAPH_PAGES_PER_ORG: "3" })).toBe(false);
  });

  it("lets independently evidence-qualified scanner organizations use the provider-backed work-email route without waiting for a public email", () => {
    expect(superSearchEligibleSeed({ organizationDomain: "example.org", source: "chatgpt_scanner_drive", lifecycle: "EVIDENCE_QUALIFIED" })).toBe(true);
    expect(superSearchEligibleSeed({ organizationDomain: "example.org", source: "chatgpt_scanner_drive", lifecycle: "ENRICHMENT_FAILED", rejectionReason: "NO_EXPLICIT_PUBLISHED_ROLE_FIT_EMAIL", enrichmentTerminalAt: "2026-09-16T00:00:00.000Z" })).toBe(true);
    expect(superSearchEligibleSeed({ organizationDomain: "", source: "chatgpt_scanner_drive", lifecycle: "EVIDENCE_QUALIFIED" })).toBe(false);
    expect(superSearchBatchLimit({})).toBe(50);
    expect(superSearchBatchLimit({ GTM_SUPERSEARCH_MAX_PER_RUN: "999" })).toBe(100);
  });
});
