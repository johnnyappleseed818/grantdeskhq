import { describe, expect, it } from "vitest";
import { backgroundJobFailed, backgroundJobProcessing, prioritizeChannelSeedEnrichmentCandidates, providerJobIsStale, providerLeadIsVerified, scannerSeedNeedsPublicContactScan, summarizeChannelSeedLifecycle, superSearchAccessRecoveryVersion, superSearchAvailableCredits, superSearchBatchLimit, superSearchEligibleSeed, superSearchProviderReferences, superSearchSubmissionLimit } from "../../server/gtmChannelSeedEnrichment.ts";
import type { GtmScannerRecoveryCohort } from "../../server/persistence.ts";
import type { ChannelSeedRecord } from "../lib/gtmChannelSeeds.ts";

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
    expect(superSearchBatchLimit({})).toBe(10);
    expect(superSearchBatchLimit({ GTM_SUPERSEARCH_MAX_PER_RUN: "999" })).toBe(25);
    expect(superSearchSubmissionLimit(30, 7.9, {})).toBe(7);
    expect(superSearchSubmissionLimit(30, 100, { GTM_SUPERSEARCH_MAX_PER_RUN: "3" })).toBe(3);
  });

  it("uses the lead-finder allowance for a bounded recovery and does not retry a blocked generation", () => {
    expect(superSearchAvailableCredits({ plan_id_leadfinder: "pid_free", credits: [{ product: "pid_free", available_credits: 21.5 }] })).toBe(21.5);
    expect(superSearchAvailableCredits({ credits: [] })).toBeNull();
    expect(superSearchAccessRecoveryVersion({})).toBe("v1");
    const blocked = { organizationDomain: "example.org", lifecycle: "ENRICHMENT_BLOCKED", rejectionReason: "INSTANTLY_SUPERSEARCH_ACCESS_BLOCKED_HTTP_402", enrichmentAccessRecoveryVersion: "v1" };
    expect(superSearchEligibleSeed(blocked, "v1")).toBe(false);
    expect(superSearchEligibleSeed(blocked, "v2")).toBe(true);
  });

  it("uses the immutable Direct recovery cohort as a contact-lookup work order without changing eligibility", () => {
    const seeds = [
      { id: "older", segment: "DIRECT", organizationDomain: "older.example", lifecycle: "EVIDENCE_QUALIFIED" },
      { id: "cohort", segment: "DIRECT", organizationDomain: "cohort.example", lifecycle: "EVIDENCE_QUALIFIED" },
      { id: "partner", segment: "PARTNER", organizationDomain: "partner.example", lifecycle: "EVIDENCE_QUALIFIED" }
    ] as unknown as ChannelSeedRecord[];
    const cohorts = [{ id: "c", batchId: "daily-grantdeskhq-test", sourceFileId: "file", contentHash: "hash", segment: "DIRECT", canonicalRecordIds: ["cohort"], selectedAt: "2026-09-30T00:00:00.000Z", selectionBasis: "test", creationSource: "scheduler_authenticated_recovery", stateVersion: 1 }] as unknown as GtmScannerRecoveryCohort[];
    expect(prioritizeChannelSeedEnrichmentCandidates(seeds, cohorts, "DIRECT").map((seed) => seed.id)).toEqual(["cohort", "older"]);
    expect(prioritizeChannelSeedEnrichmentCandidates(seeds, cohorts, "PARTNER").map((seed) => seed.id)).toEqual(["partner"]);
  });

  it("reports redacted lifecycle and terminal reason counts by segment", () => {
    expect(summarizeChannelSeedLifecycle([
      { segment: "DIRECT", lifecycle: "ENRICHMENT_FAILED", enrichmentProviderStatus: "COMPLETED", rejectionReason: "NO_ROLE_FIT_PROVIDER_CONTACT" },
      { segment: "DIRECT", lifecycle: "ENRICHMENT_SUBMITTED", enrichmentProviderStatus: "PROCESSING", rejectionReason: null },
      { segment: "PARTNER", lifecycle: "VERIFIED", enrichmentProviderStatus: "COMPLETED", rejectionReason: null }
    ])).toEqual({
      total: 3,
      direct: { total: 2, lifecycle: { ENRICHMENT_FAILED: 1, ENRICHMENT_SUBMITTED: 1 }, providerStatus: { COMPLETED: 1, PROCESSING: 1 }, terminalReason: { NO_ROLE_FIT_PROVIDER_CONTACT: 1 } },
      partner: { total: 1, lifecycle: { VERIFIED: 1 }, providerStatus: { COMPLETED: 1 }, terminalReason: {} }
    });
  });
});
