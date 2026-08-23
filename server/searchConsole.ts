export const SEARCH_CONSOLE_PROPERTY = "sc-domain:grantdeskhq.com";
export const CANONICAL_SITEMAP_URL = "https://grantdeskhq.com/sitemap.xml";
import { BLOG_POSTS } from "../src/content/blog.ts";
import { gcpToken } from "./persistence.ts";
type Fetcher = (input: URL | string, init?: RequestInit) => Promise<Response>;
export interface SearchAnalyticsRow { keys: string[]; clicks: number; impressions: number; ctr: number; position: number; }
export interface SearchConsoleRange { startDate: string; endDate: string; pages: SearchAnalyticsRow[]; queries: SearchAnalyticsRow[]; }
export interface SearchConsoleState { property: string; updatedAt: string; lastSuccessfulSync: string | null; dataThrough: string | null; analyticsStatus: "PASS" | "NO_DATA_YET" | "FAIL"; ranges: Record<"last7Days" | "last28Days" | "previous28Days", SearchConsoleRange>; sitemap: { url: string; publicAccessible: boolean; canonicalUrlsPresent: boolean; submittedAt: string | null; result: "PASS" | "FAIL" | "NOT_ATTEMPTED"; error: string | null; }; errors: string[]; }
export interface SearchConsoleClient { queryAnalytics(startDate: string, endDate: string, dimensions: ("page" | "query")[]): Promise<SearchAnalyticsRow[]>; listSitemaps(): Promise<unknown>; getSitemap(sitemapUrl: string): Promise<unknown>; submitSitemap(sitemapUrl: string): Promise<void>; }
export function createSearchConsoleClient(options: { fetcher?: Fetcher; accessToken?: () => Promise<string>; property?: string } = {}): SearchConsoleClient {
 const fetcher = options.fetcher || fetch; const accessToken = options.accessToken || searchConsoleAccessToken; const property = options.property || SEARCH_CONSOLE_PROPERTY; const base = "https://searchconsole.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(property);
 async function request(path: string, init: RequestInit = {}) { const response = await fetcher(base + path, { ...init, headers: { Authorization: "Bearer " + await accessToken(), "Content-Type": "application/json", ...init.headers }, signal: AbortSignal.timeout(20_000) }); if (!response.ok) throw new Error("Search Console API request failed (" + response.status + ")."); return response.status === 204 ? null : await response.json() as unknown; }
 return { async queryAnalytics(startDate, endDate, dimensions) { const body = await request("/searchAnalytics/query", { method: "POST", body: JSON.stringify({ startDate, endDate, dimensions, rowLimit: 25000 }) }) as { rows?: SearchAnalyticsRow[] } | null; return body?.rows || []; }, listSitemaps: () => request("/sitemaps"), getSitemap: (sitemapUrl) => request("/sitemaps/" + encodeURIComponent(sitemapUrl)), submitSitemap: async (sitemapUrl) => { await request("/sitemaps/" + encodeURIComponent(sitemapUrl), { method: "PUT" }); } };
}
async function searchConsoleAccessToken() {
  const baseToken = await gcpToken();
  try {
    const identity = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email", { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5_000) });
    if (!identity.ok) return baseToken;
    const email = (await identity.text()).trim();
    const response = await fetch("https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" + encodeURIComponent(email) + ":generateAccessToken", { method: "POST", headers: { Authorization: "Bearer " + baseToken, "Content-Type": "application/json" }, body: JSON.stringify({ scope: ["https://www.googleapis.com/auth/webmasters"] }), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return baseToken;
    const body = await response.json() as { accessToken?: string };
    return body.accessToken || baseToken;
  } catch { return baseToken; }
}

export async function reconcileSearchConsole(options: { client?: SearchConsoleClient; now?: Date; fetcher?: Fetcher; sitemapUrl?: string; canonicalUrls?: readonly string[] } = {}): Promise<SearchConsoleState> {
 const now = options.now || new Date(); const client = options.client || createSearchConsoleClient(); const sitemapUrl = options.sitemapUrl || CANONICAL_SITEMAP_URL; const canonicalUrls = options.canonicalUrls || canonicalPublicAcquisitionUrls(); const ranges = dateRanges(now);
 const state: SearchConsoleState = { property: SEARCH_CONSOLE_PROPERTY, updatedAt: now.toISOString(), lastSuccessfulSync: null, dataThrough: null, analyticsStatus: "NO_DATA_YET", ranges: {} as SearchConsoleState["ranges"], sitemap: { url: sitemapUrl, publicAccessible: false, canonicalUrlsPresent: false, submittedAt: null, result: "NOT_ATTEMPTED", error: null }, errors: [] };
 try { const entries = await Promise.all(Object.entries(ranges).map(async ([key, range]) => [key, { ...range, pages: await client.queryAnalytics(range.startDate, range.endDate, ["page"]), queries: await client.queryAnalytics(range.startDate, range.endDate, ["query"]) }] as const)); state.ranges = Object.fromEntries(entries) as SearchConsoleState["ranges"]; const current = state.ranges.last28Days; state.analyticsStatus = current.pages.length || current.queries.length ? "PASS" : "NO_DATA_YET"; state.dataThrough = current.endDate; state.lastSuccessfulSync = now.toISOString(); } catch (error) { state.analyticsStatus = "FAIL"; state.errors.push(errorMessage(error)); }
 try { const sitemapResponse = await (options.fetcher || fetch)(sitemapUrl, { signal: AbortSignal.timeout(15_000) }); const text = sitemapResponse.ok ? await sitemapResponse.text() : ""; state.sitemap.publicAccessible = sitemapResponse.ok && /<urlset[\s>]/.test(text); state.sitemap.canonicalUrlsPresent = state.sitemap.publicAccessible && canonicalUrls.every((url) => text.includes("<loc>" + url + "</loc>")); if (!state.sitemap.publicAccessible || !state.sitemap.canonicalUrlsPresent) throw new Error("Canonical public sitemap is not accessible or is missing a public acquisition URL."); await client.submitSitemap(sitemapUrl); state.sitemap.submittedAt = now.toISOString(); state.sitemap.result = "PASS"; } catch (error) { state.sitemap.result = "FAIL"; state.sitemap.error = errorMessage(error); state.errors.push(state.sitemap.error); }
 return state;
}
export function searchConsoleRecommendations(state: SearchConsoleState) { if (state.analyticsStatus !== "PASS") return [{ page: null, action: "MONITOR", reason: "No Search Console data or specific technical issue is available yet." }]; return state.ranges.last28Days.pages.flatMap((row) => { const page = row.keys[0] || ""; if (row.impressions >= 20 && row.position >= 8 && row.position <= 20) return [{ page, action: "REFRESH", reason: "High impressions with average position 8-20." }]; if (row.impressions >= 20 && row.ctr < 0.02) return [{ page, action: "TITLE_META", reason: "High impressions with low CTR." }]; if (row.position >= 1 && row.position <= 5) return [{ page, action: "PROTECT_MONITOR", reason: "Average position is 1-5." }]; return [{ page, action: "MONITOR", reason: "No evidence-backed change recommendation." }]; }); }
/** Kept alongside the published article registry so sitemap validation cannot omit live SEO pages. */
export function canonicalPublicAcquisitionUrls() {
 return ["https://grantdeskhq.com/", "https://grantdeskhq.com/pricing", "https://grantdeskhq.com/resources", "https://grantdeskhq.com/blog", "https://grantdeskhq.com/assessment", "https://grantdeskhq.com/contact", ...BLOG_POSTS.map((post) => `https://grantdeskhq.com/blog/${post.slug}`)];
}
function dateRanges(now: Date) { const end = utcDate(addDays(now, -3)); return { last7Days: { startDate: utcDate(addDays(now, -9)), endDate: end }, last28Days: { startDate: utcDate(addDays(now, -30)), endDate: end }, previous28Days: { startDate: utcDate(addDays(now, -58)), endDate: utcDate(addDays(now, -31)) } }; }
function addDays(value: Date, days: number) { const copy = new Date(value); copy.setUTCDate(copy.getUTCDate() + days); return copy; }
function utcDate(value: Date) { return value.toISOString().slice(0, 10); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Search Console operation failed."; }
