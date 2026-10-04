// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { listGtmContactEnrichments } from "../../server/persistence.ts";

const enrichment = (id: string) => ({ id, target: { organization: `Organization ${id}`, organizationDomain: `${id}.example`, domainSourceUrl: "https://example.org", person: { firstName: "A", lastName: "Contact", fullName: "A Contact", currentTitle: "Finance Director", titleSourceUrl: "https://example.org/team" } }, providerAttempts: [], verification: { verifierStatus: "VERIFIED" }, updatedAt: "2026-10-04T00:00:00.000Z" });

describe("contact-enrichment pagination", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads later Firestore pages so provider-verified contacts cannot be stranded outside canonical readiness", async () => {
    const first = enrichment("contact-1");
    const second = enrichment("contact-2");
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes("metadata.google.internal")) return Response.json({ access_token: "test-token", expires_in: 3600 });
      if (value.includes("pageToken=contact-page-2")) return Response.json({ documents: [{ fields: { recordJson: { stringValue: JSON.stringify(second) } } }] });
      if (value.includes("gtm/contact-enrichments/records")) return Response.json({ documents: [{ fields: { recordJson: { stringValue: JSON.stringify(first) } } }], nextPageToken: "contact-page-2" });
      throw new Error(`Unexpected request: ${value}`);
    });
    vi.stubGlobal("fetch", fetch);

    await expect(listGtmContactEnrichments(150)).resolves.toEqual([first, second]);
    expect(fetch.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("gtm/contact-enrichments/records"))).toHaveLength(2);
  });
});
