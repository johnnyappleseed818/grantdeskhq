import { createHash } from "node:crypto";
import type { DailySocialScan, DailySocialSignal, GtmSourceRegistryEntry, SocialPlatform } from "../src/lib/gtm.ts";
import { dailySocialScanSchema } from "./gtmDailySchema.ts";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";
const WINDOW_DAYS = 30;
const FORUM_HOSTS = new Set(["community.npquarterly.org", "forums.techsoup.org", "grantprofessionals.org", "www.grantprofessionals.org", "nonprofitquarterly.org"]);

function sourceRegistry(now: string, urls: string[] = [], error?: string): GtmSourceRegistryEntry[] {
  const hosts = new Set(urls.map((url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } }));
  const status = (host: string) => error ? "ERROR" as const : hosts.has(host) ? "PASS" as const : "PARTIAL" as const;
  return [
    { name: "Reddit public discussions", type: "Public discussion", mode: "PUBLIC_AUTOMATED", enabled: true, lastAttempt: now, lastSuccess: hosts.has("reddit.com") ? now : null, status: status("reddit.com"), ...(error ? { error } : {}) },
    { name: "Public nonprofit finance and grant forums", type: "Public search discovery", mode: "PUBLIC_SEARCH_DISCOVERY", enabled: true, lastAttempt: now, lastSuccess: [...hosts].some((host) => FORUM_HOSTS.has(host)) ? now : null, status: error ? "ERROR" : [...hosts].some((host) => FORUM_HOSTS.has(host)) ? "PASS" : "PARTIAL", ...(error ? { error } : {}) },
    { name: "LinkedIn public search", type: "Public search discovery", mode: "PUBLIC_SEARCH_DISCOVERY", enabled: true, lastAttempt: now, lastSuccess: hosts.has("linkedin.com") ? now : null, status: status("linkedin.com"), ...(error ? { error } : {}) },
    { name: "LinkedIn private groups", type: "Manual authenticated watchlist", mode: "MANUAL_AUTHENTICATED", enabled: false, lastAttempt: null, lastSuccess: null, status: "MANUAL" }
  ];
}

interface SearchDraft {
  summary: string;
  signals: Array<Omit<DailySocialSignal, "id" | "observedAt" | "status">>;
}

interface SearchSource {
  url?: string;
  title?: string;
}

interface OpenAIWebSearchResponse {
  output?: Array<{
    type?: string;
    action?: { type?: string; query?: string; queries?: string[]; sources?: SearchSource[] };
    content?: Array<{ type?: string; text?: string; annotations?: Array<{ type?: string; url?: string; title?: string }> }>;
  }>;
  error?: { message?: string };
}

export async function runDailySocialScan(now = new Date(), breadth: "STANDARD" | "EXPANDED" = "STANDARD"): Promise<DailySocialScan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const scanDate = now.toISOString().slice(0, 10);
  const model = process.env.OPENAI_GTM_MODEL || DEFAULT_MODEL;
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      tools: [{
        type: "web_search",
        search_context_size: "medium",
        external_web_access: true,
        filters: { allowed_domains: ["reddit.com", "community.npquarterly.org", "forums.techsoup.org", "grantprofessionals.org", "linkedin.com"] }
      }],
      tool_choice: "required",
      max_tool_calls: breadth === "EXPANDED" ? 18 : 12,
      include: ["web_search_call.action.sources"],
      input: [
        {
          role: "system",
          content: [{
            type: "input_text",
            text: "You are GrantDeskHQ's evidence-first market researcher. Discovery has high recall; qualification remains strict. Find public, indexed discussions that may reveal actual grant-management, reporting, reconciliation, compliance, deadline, documentation, or cross-team ownership pain. Never invent a person, organization, quote, date, URL, complaint, or product usage. A search result is research evidence, not permission to contact anyone. Exclude grant discovery, proposal writing, fundraising, vendor promotion, generic evergreen articles, job listings, duplicates, and pre-award-only discussions. Explicitly cover public Reddit r/nonprofit, r/grantwriters, and r/nonprofittech where accessible, plus other demonstrably relevant public subreddits. Reddit and public forums are allowed. LinkedIn is allowed only for pages discoverable by ordinary public web search; never access a login-only page or private group. Return dates as ISO YYYY-MM-DD when visible; if a thread is older than 30 days, return it only when a separately visible recent update date is supplied. Summarize in your own words; do not present a paraphrase as a direct quote."
          }]
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: `Today is ${scanDate}. Run a bounded ${breadth === "EXPANDED" ? "expanded-breadth" : "standard"} high-recall search for public Reddit, public nonprofit-finance/grant forums, and legitimately public LinkedIn discussions published or visibly updated within the last ${WINDOW_DAYS} days. Run explicit Reddit coverage for r/nonprofit, r/grantwriters, and r/nonprofittech. Search combinations including grant reporting, managing grant reporting, grant management, post-award, grant compliance, grant closeout, grant reporting software, grant management software, QBO grants, QuickBooks grants, grant budget vs actual, budget vs actual grants, grant spreadsheet, grant tracker, grant finance, grant accountant, restricted funds reporting, funder reporting, supporting documentation, grant reporting workflow, collecting program data, grant deadlines, reporting workload, and grant reporting staff. Favor pain terms such as spreadsheet, manual, hours, time consuming, workflow, deadline, reporting burden, reconcile, documentation, compliance, ownership, tool, software, recommendation, and multiple grants. Return up to ${breadth === "EXPANDED" ? 60 : 36} candidate thread/post URLs for content/context qualification. Use canonical public URLs, never search-result URLs. If date or author is not visible return "unknown". Supply a brief, helpful human response that answers first and mentions GrantDeskHQ only when genuinely relevant.`
          }]
        }
      ],
      text: { format: { type: "json_schema", name: "grantdeskhq_daily_social_scan", strict: true, schema: dailySocialScanSchema } }
    })
  });
  const body = await response.json() as OpenAIWebSearchResponse;
  if (!response.ok) throw new Error(body.error?.message || `Daily social search failed with status ${response.status}.`);
  const outputText = body.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("Daily social search returned no structured output.");
  const sourceUrls = collectSourceUrls(body);
  const queries = collectQueries(body);
  return { ...normalizeDailySocialScan(JSON.parse(outputText) as SearchDraft, sourceUrls, now, queries.length), discoveryBreadth: breadth };
}

export function normalizeDailySocialScan(draft: SearchDraft, sourceUrls: string[], now = new Date(), queryCount = 0): DailySocialScan {
  const sourceIndex = new Set(sourceUrls.map(normalizeUrl).filter(Boolean));
  const observedAt = now.toISOString();
  const seen = new Set<string>();
  const items: DailySocialSignal[] = [];
  let suppressed = 0; let stale = 0; let irrelevant = 0; let duplicate = 0;
  for (const candidate of Array.isArray(draft.signals) ? draft.signals : []) {
    const platform = candidate.platform;
    const canonical = safeCanonicalUrl(candidate.url, platform);
    const normalized = canonical ? normalizeUrl(canonical) : "";
    if (!canonical || !normalized || !sourceIndex.has(normalized)) { suppressed++; continue; }
    if (seen.has(normalized)) { suppressed++; duplicate++; continue; }
    if (!candidate.title?.trim() || !candidate.evidenceSummary?.trim() || !candidate.observedPain?.trim() || !candidate.suggestedResponse?.trim() || weakDiscussion(candidate)) { suppressed++; irrelevant++; continue; }
    if (isStale(candidate.publishedAt, now)) { suppressed++; stale++; continue; }
    seen.add(normalized);
    items.push({
      id: `social-${createHash("sha256").update(normalized).digest("hex").slice(0, 18)}`,
      platform,
      title: compact(candidate.title, 180),
      url: canonical,
      author: compact(candidate.author || "unknown", 100),
      publishedAt: compact(candidate.publishedAt || "unknown", 40),
      observedAt,
      evidenceSummary: compact(candidate.evidenceSummary, 420),
      observedPain: compact(candidate.observedPain, 300),
      painThemes: [...new Set((candidate.painThemes || []).filter((theme) => typeof theme === "string"))].slice(0, 6),
      whyRelevant: compact(candidate.whyRelevant || "Requires manual review before use.", 300),
      suggestedResponse: compact(candidate.suggestedResponse, 700),
      status: "ACTIONABLE"
    });
    if (items.length === 12) break;
  }
  return {
    generatedAt: observedAt,
    windowDays: WINDOW_DAYS,
    queryCount,
    sourceCount: sourceIndex.size,
    searchResultsReturned: sourceIndex.size,
    itemsExamined: Array.isArray(draft.signals) ? draft.signals.length : 0,
    itemsQualified: items.length,
    itemsSuppressed: suppressed,
    itemsStale: stale,
    itemsIrrelevant: irrelevant,
    itemsDuplicate: duplicate,
    itemsRespondedSkipped: 0,
    sourceRegistry: sourceRegistry(observedAt, sourceUrls),
    errors: [],
    coverage: `${sourceIndex.size} indexed public discussion URL${sourceIndex.size === 1 ? "" : "s"} checked across Reddit, public forums/web, and public LinkedIn search; ${items.length} result${items.length === 1 ? "" : "s"} passed the strict source, recency, and relevance gates. This is a bounded daily scan, not exhaustive coverage.`,
    items,
    limitations: [
      "Search indexes can omit, delay, or misdate public posts.",
      "A source-linked result describes market pain; it does not identify a contactable organization unless separately verified.",
      "No platform page is scraped, and no post, comment, message, email, or CRM record is created automatically."
    ]
  };
}

function collectSourceUrls(body: OpenAIWebSearchResponse) {
  const urls: string[] = [];
  for (const item of body.output || []) {
    for (const source of item.action?.sources || []) if (source.url) urls.push(source.url);
    for (const content of item.content || []) {
      for (const annotation of content.annotations || []) if (annotation.type === "url_citation" && annotation.url) urls.push(annotation.url);
    }
  }
  return [...new Set(urls)];
}

function collectQueries(body: OpenAIWebSearchResponse) {
  const queries: string[] = [];
  for (const item of body.output || []) {
    if (item.action?.type !== "search") continue;
    if (item.action.query) queries.push(item.action.query);
    for (const query of item.action.queries || []) queries.push(query);
  }
  return [...new Set(queries)];
}

function safeCanonicalUrl(value: string, platform: SocialPlatform) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (platform === "reddit" && host !== "reddit.com" && !host.endsWith(".reddit.com")) return "";
    if (platform === "forum" && !FORUM_HOSTS.has(host)) return "";
    if (platform === "linkedin" && host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return "";
    if (platform === "reddit" && !/\/comments\//.test(url.pathname)) return "";
    if (platform === "forum" && !url.pathname.includes("/")) return "";
    if (platform === "linkedin" && !/(\/posts\/|\/feed\/update|\/pulse\/)/.test(url.pathname)) return "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function weakDiscussion(candidate: Omit<DailySocialSignal, "id" | "observedAt" | "status">) {
  const text = `${candidate.title} ${candidate.evidenceSummary} ${candidate.observedPain}`.toLowerCase();
  const postAward = /grant report|funder report|post-award|closeout|grant compliance|budget.?to.?actual|supporting documentation|manual.*report|reporting spreadsheet|grant accountant|grant audit|financial reporting|quickbooks|\bqbo\b|restricted funds|grant tracker|multiple grants|reporting workload|who owns.*report|grant management software/.test(text);
  return !postAward || /funding opportunity|grant application|grant writing|proposal writing|webinar|sponsored|buy now/.test(text);
}

function isStale(value: string, now: Date) {
  const match = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
  const at = Date.parse(match?.[0] || value || "");
  return Number.isFinite(at) && now.getTime() - at > 30 * 24 * 60 * 60 * 1_000;
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function compact(value: string, limit: number) {
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`;
}
