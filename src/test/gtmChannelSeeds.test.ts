import { describe, expect, it } from "vitest";
import { channelSeedManifest, channelSeedToCanonicalCandidate, discoveredOpportunityToChannelSeed } from "../lib/gtmChannelSeeds.ts";

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
    const candidate = channelSeedToCanonicalCandidate(channelSeedManifest()[0]!);
    expect(candidate.qualified).toBe(false);
    expect(candidate.target.person.fullName).toBe("Contact research required");
    expect(candidate.blockers).toContain("NO_VERIFIED_BUSINESS_EMAIL");
  });

  it("does not upgrade a submitted provider seed into a contactable candidate", () => {
    const seed = { ...channelSeedManifest()[0]!, lifecycle: "ENRICHMENT_SUBMITTED" as const, enrichmentProvider: "instantly_supersearch", enrichmentResourceId: "resource-1" };
    expect(channelSeedToCanonicalCandidate(seed).blockers).toContain("INSTANTLY_ENRICHMENT_PENDING");
  });

  it("turns evidence-backed public organizations into deterministic enrichment-only seeds", () => {
    const direct = discoveredOpportunityToChannelSeed({ id: "award-1", organization: "Example Nonprofit", organizationUrl: "https://example.org", signalKind: "grant_announcement", headline: "Award", observedAt: "2026-08-28", evidence: [{ id: "evidence-1", title: "Official award", url: "https://example.org/award", observedAt: "2026-08-28", authority: "official", excerpt: "Awarded funding", supports: ["timing"] }], score: { pain: 20, timing: 20, fit: 20, value: 20 }, entityVerified: true, nonprofitVerified: true, conflicts: [], unknowns: [], recommendedRoles: ["Finance Director"], whyNow: "Recent grant award", recommendedAngle: "Free first award", emailSubject: "Grant reporting", draftMessage: "Hi" });
    expect(direct).toMatchObject({ segment: "DIRECT", lifecycle: "ENRICHMENT_PENDING", organizationDomain: "example.org", source: "gtm_public_discovery" });
    expect(channelSeedToCanonicalCandidate(direct).qualified).toBe(true);
  });

  it("marks only independently verified partner rows eligible for provider enrichment", () => {
    const partners = channelSeedManifest().filter((seed) => seed.segment === "PARTNER");
    expect(partners.filter((seed) => seed.lifecycle === "ENRICHMENT_PENDING")).toHaveLength(5);
    expect(partners.filter((seed) => seed.lifecycle === "DISCOVERED")).toHaveLength(5);
    expect(partners.find((seed) => seed.organization === "Jitasa")?.organizationDomain).toBe("jitasagroup.com");
  });
});
