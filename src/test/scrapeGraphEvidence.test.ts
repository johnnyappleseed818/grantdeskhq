import { describe, expect, it, vi } from "vitest";
import { extractPublicOrganizationEvidence, readScrapeGraphCreditBalance, scrapeGraphBudgetAllowsCall, scrapeGraphRuntimeConfiguration } from "../../server/scrapeGraphEvidence.ts";
import { verificationDisposition } from "../../server/gtmScrapeGraphEnrichment.ts";

describe("ScrapeGraphAI scanner acquisition safeguards", () => {
  it("does not attempt a provider call without both an explicit enable flag and server key", async () => {
    const request = vi.fn();
    const configuration = { ...scrapeGraphRuntimeConfiguration({ GTM_SCRAPEGRAPH_ENABLED: "false", SCRAPEGRAPH_API_KEY: "configured" }), fetcher: request };
    await expect(readScrapeGraphCreditBalance(configuration)).resolves.toMatchObject({ status: "UNAVAILABLE", errorCategory: "not_configured" });
    expect(request).not.toHaveBeenCalled();
  });

  it("uses the documented v2 endpoint and server-only SGAI header for bounded extraction", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "req_1", json: { official_website_url: "https://example.org", official_organization_name: "Example Nonprofit", evidence_summary: "Published grant reporting context.", contact_name: "Casey Finance", contact_title: "Director of Finance", contact_email: "casey@example.org" } }), { status: 200, headers: { "x-request-id": "req_1" } }));
    const result = await extractPublicOrganizationEvidence({ sourceUrl: "https://source.example/grant", organization: "Example Nonprofit", segment: "DIRECT", configuration: { ...scrapeGraphRuntimeConfiguration({ GTM_SCRAPEGRAPH_ENABLED: "true", SCRAPEGRAPH_API_KEY: "secret" }), fetcher: request } });
    expect(result).toMatchObject({ status: "FOUND", requestId: "req_1", officialOrganizationUrl: "https://example.org/", contact: { email: "casey@example.org", title: "Director of Finance" } });
    expect(request).toHaveBeenCalledWith("https://v2-api.scrapegraphai.com/api/extract", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "SGAI-APIKEY": "secret" }) }));
  });

  it("keeps the approved 100-credit headroom and rejects cumulative overuse", () => {
    expect(scrapeGraphBudgetAllowsCall({ creditsAlreadyReserved: 396, providerRemaining: 500 })).toBe(false);
    expect(scrapeGraphBudgetAllowsCall({ creditsAlreadyReserved: 390, providerRemaining: 104 })).toBe(false);
    expect(scrapeGraphBudgetAllowsCall({ creditsAlreadyReserved: 390, providerRemaining: 105 })).toBe(true);
  });

  it("does not treat request success or a catch-all as a verified email", () => {
    expect(verificationDisposition({ verification_status: "success", catch_all: false })).toBe("UNKNOWN");
    expect(verificationDisposition({ verification_status: "verified", catch_all: true })).toBe("ACCEPT_ALL");
    expect(verificationDisposition({ verification_status: "processing", catch_all: false })).toBe("PENDING");
    expect(verificationDisposition({ verification_status: "verified", catch_all: false })).toBe("VERIFIED");
  });
});
