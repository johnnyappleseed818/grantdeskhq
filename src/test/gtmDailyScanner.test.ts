import { afterEach, describe, expect, it } from "vitest";
import { HttpError, requireGtmAdmin } from "../../server/auth";
import { normalizeDailySocialScan } from "../../server/gtmDailyScanner";
import { directSourceRegistry } from "../../server/gtmDirectDiscovery";

const baseSignal = {
  platform: "reddit" as const,
  title: "Manual grant reporting in spreadsheets",
  url: "https://www.reddit.com/r/nonprofit/comments/abc123/manual_grant_reporting/",
  author: "unknown",
  publishedAt: "2026-08-05",
  evidenceSummary: "A nonprofit finance user describes manual post-award reporting work.",
  observedPain: "The accounting export must be reorganized for the funder's report.",
  painThemes: ["spreadsheet_bridge", "funder_format"],
  whyRelevant: "Direct evidence of the reporting workflow GrantDeskHQ addresses.",
  suggestedResponse: "That handoff is difficult. A source-linked first draft can reduce preparation while preserving human review."
};

describe("daily GTM social signal validation", () => {
  it("keeps only canonical post URLs returned by the web-search source list", () => {
    const forum = {
      ...baseSignal,
      platform: "forum" as const,
      title: "Grant reporting handoff",
      url: "https://forums.techsoup.org/c/grants/grant-reporting/1"
    };
    const unlisted = { ...baseSignal, title: "Unlisted", url: "https://www.reddit.com/r/nonprofit/comments/notlisted/post/" };
    const spoofed = { ...baseSignal, title: "Spoofed", url: "https://reddit.com.example.org/r/nonprofit/comments/fake/post/" };
    const scan = normalizeDailySocialScan(
      { summary: "Bounded scan", signals: [baseSignal, forum, unlisted, spoofed, baseSignal] },
      [baseSignal.url, forum.url, spoofed.url],
      new Date("2026-08-06T13:35:00.000Z"),
      4
    );
    expect(scan.items).toHaveLength(2);
    expect(scan.items.map((item) => item.platform)).toEqual(["reddit", "forum"]);
    expect(scan.items.every((item) => item.status === "ACTIONABLE")).toBe(true);
    expect(scan.itemsSuppressed).toBeGreaterThan(0);
    expect(scan.queryCount).toBe(4);
  });

  it("drops model-provided URLs that were not returned as search sources", () => {
    const scan = normalizeDailySocialScan({ summary: "No supported sources", signals: [baseSignal] }, [], new Date("2026-08-06T13:35:00.000Z"));
    expect(scan.items).toEqual([]);
  });

  it("keeps public LinkedIn only when it has a public post URL and rejects stale or pre-award noise", () => {
    const linkedIn = { ...baseSignal, platform: "linkedin" as const, url: "https://www.linkedin.com/posts/example_grant-reporting-spreadsheet-activity-123/" };
    const stale = { ...baseSignal, title: "Stale reporting pain", url: "https://www.reddit.com/r/nonprofit/comments/stale/manual_grant_reporting/", publishedAt: "2026-06-01" };
    const preAward = { ...baseSignal, title: "Grant writing opportunity", url: "https://www.reddit.com/r/nonprofit/comments/preaward/grant_writing/", observedPain: "We are applying for funding." };
    const scan = normalizeDailySocialScan({ summary: "Coverage", signals: [linkedIn, stale, preAward] }, [linkedIn.url, stale.url, preAward.url], new Date("2026-08-24T12:00:00.000Z"), 6);
    expect(scan.items).toHaveLength(1);
    expect(scan.items[0].platform).toBe("linkedin");
    expect(scan.itemsStale).toBe(1);
    expect(scan.itemsIrrelevant).toBe(1);
    expect(scan.sourceRegistry?.find((source) => source.name === "LinkedIn private groups")?.status).toBe("MANUAL");
  });

  it("records transparent bounded source registry rather than implying universal coverage", () => {
    const registry = directSourceRegistry("2026-08-24T12:00:00.000Z", { "USAspending recent federal awards": "PASS" });
    expect(registry.map((source) => source.name)).toContain("Public nonprofit finance and grants hiring");
    expect(registry.find((source) => source.name === "USAspending recent federal awards")?.status).toBe("PASS");
    expect(registry.every((source) => source.lastAttempt === "2026-08-24T12:00:00.000Z" || source.mode === "MANUAL_AUTHENTICATED")).toBe(true);
  });
});

describe("private GTM admin gate", () => {
  const original = process.env.GTM_ADMIN_EMAILS;
  afterEach(() => {
    if (original === undefined) delete process.env.GTM_ADMIN_EMAILS;
    else process.env.GTM_ADMIN_EMAILS = original;
  });

  it("allows only an explicitly configured administrator email", () => {
    process.env.GTM_ADMIN_EMAILS = "owner@grantdeskhq.com";
    const owner = { uid: "owner", email: "OWNER@grantdeskhq.com", emailVerified: false, name: "Owner" };
    expect(requireGtmAdmin(owner)).toBe(owner);
    expect(() => requireGtmAdmin({ ...owner, uid: "customer", email: "customer@example.org" })).toThrowError(HttpError);
    try { requireGtmAdmin({ ...owner, email: "customer@example.org" }); }
    catch (error) { expect((error as HttpError).statusCode).toBe(403); }
  });
});
