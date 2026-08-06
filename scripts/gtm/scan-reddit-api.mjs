import fs from "node:fs/promises";
import path from "node:path";

const queries = [
  "grant reporting Excel",
  "QuickBooks grants spreadsheet",
  "grant expenses allocation reporting",
  "grant budget actual funder report",
  "manual grant reconciliation"
];
const communities = ["nonprofit", "nonprofittech", "grantwriters"];
const outputPath = path.resolve(process.env.REDDIT_SIGNAL_OUTPUT ?? "/tmp/grantdeskhq-reddit-scan.json");

if (process.env.REDDIT_COMMERCIAL_API_APPROVAL !== "YES") {
  throw new Error("REDDIT_COMMERCIAL_API_APPROVAL must be YES. Reddit states that commercial Data API use may require a separate agreement; do not run this monitor until access is approved.");
}

const clientId = requireEnvironment("REDDIT_CLIENT_ID");
const clientSecret = requireEnvironment("REDDIT_CLIENT_SECRET");
const userAgent = requireEnvironment("REDDIT_USER_AGENT");
const accessToken = await getAccessToken(clientId, clientSecret, userAgent);
const records = new Map();

for (const community of communities) {
  for (const query of queries) {
    const endpoint = new URL("https://oauth.reddit.com/search");
    endpoint.searchParams.set("q", `subreddit:${community} ${query}`);
    endpoint.searchParams.set("sort", "new");
    endpoint.searchParams.set("t", "year");
    endpoint.searchParams.set("type", "link");
    endpoint.searchParams.set("limit", "25");
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": userAgent } });
    if (!response.ok) throw new Error(`Reddit search failed with ${response.status}.`);
    const payload = await response.json();
    for (const child of payload.data?.children ?? []) {
      const data = child.data;
      const themes = classify(`${data.title ?? ""} ${data.selftext ?? ""}`);
      if (themes.length === 0) continue;
      records.set(data.id, {
        id: data.id,
        title: data.title,
        url: `https://www.reddit.com${data.permalink}`,
        community: `r/${data.subreddit}`,
        createdAt: new Date(data.created_utc * 1000).toISOString(),
        observedAt: new Date().toISOString(),
        score: data.score,
        commentCount: data.num_comments,
        painThemes: themes
      });
    }
  }
}

const results = [...records.values()].sort((left, right) => right.commentCount - left.commentCount || right.score - left.score);
await fs.writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(`Saved ${results.length} metadata-only Reddit signal(s) to ${outputPath}.`);
console.log("Review threads manually before adding summaries or participating. Do not automate posts, comments, or direct messages.");

async function getAccessToken(clientId, clientSecret, userAgent) {
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent
    },
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });
  if (!response.ok) throw new Error(`Reddit OAuth failed with ${response.status}.`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error("Reddit did not return an access token.");
  return payload.access_token;
}

function classify(value) {
  const text = value.toLowerCase();
  const matches = [];
  if (/excel|spreadsheet|google sheet/.test(text)) matches.push("spreadsheet_bridge");
  if (/allocat|map|categor|coding|class|restricted/.test(text)) matches.push("funder_mapping");
  if (/manual|reconcil|duplicate|copying|re-key/.test(text)) matches.push("manual_coding");
  if (/receipt|evidence|document|support/.test(text)) matches.push("missing_evidence");
  if (/program.*finance|finance.*program|handoff|separate tools/.test(text)) matches.push("fragmented_handoff");
  if (/funder report|grant report|reporting template|donor report/.test(text)) matches.push("funder_format");
  if (/free|inexpensive|affordable|small nonprofit/.test(text)) matches.push("price_sensitivity");
  return [...new Set(matches)];
}

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
