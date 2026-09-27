// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { listGtmChannelSeeds } from "../../server/persistence.ts";

const seed = (id: string) => ({
  id, organization: `Organization ${id}`, segment: "DIRECT", targetRoleGroup: ["CFO"], source: "test", sourceUrl: "https://example.org", observedAt: "2026-09-27T00:00:00.000Z", importedAt: "2026-09-27T00:00:00.000Z", lifecycle: "DISCOVERED", organizationDomain: null, evidenceSummary: "test", qualificationReasons: [], rejectionReason: null, enrichmentProvider: null, enrichmentResult: null, deduplicationKey: id
});

describe("channel-seed pagination", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads subsequent Firestore pages instead of stranding seeds beyond the first 100", async () => {
    const first = seed("channel_seed_aaaaaaaaaaaaaaaaaaaaaaaa");
    const second = seed("channel_seed_bbbbbbbbbbbbbbbbbbbbbbbb");
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes("metadata.google.internal")) return Response.json({ access_token: "test-token", expires_in: 3600 });
      if (value.includes("pageToken=next-page")) return Response.json({ documents: [{ fields: { recordJson: { stringValue: JSON.stringify(second) } } }] });
      if (value.includes("firestore.googleapis.com")) return Response.json({ documents: [{ fields: { recordJson: { stringValue: JSON.stringify(first) } } }], nextPageToken: "next-page" });
      throw new Error(`Unexpected request: ${value}`);
    });
    vi.stubGlobal("fetch", fetch);

    await expect(listGtmChannelSeeds(150)).resolves.toEqual([first, second]);
    expect(fetch.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("firestore.googleapis.com"))).toHaveLength(2);
  });
});
