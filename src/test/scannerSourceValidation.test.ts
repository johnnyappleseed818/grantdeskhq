import { describe, expect, it } from "vitest";
import { hunterFailureStopsValidation, hunterUsageAllowsDomainLookup, scannerEvidenceBackedIdentity, scannerValidationDue, sourceProvesOrganizationDomain } from "../../server/scannerSourceValidation.ts";
import { extractedContactSourceForVerification, independentOfficialSourceCandidates, nextScrapeGraphReservedCredits, prioritizeScannerValidationCandidates, requiresIndependentPublicValidation, selectScannerDirectRecoveryCohort } from "../../server/scannerScrapeGraphValidation.ts";
import { DALLAS_FOUNDATION_2026_SUMMER_AWARD_URL, attachScannerSupplementalIdentityEvidence, scannerSupplementalIdentitySourceKey } from "../../server/scannerDallasFoundationIdentityEvidence.ts";
import type { ChannelSeedRecord } from "../lib/gtmChannelSeeds.ts";

const seed = (hint: string, segment: "DIRECT" | "PARTNER" = "PARTNER"): ChannelSeedRecord => ({
  id: "scanner-test", organization: "Example Nonprofit Finance", segment,
  targetRoleGroup: [], source: "chatgpt_scanner_drive", sourceUrl: "https://example.org/team",
  observedAt: "2026-09-09", importedAt: "2026-09-09", lifecycle: "DISCOVERED", organizationDomain: null,
  evidenceSummary: "Research claim", qualificationReasons: [], rejectionReason: null, enrichmentProvider: null,
  enrichmentResult: null, deduplicationKey: "PARTNER:example", scannerUnknownFields: { role_or_public_identity_text: hint }
});

describe("scanner source identity gate", () => {
  it("permits Hunter only when an organization-controlled source confirms the named role", () => {
    expect(scannerEvidenceBackedIdentity(seed("Avery Grant, Founder and CEO"), "# Leadership\nAvery Grant\nFounder and CEO")).toMatchObject({ fullName: "Avery Grant", title: "Founder and CEO" });
  });

  it("does not treat an untrusted scanner hint or unsupported role as verified identity evidence", () => {
    expect(scannerEvidenceBackedIdentity(seed("Avery Grant, Founder and CEO"), "# Leadership\nNo named leaders listed")).toBeNull();
    expect(scannerEvidenceBackedIdentity(seed("Avery Grant, Volunteer Coordinator"), "Avery Grant\nVolunteer Coordinator")).toBeNull();
  });
});
describe("scanner source domain gate", () => {
  it("requires a claimed organization domain matching the source before Hunter can use scanner identity", () => {
    expect(sourceProvesOrganizationDomain({ sourceUrl: "https://example.org/team", scannerClaimedDomain: "example.org" })).toBe(true);
    expect(sourceProvesOrganizationDomain({ sourceUrl: "https://industry-directory.example/listing", scannerClaimedDomain: "example.org" })).toBe(false);
    expect(sourceProvesOrganizationDomain({ sourceUrl: "https://example.org/team", scannerClaimedDomain: null })).toBe(false);
  });
});

describe("scanner validation recovery", () => {
  const now = "2026-09-15T14:00:00.000Z";

  it("retries a legacy deferred scanner record once, then records a durable disposition", () => {
    const legacy = { ...seed(""), lifecycle: "ROLE_UNRESOLVED" as const, rejectionReason: "SOURCE_CLAIM_NOT_INDEPENDENTLY_VERIFIED" };
    expect(scannerValidationDue(legacy, now, {})).toBe(true);
    const deferred = {
      ...legacy,
      validationDisposition: "DEFERRED" as const,
      validationAttemptCount: 1,
      validationNextAttemptAt: "2026-09-15T14:30:00.000Z"
    };
    expect(scannerValidationDue(deferred, now, {})).toBe(false);
    expect(scannerValidationDue(deferred, "2026-09-15T14:30:00.000Z", {})).toBe(true);
  });

  it("does not retry terminal validation rejections or exceed the bounded retry count", () => {
    const rejected = { ...seed(""), lifecycle: "REJECTED" as const, validationDisposition: "REJECTED" as const };
    expect(scannerValidationDue(rejected, now, {})).toBe(false);
    const exhausted = {
      ...seed(""),
      lifecycle: "ROLE_UNRESOLVED" as const,
      validationDisposition: "DEFERRED" as const,
      validationAttemptCount: 3
    };
    expect(scannerValidationDue(exhausted, now, {})).toBe(false);
  });
  it("stops the batch after a provider throttle or exhausted allowance rather than repeating paid discovery calls", () => {
    expect(hunterFailureStopsValidation("rate_limited")).toBe(true);
    expect(hunterFailureStopsValidation("limit_reached")).toBe(true);
    expect(hunterFailureStopsValidation("provider_error")).toBe(false);
  });

  it("requires one whole Hunter search credit before calling Domain Finder", () => {
    expect(hunterUsageAllowsDomainLookup(0.5)).toBe(false);
    expect(hunterUsageAllowsDomainLookup(1)).toBe(true);
  });

  it("accumulates ScrapeGraphAI retry credits instead of resetting the durable budget", () => {
    expect(nextScrapeGraphReservedCredits(5, 5)).toBe(10);
    expect(nextScrapeGraphReservedCredits(10, 5)).toBe(15);
  });

  it("uses an independently supplied official domain before the optional ScrapeGraphAI fallback", () => {
    const record = { ...seed("", "DIRECT"), scannerClaimedDomain: "example.org", sourceUrl: "https://public-funder.example/award/example" };
    expect(requiresIndependentPublicValidation(record)).toBe(true);
    expect(independentOfficialSourceCandidates(record).map((url) => url.hostname)).toEqual(["example.org"]);
  });

  it("accepts extracted contact evidence only from the resolved official domain, never the discovery source", () => {
    expect(extractedContactSourceForVerification({ sourceUrl: "https://example.org/about/team" }, "example.org")?.hostname).toBe("example.org");
    expect(extractedContactSourceForVerification({ sourceUrl: "https://public-funder.example/award" }, "example.org")).toBeNull();
  });

  it("does not route provider-discovered candidates through the scanner fallback", () => {
    expect(requiresIndependentPublicValidation({ source: "gtm_public_discovery" })).toBe(false);
    expect(requiresIndependentPublicValidation({ source: "usaspending_award" })).toBe(true);
    expect(requiresIndependentPublicValidation({ source: "social_public_identified" })).toBe(true);
  });

  it("selects a deterministic Direct work-order from a committed batch without treating priority as qualification", () => {
    const batchId = "daily-grantdeskhq-2026-09-29-fixed-cohort";
    const records = Array.from({ length: 12 }, (_, index) => ({
      ...seed("", "DIRECT"), id: `direct-${String(index).padStart(2, "0")}`,
      scannerBatchId: batchId,
      scannerClaimedDomain: index < 2 ? "example.org" : null,
      evidenceSummary: index < 2 ? "Public grant reporting and restricted fund evidence" : "Research claim"
    }));
    const selected = selectScannerDirectRecoveryCohort(records, batchId, records.map((record) => record.id));
    expect(selected).toHaveLength(10);
    expect(selected.slice(0, 2).map((record) => record.id)).toEqual(["direct-00", "direct-01"]);
    expect(selected.every((record) => record.lifecycle === "DISCOVERED")).toBe(true);
  });

  it("prioritizes one post-cohort evidence attempt even after an older attempt, but does not starve normal retry work", () => {
    const now = "2026-09-15T14:00:00.000Z";
    const selectedAt = "2026-09-15T13:00:00.000Z";
    const cohort = { ...seed("", "DIRECT"), id: "cohort-first", scannerBatchId: "daily-grantdeskhq-2026-09-29-fixed-cohort", lifecycle: "ROLE_UNRESOLVED" as const, validationDisposition: "DEFERRED" as const, validationAttemptCount: 1, validationLastAttemptAt: "2026-09-15T12:00:00.000Z", validationNextAttemptAt: now };
    const global = { ...seed("", "DIRECT"), id: "global-first", scannerBatchId: "daily-other" };
    const retry = { ...seed("", "DIRECT"), id: "cohort-retry", scannerBatchId: cohort.scannerBatchId, lifecycle: "ROLE_UNRESOLVED" as const, validationDisposition: "DEFERRED" as const, validationAttemptCount: 1, validationLastAttemptAt: now, validationNextAttemptAt: now };
    const cohorts = [{ id: "fixed", batchId: cohort.scannerBatchId!, sourceFileId: "file", contentHash: "hash", segment: "DIRECT" as const, canonicalRecordIds: [cohort.id, retry.id], selectedAt, selectionBasis: "test", creationSource: "scheduler_authenticated_recovery" as const, stateVersion: 1 as const }];
    expect(prioritizeScannerValidationCandidates([global, retry, cohort], cohorts, now).map((record) => record.id)).toEqual(["cohort-first", "global-first", "cohort-retry"]);
  });

  it("processes independently resolvable official domains before ScrapeGraphAI-dependent recovery work", () => {
    const now = "2026-09-15T14:00:00.000Z";
    const fallbackOnly = { ...seed("", "DIRECT"), id: "cohort-fallback", scannerBatchId: "daily-fixed" };
    const independent = {
      ...seed("", "DIRECT"), id: "independent-domain", scannerBatchId: "daily-other",
      sourceUrl: "https://public-funder.example/award/example", scannerClaimedDomain: "example.org"
    };
    const cohorts = [{ id: "fixed", batchId: "daily-fixed", sourceFileId: "file", contentHash: "hash", segment: "DIRECT" as const, canonicalRecordIds: [fallbackOnly.id], selectedAt: "2026-09-15T13:00:00.000Z", selectionBasis: "test", creationSource: "scheduler_authenticated_recovery" as const, stateVersion: 1 as const }];
    expect(prioritizeScannerValidationCandidates([fallbackOnly, independent], cohorts, now).map((record) => record.id)).toEqual(["independent-domain", "cohort-fallback"]);
  });

  it("attaches October 7 supplemental identity evidence only to its immutable Direct source record", () => {
    const record = {
      ...seed("", "DIRECT"),
      organization: "Living for Zachary",
      scannerBatchId: "0948d4f4-a261-40ed-b6e9-9434244558d4",
      scannerSourceRecordKey: scannerSupplementalIdentitySourceKey("Living for Zachary"),
      sourceUrl: DALLAS_FOUNDATION_2026_SUMMER_AWARD_URL
    };
    const attached = attachScannerSupplementalIdentityEvidence(record);
    expect(attached.scannerSupplementalIdentityEvidence).toMatchObject({ proposedDomain: "livingforzachary.org", originalOrganizationName: "Living for Zachary" });
    expect(independentOfficialSourceCandidates(attached).map((candidate) => candidate.hostname.replace(/^www\./, ""))).toContain("livingforzachary.org");
    expect(attachScannerSupplementalIdentityEvidence({ ...record, scannerSourceRecordKey: "wrong-key" }).scannerSupplementalIdentityEvidence).toBeUndefined();
    expect(attachScannerSupplementalIdentityEvidence({ ...record, scannerBatchId: "other-batch" }).scannerSupplementalIdentityEvidence).toBeUndefined();
  });
});
