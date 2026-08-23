import { createHash } from "node:crypto";
import type { DailySocialScan, DailySocialSignal, SocialPlatform } from "../src/lib/gtm.ts";
import { dailySocialScanSchema } from "./gtmDailySchema.ts";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";
const WINDOW_DAYS = 7;

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

export async function runDailySocialScan(now = new Date()): Promise<DailySocialScan> {
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
        search_context_size: "low",
        external_web_access: true,
        filters: { allowed_domains: ["reddit.com", "community.npquarterly.org", "forums.techsoup.org"] }
      }],
      tool_choice: "required",
      max_tool_calls: 6,
      include: ["web_search_call.action.sources"],
      input: [
        {
          role: "system",
          content: [{
            type: "input_text",
            text: "You are GrantDeskHQ's evidence-first market researcher. Find public, indexed discussions that reveal real post-award grant reporting work. Never invent a person, organization, quote, date, URL, complaint, or product usage. A search result is research evidence, not permission to contact anyone. Exclude grant discovery, proposal writing, fundraising, vendor promotion, generic evergreen articles, job listings, duplicated results, and posts without a clear post-award workflow connection. Summarize in your own words; do not present a paraphrase as a direct quote."
          }]
        },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: `Today is ${scanDate}. Run a bounded search for public Reddit and nonprofit-finance/community discussions published or visibly updated within the last ${WINDOW_DAYS} days. Search across: grant reporting, grant report, funder reporting, grant closeout, grant compliance, grant accountant, grant management spreadsheets, post-award grant management, budget-to-actual grant reporting, grant reporting templates, collecting program data for funders, supporting documentation for grants, manual grant reporting, grant management pain, and grant audit preparation. Prefer actual pain/questions, not generic news. Return at most ten total useful results. Use a canonical public thread URL, not a search-results URL. If date or author is not visible return "unknown". Supply a brief, grounded suggested human response; never claim the source proves the poster needs GrantDeskHQ.`
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
  return normalizeDailySocialScan(JSON.parse(outputText) as SearchDraft, sourceUrls, now, queries.length);
}

export function normalizeDailySocialScan(draft: SearchDraft, sourceUrls: string[], now = new Date(), queryCount = 0): DailySocialScan {
  const sourceIndex = new Set(sourceUrls.map(normalizeUrl).filter(Boolean));
  const observedAt = now.toISOString();
  const seen = new Set<string>();
  const items: DailySocialSignal[] = [];
  let suppressed = 0;
  for (const candidate of Array.isArray(draft.signals) ? draft.signals : []) {
    const platform = candidate.platform;
    const canonical = safeCanonicalUrl(candidate.url, platform);
    const normalized = canonical ? normalizeUrl(canonical) : "";
    if (!canonical || !normalized || !sourceIndex.has(normalized) || seen.has(normalized)) { suppressed++; continue; }
    if (!candidate.title?.trim() || !candidate.evidenceSummary?.trim() || !candidate.observedPain?.trim() || !candidate.suggestedResponse?.trim()) { suppressed++; continue; }
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
    itemsExamined: Array.isArray(draft.signals) ? draft.signals.length : 0,
    itemsQualified: items.length,
    itemsSuppressed: suppressed,
    errors: [],
    coverage: `${sourceIndex.size} indexed public discussion URL${sourceIndex.size === 1 ? "" : "s"} checked; ${items.length} result${items.length === 1 ? "" : "s"} passed the strict source and relevance gates. This is a bounded daily scan, not exhaustive coverage.`,
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
    if (platform === "forum" && host !== "community.npquarterly.org" && host !== "forums.techsoup.org") return "";
    if (platform === "reddit" && !/\/comments\//.test(url.pathname)) return "";
    if (platform === "forum" && !url.pathname.includes("/")) return "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
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
