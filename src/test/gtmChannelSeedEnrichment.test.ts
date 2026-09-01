import { describe, expect, it } from "vitest";
import { providerJobIsStale, providerLeadIsVerified } from "../../server/gtmChannelSeedEnrichment.ts";

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
});
