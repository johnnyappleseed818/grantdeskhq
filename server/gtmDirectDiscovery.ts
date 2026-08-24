import { createHash } from "node:crypto";
import type { DirectDiscoveryScan, GtmOpportunity, GtmSourceRegistryEntry, SignalKind } from "../src/lib/gtm.ts";
import { createDirectOutreachDraft } from "../src/lib/contactEnrichment.ts";
import { canonicalOrganizationId } from "../src/lib/gtmCanonical.ts";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";

interface SearchSource { url?: string; }
interface SearchResponse {
  output?: Array<{ action?: { type?: string; query?: string; queries?: string[]; sources?: SearchSource[] }; content?: Array<{ type?: string; text?: string; annotations?: Array<{ type?: string; url?: string }> }> }>;
  error?: { message?: string };
}
interface CandidateDraft {
  organization: string;
  organizationUrl: string;
  signalKind: "grant_announcement" | "job_posting";
  sourceUrl: string;
  sourceTitle: string;
  observedAt: string;
  evidenceSummary: string;
  whyNow: string;
  nonprofitVerified: boolean;
  contactName: string;
  contactTitle: string;
  contactRoleUrl: string;
  contactEmail: string;
  contactEmailSourceUrl: string;
}
interface DiscoveryDraft { summary: string; candidates: CandidateDraft[]; }

const schema = {
  type: "object", additionalProperties: false, required: ["summary", "candidates"], properties: {
    summary: { type: "string" },
    candidates: { type: "array", maxItems: 16, items: { type: "object", additionalProperties: false,
      required: ["organization", "organizationUrl", "signalKind", "sourceUrl", "sourceTitle", "observedAt", "evidenceSummary", "whyNow", "nonprofitVerified", "contactName", "contactTitle", "contactRoleUrl", "contactEmail", "contactEmailSourceUrl"],
      properties: {
        organization: { type: "string" }, organizationUrl: { type: "string" }, signalKind: { type: "string", enum: ["grant_announcement", "job_posting"] }, sourceUrl: { type: "string" }, sourceTitle: { type: "string" }, observedAt: { type: "string" }, evidenceSummary: { type: "string" }, whyNow: { type: "string" }, nonprofitVerified: { type: "boolean" }, contactName: { type: "string" }, contactTitle: { type: "string" }, contactRoleUrl: { type: "string" }, contactEmail: { type: "string" }, contactEmailSourceUrl: { type: "string" }
      }
    } }
  }
} as const;

export const directSourceRegistry = (now: string, statuses: Partial<Record<string, GtmSourceRegistryEntry["status"]>> = {}): GtmSourceRegistryEntry[] => [
  { name: "USAspending recent federal awards", type: "Recent award signals", mode: "PUBLIC_AUTOMATED", enabled: true, lastAttempt: now, lastSuccess: statuses["USAspending recent federal awards"] === "PASS" ? now : null, status: statuses["USAspending recent federal awards"] || "NOT_RUN" },
  { name: "Public grant and funding announcements", type: "Public web discovery", mode: "PUBLIC_SEARCH_DISCOVERY", enabled: true, lastAttempt: now, lastSuccess: statuses["Public grant and funding announcements"] === "PASS" ? now : null, status: statuses["Public grant and funding announcements"] || "NOT_RUN" },
  { name: "Public nonprofit finance and grants hiring", type: "Public web discovery", mode: "PUBLIC_SEARCH_DISCOVERY", enabled: true, lastAttempt: now, lastSuccess: statuses["Public nonprofit finance and grants hiring"] === "PASS" ? now : null, status: statuses["Public nonprofit finance and grants hiring"] || "NOT_RUN" }
];

/** Bounded discovery only. It never enriches, stages, or contacts anyone. */
export async function runDirectPublicDiscovery(input: { now?: Date; knownOrganizationIds?: Iterable<string>; priorContactOrganizationIds?: Iterable<string>; suppressedDomains?: Iterable<string> } = {}): Promise<DirectDiscoveryScan> {
  const now = input.now || new Date();
  const at = now.toISOString();
  const telemetry = {
    lastScan: at, sourcesAttempted: ["Public grant and funding announcements", "Public nonprofit finance and grants hiring"], sourcesSuccessful: [] as string[], sourceErrors: [] as string[], rawCandidatesExamined: 0, newOrganizations: 0, duplicates: 0, priorContactRemoved: 0, suppressed: 0, outsideIcpOrLowQuality: 0, qualified: 0, contactsResolvedPublicly: 0, hunterFinderCalls: 0, hunterVerifierCalls: 0, verified: 0, readyCreated: 0, stagedInInstantly: 0, mainBottleneck: "No public discovery result was returned."
  };
  const registryStatuses: Partial<Record<string, GtmSourceRegistryEntry["status"]>> = {};
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    telemetry.sourceErrors.push("OPENAI_API_KEY is not configured.");
    return { generatedAt: at, sourceRegistry: directSourceRegistry(at, registryStatuses), telemetry, opportunities: [], limitations: ["Public discovery requires the configured existing model provider."] };
  }
  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_GTM_MODEL || DEFAULT_MODEL, store: false, reasoning: { effort: "low" },
        tools: [{ type: "web_search", search_context_size: "medium", external_web_access: true }], tool_choice: "required", max_tool_calls: 8, include: ["web_search_call.action.sources"],
        input: [{ role: "system", content: [{ type: "input_text", text: "You are GrantDeskHQ's strict, source-backed nonprofit acquisition researcher. Find only recent public nonprofit grant/funding announcements and public nonprofit finance/grants job listings. Do not invent any organization, date, nonprofit status, role, person, email, URL, or pain. A public award or job is a timing signal, not proof of a reporting problem. Exclude fundraisers, pre-award grant-writing, generic finance jobs, universities, hospitals, government agencies, for-profit vendors, generic articles, and stale listings. For a named contact, use only a person/title visibly supported by an official organization page. Include a direct email only when it is visibly published on an official source; otherwise return empty strings. Do not guess email patterns." }] },
          { role: "user", content: [{ type: "input_text", text: `Today is ${at.slice(0, 10)}. Run a bounded public search for US nonprofit signals from the last 30 days. Search grant/funding announcements and job listings for Grants Manager, Director of Grants, Grant Accountant, Grant Finance Manager, Controller, Director of Finance, or Finance Manager where the actual listing mentions grant reporting, funder reporting, post-award work, grant compliance, budget-to-actual, supporting documentation, or grant financial reporting. Return at most 16 evidence-backed candidates. Every sourceUrl, organizationUrl, contactRoleUrl, and contactEmailSourceUrl you provide must be an actual public source URL found by your search; use empty strings where no official contact evidence exists.` }] }],
        text: { format: { type: "json_schema", name: "grantdeskhq_direct_public_discovery", strict: true, schema } }
      })
    });
    const body = await response.json() as SearchResponse;
    if (!response.ok) throw new Error(body.error?.message || `Public Direct discovery returned ${response.status}.`);
    const text = body.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
    if (!text) throw new Error("Public Direct discovery returned no structured output.");
    const sourceUrls = new Set(collectUrls(body).map(normalizeUrl).filter(Boolean));
    const candidates = JSON.parse(text) as DiscoveryDraft;
    telemetry.rawCandidatesExamined = candidates.candidates.length;
    registryStatuses["Public grant and funding announcements"] = "PASS";
    registryStatuses["Public nonprofit finance and grants hiring"] = "PASS";
    telemetry.sourcesSuccessful.push("Public grant and funding announcements", "Public nonprofit finance and grants hiring");
    const known = new Set(input.knownOrganizationIds || []);
    const prior = new Set(input.priorContactOrganizationIds || []);
    const suppressedDomains = new Set([...(input.suppressedDomains || [])].map((value) => value.toLowerCase()));
    const opportunities: GtmOpportunity[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates.candidates) {
      const source = canonicalUrl(candidate.sourceUrl);
      const organizationUrl = canonicalUrl(candidate.organizationUrl);
      if (!source || !organizationUrl || !sourceUrls.has(normalizeUrl(source)) || !sourceUrls.has(normalizeUrl(organizationUrl)) || !candidate.nonprofitVerified || !candidate.organization.trim() || !candidate.whyNow.trim() || !candidate.evidenceSummary.trim()) { telemetry.outsideIcpOrLowQuality++; continue; }
      const domain = domainFromUrl(organizationUrl);
      const organizationId = canonicalOrganizationId(candidate.organization, domain);
      if (seen.has(organizationId) || known.has(organizationId)) { telemetry.duplicates++; continue; }
      if (prior.has(organizationId)) { telemetry.priorContactRemoved++; continue; }
      if (!domain || suppressedDomains.has(domain)) { telemetry.suppressed++; continue; }
      seen.add(organizationId);
      const roleUrl = canonicalUrl(candidate.contactRoleUrl);
      const emailSourceUrl = canonicalUrl(candidate.contactEmailSourceUrl);
      const contactName = candidate.contactName.trim(); const contactTitle = candidate.contactTitle.trim();
      const publishedEmail = validBusinessEmail(candidate.contactEmail) && emailSourceUrl && sourceUrls.has(normalizeUrl(emailSourceUrl)) ? candidate.contactEmail.toLowerCase() : "";
      const contact = contactName && contactTitle && roleUrl && sourceUrls.has(normalizeUrl(roleUrl)) ? {
        name: contactName, title: contactTitle, email: publishedEmail, emailKind: "direct" as const, roleSourceUrl: roleUrl, emailSourceUrl: emailSourceUrl || roleUrl, verifiedAt: at, note: publishedEmail ? "Official public business email." : "Official role evidence; email must be found or verified without guessing."
      } : undefined;
      if (contact?.email) telemetry.contactsResolvedPublicly++;
      const draft = createDirectOutreachDraft({ firstName: contactName.split(/\s+/)[0] || "there", organization: candidate.organization.trim(), timingSignal: candidate.whyNow.trim() });
      opportunities.push({
        id: `public-${createHash("sha256").update(normalizeUrl(source)).digest("hex").slice(0, 18)}`,
        organization: candidate.organization.trim(), organizationUrl, signalKind: candidate.signalKind as SignalKind, headline: candidate.signalKind === "job_posting" ? "Recent grants/finance hiring signal" : "Recent public grant funding announcement", observedAt: candidate.observedAt.trim() || at.slice(0, 10), evidence: [{ id: `source-${createHash("sha256").update(normalizeUrl(source)).digest("hex").slice(0, 12)}`, title: candidate.sourceTitle.trim() || "Public source", url: source, observedAt: candidate.observedAt.trim() || at, authority: candidate.signalKind === "job_posting" ? "employer" : "official", excerpt: compact(candidate.evidenceSummary, 420), supports: ["organization", "timing signal", "why now"] }], score: { pain: 18, timing: 24, fit: 20, value: 12 }, entityVerified: true, nonprofitVerified: true, conflicts: [], unknowns: contact ? [] : ["No appropriate named contact was found on an authoritative public source."], recommendedRoles: ["Chief financial officer", "Director of finance", "Controller", "Director of grants", "Grants manager"], whyNow: compact(candidate.whyNow, 320), recommendedAngle: "Offer one award assessment without asserting that the public signal proves a reporting problem.", primaryContact: contact, emailSubject: draft.subject, draftMessage: draft.body
      });
    }
    telemetry.newOrganizations = opportunities.length; telemetry.qualified = opportunities.length;
    telemetry.mainBottleneck = opportunities.length ? opportunities.filter((item) => !item.primaryContact?.name).length ? "Some qualified organizations lack authoritative named contact evidence; they remain research-only." : "Qualified public signals and named contacts were found." : "No source-backed, in-ICP public signal passed the strict quality and identity gates.";
    return { generatedAt: at, sourceRegistry: directSourceRegistry(at, registryStatuses), telemetry, opportunities, limitations: ["This is bounded public discovery, not exhaustive market coverage.", "Public signals establish timing, not a confirmed reporting problem.", "No email is guessed, sent, or activated by discovery."] };
  } catch (error) {
    telemetry.sourceErrors.push(error instanceof Error ? error.message : "Public Direct discovery failed.");
    telemetry.mainBottleneck = "Public discovery source failed; the last successful inventory remains available.";
    registryStatuses["Public grant and funding announcements"] = "ERROR"; registryStatuses["Public nonprofit finance and grants hiring"] = "ERROR";
    return { generatedAt: at, sourceRegistry: directSourceRegistry(at, registryStatuses), telemetry, opportunities: [], limitations: ["The public Direct scan failed without changing canonical prospect or outreach state."] };
  }
}

function collectUrls(body: SearchResponse) { const urls: string[] = []; for (const item of body.output || []) { for (const source of item.action?.sources || []) if (source.url) urls.push(source.url); for (const content of item.content || []) for (const annotation of content.annotations || []) if (annotation.type === "url_citation" && annotation.url) urls.push(annotation.url); } return [...new Set(urls)]; }
function normalizeUrl(value: string) { try { const url = new URL(value); if (url.protocol !== "https:") return ""; url.hostname = url.hostname.toLowerCase().replace(/^www\./, ""); url.search = ""; url.hash = ""; return url.toString().replace(/\/$/, ""); } catch { return ""; } }
function canonicalUrl(value: string) { const normalized = normalizeUrl(value); return normalized ? `${normalized}${normalized.includes("?") ? "" : ""}` : ""; }
function domainFromUrl(value: string) { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } }
function validBusinessEmail(value: string) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim()) && !/(gmail|yahoo|hotmail|outlook)\.com$/i.test(value.trim()); }
function compact(value: string, limit: number) { const clean = value.replace(/\s+/g, " ").trim(); return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`; }
