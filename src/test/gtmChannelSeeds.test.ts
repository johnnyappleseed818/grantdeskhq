import { describe, expect, it } from "vitest";
import {
  buildScannerReconciliationReceipt,
  safeDriveError,
} from "../../server/scannerDriveImport.ts";
import {
  channelSeedManifest,
  channelSeedToCanonicalCandidate,
  discoveredOpportunityToChannelSeed,
  scannerLeadFeedToChannelSeeds,
  scannerSocialResearchToSignals,
  socialSignalToChannelSeed,
} from "../lib/gtmChannelSeeds.ts";

describe("2026-08-28 channel seed import", () => {
  it("creates exactly 30 deterministic organization-only seeds", () => {
    const first = channelSeedManifest("2026-08-28T00:00:00.000Z");
    const second = channelSeedManifest("2026-08-28T01:00:00.000Z");
    expect(first).toHaveLength(30);
    expect(new Set(first.map((seed) => seed.id)).size).toBe(30);
    expect(first.map((seed) => seed.id)).toEqual(second.map((seed) => seed.id));
    expect(first.filter((seed) => seed.segment === "DIRECT")).toHaveLength(20);
    expect(first.filter((seed) => seed.segment === "PARTNER")).toHaveLength(10);
  });

  it("never upgrades an unverified scan seed into a contactable candidate", () => {
    const candidate = channelSeedToCanonicalCandidate(
      channelSeedManifest()[0]!,
    );
    expect(candidate.qualified).toBe(false);
    expect(candidate.target.person.fullName).toBe("Contact research required");
    expect(candidate.blockers).toContain("NO_VERIFIED_BUSINESS_EMAIL");
  });

  it("does not upgrade a submitted provider seed into a contactable candidate", () => {
    const seed = {
      ...channelSeedManifest()[0]!,
      lifecycle: "ENRICHMENT_SUBMITTED" as const,
      enrichmentProvider: "instantly_supersearch",
      enrichmentResourceId: "resource-1",
    };
    expect(channelSeedToCanonicalCandidate(seed).blockers).toContain(
      "INSTANTLY_ENRICHMENT_PENDING",
    );
  });

  it("turns evidence-backed public organizations into deterministic enrichment-only seeds", () => {
    const direct = discoveredOpportunityToChannelSeed({
      id: "award-1",
      organization: "Example Nonprofit",
      organizationUrl: "https://example.org",
      signalKind: "grant_announcement",
      headline: "Award",
      observedAt: "2026-08-28",
      evidence: [
        {
          id: "evidence-1",
          title: "Official award",
          url: "https://example.org/award",
          observedAt: "2026-08-28",
          authority: "official",
          excerpt: "Awarded funding",
          supports: ["timing"],
        },
      ],
      score: { pain: 20, timing: 20, fit: 20, value: 20 },
      entityVerified: true,
      nonprofitVerified: true,
      conflicts: [],
      unknowns: [],
      recommendedRoles: ["Finance Director"],
      whyNow: "Recent grant award",
      recommendedAngle: "Free first award",
      emailSubject: "Grant reporting",
      draftMessage: "Hi",
    });
    expect(direct).toMatchObject({
      segment: "DIRECT",
      lifecycle: "ENRICHMENT_PENDING",
      organizationDomain: "example.org",
      source: "gtm_public_discovery",
    });
    expect(channelSeedToCanonicalCandidate(direct).qualified).toBe(true);
  });

  it("marks only independently verified partner rows eligible for provider enrichment", () => {
    const partners = channelSeedManifest().filter(
      (seed) => seed.segment === "PARTNER",
    );
    expect(
      partners.filter((seed) => seed.lifecycle === "ENRICHMENT_PENDING"),
    ).toHaveLength(5);
    expect(
      partners.filter((seed) => seed.lifecycle === "DISCOVERED"),
    ).toHaveLength(5);
    expect(
      partners.find((seed) => seed.organization === "Jitasa")
        ?.organizationDomain,
    ).toBe("jitasagroup.com");
  });
});
it("keeps Drive scanner rows discovered-only and rejects private-network source URLs", () => {
  const parsed = scannerLeadFeedToChannelSeeds({
    batchId: "daily-grantdeskhq-2026-09-09",
    sourceFileId: "drive-file",
    contentHash: "hash",
    importedAt: "2026-09-09T08:05:18.000Z",
    records: [
      {
        source_record_key: "org-a",
        segment: "DIRECT",
        organization_name: "Example Nonprofit",
        organization_domain: "example.org",
        signal_text: "Grant reporting role",
        source_urls: ["https://example.org/jobs"],
      },
      {
        source_record_key: "bad",
        segment: "DIRECT",
        organization_name: "Unsafe",
        source_urls: ["http://169.254.169.254/latest"],
      },
    ],
  });
  expect(parsed.accepted[0]).toMatchObject({
    lifecycle: "DISCOVERED",
    organizationDomain: null,
    scannerClaimedDomain: "example.org",
    scannerBatchId: "daily-grantdeskhq-2026-09-09",
    scannerFileId: "drive-file",
  });
  expect(channelSeedToCanonicalCandidate(parsed.accepted[0]!).qualified).toBe(
    false,
  );
  expect(parsed.rejected).toEqual([
    { sourceRecordKey: "bad", reason: "NO_SAFE_SOURCE_URL" },
  ]);
});

it("keeps anonymous scanner Reddit evidence out of contact discovery", () => {
  const result = scannerSocialResearchToSignals({
    batchId: "grantdeskhq-social-research-2026-09-09",
    observedAt: "2026-09-09T08:08:20.000Z",
    records: [
      {
        source_record_key: "reddit|one",
        platform: "Reddit",
        source_url: "https://www.reddit.com/r/nonprofit/comments/abc123/post",
        pain_category: "Grant tracking spreadsheets",
        evidence_excerpt: "Older discussion",
        organization_name: null,
      },
    ],
  });
  expect(result.rejected).toEqual([]);
  expect(result.accepted[0]).toMatchObject({
    platform: "reddit",
    author: "anonymous",
    status: "SKIPPED",
    publishedAt: "unknown",
  });
  expect(result.accepted[0]?.suggestedResponse).toContain("RESEARCH_ONLY");
});

it("redacts Google Drive API errors to stable classification fields", () => {
  expect(
    safeDriveError("metadata request", 403, {
      error: {
        status: "PERMISSION_DENIED",
        errors: [{ reason: "insufficientFilePermissions" }],
      },
    }),
  ).toBe(
    "Google Drive metadata request failed (403; PERMISSION_DENIED; insufficientFilePermissions).",
  );
  expect(
    safeDriveError("metadata request", 403, {
      error: { message: "private detail" },
    }),
  ).not.toContain("private detail");
});
it("routes only explicitly identified public organizations to DISCOVERED validation", () => {
  const identified = socialSignalToChannelSeed({
    id: "social-public-org",
    platform: "forum",
    title: "Grant reporting handoff",
    url: "https://forums.techsoup.org/c/grants/grant-reporting/1",
    author: "public-org-account",
    publishedAt: "2026-09-10",
    observedAt: "2026-09-10T13:35:00.000Z",
    evidenceSummary:
      "The named nonprofit describes a current grant-reporting workflow problem.",
    observedPain: "Budget-to-actual reporting requires manual reconciliation.",
    painThemes: ["spreadsheet_bridge"],
    whyRelevant: "Named organization and current post-award pain are public.",
    suggestedResponse:
      "Research only until organization and contact gates pass.",
    identifiedOrganization: "Example Community Nonprofit",
    identifiedSegment: "DIRECT",
    status: "ACTIONABLE",
  });
  expect(identified).toMatchObject({
    organization: "Example Community Nonprofit",
    segment: "DIRECT",
    lifecycle: "DISCOVERED",
    source: "social_public_identified",
    organizationDomain: null,
  });
  expect(channelSeedToCanonicalCandidate(identified!).qualified).toBe(false);

  const anonymous = socialSignalToChannelSeed({
    id: "social-anonymous",
    platform: "reddit",
    title: "Grant reporting handoff",
    url: "https://www.reddit.com/r/nonprofit/comments/abc123/grant_reporting/",
    author: "anonymous",
    publishedAt: "2026-09-10",
    observedAt: "2026-09-10T13:35:00.000Z",
    evidenceSummary:
      "A discussion names an organization, but the author is anonymous.",
    observedPain: "Manual reporting.",
    painThemes: ["spreadsheet_bridge"],
    whyRelevant: "Research only.",
    suggestedResponse: "No outreach.",
    identifiedOrganization: "Example Community Nonprofit",
    identifiedSegment: "DIRECT",
    status: "ACTIONABLE",
  });
  expect(anonymous).toBeNull();
});

it("re-observes an old immutable scanner batch without authorizing a second import", () => {
  const receipt = buildScannerReconciliationReceipt({
    prior: {
      id: "scanner_import_original",
      batchId: "daily-grantdeskhq-2026-09-09",
      sourceFileId: "1UC_8K7qJwmgsWw4n2qydiRmBrDD-mjNx",
      contentHash: "hash",
      processedAt: "2026-09-09T12:15:00.000Z",
      accepted: 28,
      duplicate: 0,
      rejected: 2,
      pending: 28,
      canonicalRecordIds: ["channel_seed_one"],
      errors: [{ sourceRecordKey: "bad-source", reason: "NO_SAFE_SOURCE_URL" }],
    },
    batchId: "daily-grantdeskhq-2026-09-09",
    sourceFileId: "1UC_8K7qJwmgsWw4n2qydiRmBrDD-mjNx",
    contentHash: "hash",
    rowsSeen: 30,
    errors: [],
  });
  expect(receipt).toMatchObject({
    rowsSeen: 30,
    accepted: 28,
    rejected: 2,
    alreadyImported: true,
    receiptKind: "RECONCILIATION",
    originalReceiptId: "scanner_import_original",
  });
  expect(receipt.rejectionReasons).toEqual({ NO_SAFE_SOURCE_URL: 1 });
});
