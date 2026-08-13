const origin = (process.env.GRANTDESK_SEARCH_ORIGIN || "https://grantdeskhq.com").replace(/\/$/, "");
const key = "cbb8ae4ac7f3a24c64c8697a90d9ca71";
const keyLocation = `${origin}/${key}.txt`;

const publicPaths = ["/", "/demo", "/sample-report", "/pricing", "/assessment", "/readiness", "/privacy"];
const urlList = publicPaths.map((path) => `${origin}${path === "/" ? "/" : path}`);

async function requireText(url, expected) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const body = (await response.text()).trim();
  if (expected && body !== expected) throw new Error(`${url} did not return the expected ownership key`);
  return body;
}

await requireText(keyLocation, key);
const sitemap = await requireText(`${origin}/sitemap.xml`);
for (const url of urlList) {
  if (!sitemap.includes(`<loc>${url}</loc>`)) throw new Error(`Sitemap is missing ${url}`);
}

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: new URL(origin).host,
    key,
    keyLocation,
    urlList
  })
});

if (![200, 202].includes(response.status)) {
  throw new Error(`IndexNow rejected the submission with HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
}

console.log(JSON.stringify({
  submittedAt: new Date().toISOString(),
  endpoint: "https://api.indexnow.org/indexnow",
  status: response.status,
  keyLocation,
  urlList
}, null, 2));
