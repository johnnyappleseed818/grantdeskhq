import { chromium } from "playwright";

const base = process.argv[2];
if (!base) throw new Error("Usage: node scripts/verify-ga4-candidate.mjs <candidate-url>");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const hits = [];
let scriptLoaded = false;

function parametersFromRequest(request, name) {
  const values = [];
  const urlValue = new URL(request.url()).searchParams.get(name);
  if (urlValue) values.push(urlValue);
  const body = request.postData() || "";
  for (const match of body.matchAll(new RegExp(`(?:^|[&\\n])${name}=([^&\\n]+)`, "g"))) {
    values.push(decodeURIComponent(match[1].replace(/\+/g, " ")));
  }
  return [...new Set(values)];
}

page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.hostname === "www.googletagmanager.com" && url.pathname === "/gtag/js" && url.searchParams.get("id") === "G-P6N5EME81J") scriptLoaded = true;
  if ((url.hostname === "www.google-analytics.com" || url.hostname === "region1.google-analytics.com") && url.pathname.includes("/collect")) {
    const measurementId = parametersFromRequest(request, "tid")[0] || "";
    const path = new URL(page.url()).pathname;
    for (const event of parametersFromRequest(request, "en")) hits.push({ measurementId, event, path });
  }
});

const home = await page.goto(`${base}/`, { waitUntil: "networkidle" });
const resourcesHtml = await (await fetch(`${base}/resources`)).text();
await page.getByRole("button", { name: "Allow analytics" }).click();
await page.waitForTimeout(2_500);
await page.getByRole("link", { name: "Pricing" }).first().click();
await page.waitForTimeout(1_500);
await page.getByRole("link", { name: /Free First Award/i }).first().click();
await page.waitForTimeout(1_500);

console.log(JSON.stringify({
  homeStatus: home?.status(),
  staticResources: resourcesHtml.includes('data-static-seo="true"') && resourcesHtml.includes("Practical resources for post-award grant reporting"),
  gaScript: scriptLoaded,
  measurementIds: [...new Set(hits.map((hit) => hit.measurementId))],
  events: [...new Set(hits.map((hit) => hit.event))],
  collectionRequests: hits.length,
  duplicatePageViews: Object.entries(hits.filter((hit) => hit.event === "page_view").reduce((counts, hit) => {
    counts[hit.path] = (counts[hit.path] || 0) + 1;
    return counts;
  }, {})).filter(([, count]) => count > 1).map(([path]) => path)
}, null, 2));

await browser.close();
