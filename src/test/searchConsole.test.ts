import { describe, expect, it } from "vitest";
import { canonicalPublicAcquisitionUrls, createSearchConsoleClient, reconcileSearchConsole, searchConsoleRecommendations, type SearchConsoleClient } from "../../server/searchConsole";

describe("Search Console runtime", () => {
  it("uses the official Search Console endpoints and stores zero rows as no data", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const client = createSearchConsoleClient({ accessToken: async () => "token", fetcher: async (url, init) => { calls.push({ url: String(url), method: init?.method || "GET" }); return new Response(JSON.stringify({ rows: [] }), { status: 200 }); } });
    await client.queryAnalytics("2026-08-01", "2026-08-07", ["page"]);
    await client.submitSitemap("https://grantdeskhq.com/sitemap.xml");
    expect(calls[0].url).toContain("/searchAnalytics/query");
    expect(calls[1]).toMatchObject({ method: "PUT" });
  });
  it("keeps SEO recommendations in MONITOR without search data", async () => {
    const client: SearchConsoleClient = { queryAnalytics: async () => [], listSitemaps: async () => ({}), getSitemap: async () => ({}), submitSitemap: async () => {} };
    const sitemap = `<urlset>${canonicalPublicAcquisitionUrls().map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;
    const state = await reconcileSearchConsole({ client, now: new Date("2026-08-21T12:00:00Z"), fetcher: async () => new Response(sitemap) });
    expect(state.analyticsStatus).toBe("NO_DATA_YET");
    expect(state.sitemap.result).toBe("PASS");
    expect(searchConsoleRecommendations(state)).toEqual([{ page: null, action: "MONITOR", reason: "No Search Console data or specific technical issue is available yet." }]);
  });
  it("includes every published article in sitemap validation", () => {
    expect(canonicalPublicAcquisitionUrls()).toContain("https://grantdeskhq.com/blog/post-award-grant-reporting-checklist");
    expect(canonicalPublicAcquisitionUrls()).toHaveLength(12);
  });
});
