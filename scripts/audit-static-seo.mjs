import fs from "node:fs/promises";
import path from "node:path";

const routes = [
  ["", "GrantDeskHQ | AI-powered post-award grant reporting"],
  ["pricing", "GrantDeskHQ Pricing | Post-award reporting plans"],
  ["resources", "Post-Award Grant Reporting Resources | GrantDeskHQ"],
  ["blog", "Post-Award Grant Reporting Guidance | GrantDeskHQ"],
  ["assessment", "Free First Award | GrantDeskHQ"],
  ["contact", "Contact and Feedback | GrantDeskHQ"],
  ["demo", "GrantDeskHQ Interactive Demo | Post-award reporting workflow"],
  ["blog/post-award-grant-reporting-checklist", "A practical post-award grant reporting checklist for nonprofit finance teams | GrantDeskHQ"],
  ["blog/post-award-grant-management-software", "What to look for in post-award grant management software | GrantDeskHQ"]
];
const sitemap = await fs.readFile("public/sitemap.xml", "utf8");
const robots = await fs.readFile("public/robots.txt", "utf8");
if (!robots.includes("Sitemap: https://grantdeskhq.com/sitemap.xml")) throw new Error("robots.txt does not reference the production sitemap.");
for (const [route, title] of routes) {
  const html = await fs.readFile(path.join("dist", route, "index.html"), "utf8");
  const canonical = route ? `https://grantdeskhq.com/${route}` : "https://grantdeskhq.com/";
  if (!html.includes(`<title>${title}</title>`)) throw new Error(`${route || "/"} has no route-specific title.`);
  if (!html.includes(`rel="canonical" href="${canonical}"`)) throw new Error(`${route || "/"} has no route-specific canonical.`);
  if (!html.includes(`<meta name="twitter:title" content="${title}">`)) throw new Error(`${route || "/"} has no route-specific Twitter title.`);
  if (!html.includes('data-static-seo="true"')) throw new Error(`${route || "/"} has no static acquisition content.`);
  if (!sitemap.includes(`<loc>${canonical}</loc>`)) throw new Error(`${route || "/"} is missing from sitemap.xml.`);
}
console.log(`Static SEO audit passed for ${routes.length} public routes.`);
