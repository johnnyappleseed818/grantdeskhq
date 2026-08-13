import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public search discovery", () => {
  it("publishes only public canonical pages in the sitemap", () => {
    const sitemap = readProjectFile("public/sitemap.xml");
    const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);

    expect(urls).toEqual([
      "https://grantdeskhq.com/",
      "https://grantdeskhq.com/demo",
      "https://grantdeskhq.com/sample-report",
      "https://grantdeskhq.com/pricing",
      "https://grantdeskhq.com/assessment",
      "https://grantdeskhq.com/readiness",
      "https://grantdeskhq.com/privacy"
    ]);
    expect(new Set(urls).size).toBe(urls.length);
    expect(sitemap).not.toMatch(/\/(?:compile|gtm|login|workspace)<\/loc>/);
  });

  it("allows search and AI retrieval crawlers and advertises the sitemap", () => {
    const robots = readProjectFile("public/robots.txt");

    for (const agent of ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Claude-SearchBot", "Claude-User", "Applebot", "Google-Extended"]) {
      expect(robots).toContain(`User-agent: ${agent}\nAllow: /`);
    }
    expect(robots).toContain("Sitemap: https://grantdeskhq.com/sitemap.xml");
  });

  it("publishes machine-readable product, audience, and price information", () => {
    const index = readProjectFile("index.html");
    const script = index.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)?.[1];

    expect(script).toBeTruthy();
    const structuredData = JSON.parse(script ?? "{}");
    expect(structuredData).toMatchObject({
      "@type": "SoftwareApplication",
      name: "GrantDeskHQ",
      applicationSubCategory: "Post-award grant reporting software"
    });
    expect(structuredData.offers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Essentials", price: "199" }),
      expect.objectContaining({ name: "Growth", price: "399" }),
      expect.objectContaining({ name: "Portfolio", price: "699" })
    ]));
    expect(readProjectFile("public/llms.txt")).toContain("Nonprofit organizations and grant-funded teams");
  });

  it("marks authenticated and operational SPA entry points noindex", () => {
    const routeBuilder = readProjectFile("scripts/create-spa-routes.js");

    for (const route of ["compile", "login", "workspace", "gtm", "pilot"]) {
      expect(routeBuilder).toContain(`${route}: { noindex: true }`);
    }
    expect(routeBuilder).toContain("noindex, nofollow");
  });
});
