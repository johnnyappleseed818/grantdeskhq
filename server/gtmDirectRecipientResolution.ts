import { createHash } from "node:crypto";
import type { DirectRecipientResolution, GtmOpportunity } from "../src/lib/gtm.ts";
import { createDirectOutreachDraft, hasAppropriateDirectRecipientTitle } from "../src/lib/contactEnrichment.ts";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";

type ContactSource = DirectRecipientResolution["contactSource"];
interface SearchResponse { output?: Array<{ action?: { sources?: Array<{ url?: string }> }; content?: Array<{ type?: string; text?: string; annotations?: Array<{ url?: string }> }> }>; error?: { message?: string }; }
export interface RecipientDraft { organization: string; officialOrganizationUrl: string; recipientFound: boolean; contactName: string; contactTitle: string; roleSourceUrl: string; responsibilityEvidence: string; contactEmail: string; contactEmailSourceUrl: string; executiveFallbackReview: boolean; blocker: string; }
interface ResolutionDraft { resolutions: RecipientDraft[]; }

const schema = {
  type: "object", additionalProperties: false, required: ["resolutions"], properties: {
    resolutions: { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false,
      required: ["organization", "officialOrganizationUrl", "recipientFound", "contactName", "contactTitle", "roleSourceUrl", "responsibilityEvidence", "contactEmail", "contactEmailSourceUrl", "executiveFallbackReview", "blocker"],
      properties: {
        organization: { type: "string" }, officialOrganizationUrl: { type: "string" }, recipientFound: { type: "boolean" }, contactName: { type: "string" }, contactTitle: { type: "string" }, roleSourceUrl: { type: "string" }, responsibilityEvidence: { type: "string" }, contactEmail: { type: "string" }, contactEmailSourceUrl: { type: "string" }, executiveFallbackReview: { type: "boolean" }, blocker: { type: "string" }
      }
    } }
  }
} as const;

export interface DirectRecipientResolutionRun {
  generatedAt: string;
  opportunities: GtmOpportunity[];
  resolutions: DirectRecipientResolution[];
  errors: string[];
}

/** Bounded authoritative-recipient research. It never calls Hunter or sends. */
export async function resolveDirectRecipients(input: { opportunities: readonly GtmOpportunity[]; now?: Date }): Promise<DirectRecipientResolutionRun> {
  const now = input.now || new Date();
  const generatedAt = now.toISOString();
  const eligible = input.opportunities.filter((item) => item.entityVerified && item.nonprofitVerified && !item.conflicts.length).slice(0, 12);
  if (!eligible.length) return { generatedAt, opportunities: [...input.opportunities], resolutions: [], errors: [] };
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return unresolved(input.opportunities, "Recipient discovery provider is not configured.", generatedAt);
  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_GTM_MODEL || DEFAULT_MODEL, store: false, reasoning: { effort: "low" },
        tools: [{ type: "web_search", search_context_size: "medium", external_web_access: true }], tool_choice: "required", max_tool_calls: 10, include: ["web_search_call.action.sources"],
        input: [
          { role: "system", content: [{ type: "input_text", text: "You are a strict nonprofit recipient researcher. Work only from public, authoritative evidence. For each organization, establish its official website/domain first, then search official staff, finance/accounting, grants, leadership, annual/audited report PDFs, careers, and press pages for a named operating owner. Suitable roles: CFO/Chief Financial Officer/Chief Finance Officer, VP Finance, Finance Director/Director of Finance, Controller/Comptroller, Finance and Operations, Director/Accounting Director, Director/Manager/Administrator of Grants, Grants and Contracts, Grant Finance, Grant Accountant, Grant Compliance, or Post-Award. Operations titles are acceptable only when the official evidence explicitly connects the person to finance, grants, compliance, accounting, post-award, restricted funds, budgets, or contracts. Do not select CEO/Executive Director as a normal recipient; return executiveFallbackReview true only after no operating owner is found and official evidence supports administrative oversight. Never guess an email. Include a business email only when published by the organization on its official page/PDF. Every URL must be an actual source found by the search. Do not use job boards, directories, social profiles, or a third-party announcement as the official organization URL." }] },
          { role: "user", content: [{ type: "input_text", text: `Today is ${generatedAt.slice(0, 10)}. Resolve one suitable finance or grants operating recipient for each of these existing qualified nonprofit signals. Preserve the signals; do not discover new organizations. Use targeted domain queries equivalent to site:domain CFO, Finance Director, Controller, Director of Grants, Grants Manager, grants/contracts, grant compliance, post-award, annual report, and staff PDF. Return one exact resolution per organization, including a concrete blocker when none is supported. Organizations:\n${eligible.map((item) => `- ${item.organization}; current signal: ${item.whyNow}; existing source: ${item.evidence[0]?.url || item.organizationUrl}`).join("\n")}` }] }
        ],
        text: { format: { type: "json_schema", name: "grantdeskhq_direct_recipient_resolution", strict: true, schema } }
      })
    });
    const body = await response.json() as SearchResponse;
    if (!response.ok) throw new Error(body.error?.message || `Recipient discovery returned ${response.status}.`);
    const output = body.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
    if (!output) throw new Error("Recipient discovery returned no structured output.");
    return applyRecipientResolutions(input.opportunities, (JSON.parse(output) as ResolutionDraft).resolutions, collectUrls(body), generatedAt);
  } catch (error) {
    return unresolved(input.opportunities, error instanceof Error ? error.message : "Recipient discovery failed.", generatedAt);
  }
}

export function applyRecipientResolutions(opportunities: readonly GtmOpportunity[], drafts: readonly RecipientDraft[], sourceUrls: readonly string[], generatedAt = new Date().toISOString()): DirectRecipientResolutionRun {
  const sources = new Set(sourceUrls.map(normalizeUrl).filter(Boolean));
  const byOrganization = new Map(drafts.map((draft) => [normalizeName(draft.organization), draft]));
  const resolutions: DirectRecipientResolution[] = [];
  const updated = opportunities.map((opportunity) => {
    const draft = byOrganization.get(normalizeName(opportunity.organization));
    if (!draft) { resolutions.push(result(opportunity, null, "NOT_FOUND", "No authoritative recipient evidence was returned.", false)); return removeUnacceptableContact(opportunity); }
    const roleUrl = canonicalUrl(draft.roleSourceUrl);
    const requestedOfficialUrl = canonicalUrl(draft.officialOrganizationUrl);
    const emailSource = canonicalUrl(draft.contactEmailSourceUrl);
    // The official team/finance PDF is itself authoritative organization evidence.
    // Search results do not always separately cite the site's home page, so do
    // not discard a cited official role merely because that redundant URL is absent.
    const roleSourceIsCited = Boolean(roleUrl && sources.has(normalizeUrl(roleUrl)));
    const officialUrl = sources.has(normalizeUrl(requestedOfficialUrl)) ? requestedOfficialUrl : roleSourceIsCited ? roleUrl : requestedOfficialUrl;
    const official = Boolean(officialUrl && (sources.has(normalizeUrl(officialUrl)) || roleSourceIsCited));
    const sameOrg = official && roleSourceIsCited && Boolean(roleUrl) && sameDomain(officialUrl, roleUrl);
    const title = clean(draft.contactTitle); const evidence = clean(draft.responsibilityEvidence); const name = clean(draft.contactName);
    const suitable = draft.recipientFound && name && title && sameOrg && hasAppropriateDirectRecipientTitle(title, evidence);
    const executiveFallback = draft.executiveFallbackReview && name && title && sameOrg;
    const publishedEmail = suitable && validBusinessEmail(draft.contactEmail, officialUrl) && emailSource && sources.has(normalizeUrl(emailSource)) && sameDomain(officialUrl, emailSource) ? draft.contactEmail.trim().toLowerCase() : "";
    const source: ContactSource = suitable ? (publishedEmail ? "OFFICIAL_PUBLISHED" : "OFFICIAL_ROLE") : executiveFallback ? "EXECUTIVE_FALLBACK_REVIEW" : "NOT_FOUND";
    const blocker = suitable ? (publishedEmail ? null : "NO_PUBLISHED_EMAIL: Hunter may be used only after this person-first evidence is persisted.") : executiveFallback ? "EXECUTIVE_FALLBACK_REVIEW: no finance or grants operating owner was found." : clean(draft.blocker) || "NO_APPROPRIATE_RECIPIENT: no authoritative finance or grants operating owner was found.";
    resolutions.push({ organization: opportunity.organization, signal: opportunity.signalKind, recipientFound: Boolean(suitable), contact: suitable || executiveFallback ? name : null, title: suitable || executiveFallback ? title : null, roleEvidence: evidence || null, contactSource: source, email: publishedEmail || null, blocker, hunterUsed: false });
    if (!suitable) return removeUnacceptableContact({ ...opportunity, organizationUrl: official ? officialUrl : opportunity.organizationUrl, unknowns: unique([...opportunity.unknowns.filter((value) => !/appropriate named contact|recipient/i.test(value)), ...(blocker ? [blocker] : [])]) });
    const [firstName] = name.split(/\s+/); const draftMessage = createDirectOutreachDraft({ firstName: firstName || "there", organization: opportunity.organization, timingSignal: opportunity.whyNow });
    const contact = { name, title, email: publishedEmail, emailKind: "direct" as const, roleSourceUrl: roleUrl, emailSourceUrl: emailSource || roleUrl, verifiedAt: generatedAt, note: publishedEmail ? "Official published business email." : "Official role evidence; Hunter fallback is permitted only for this identified recipient.", ...(evidence ? { responsibilityEvidence: evidence } : {}) };
    return { ...opportunity, organizationUrl: officialUrl, primaryContact: contact, unknowns: opportunity.unknowns.filter((value) => !/appropriate named contact|recipient/i.test(value)), evidence: uniqueEvidence([...opportunity.evidence, { id: `recipient-${createHash("sha256").update(normalizeUrl(roleUrl)).digest("hex").slice(0, 12)}`, title: `${name} — ${title}`, url: roleUrl, observedAt: generatedAt, authority: "official" as const, excerpt: evidence || `${title} listed by the organization.`, supports: ["recipient identity", "operating responsibility"] }]), emailSubject: draftMessage.subject, draftMessage: draftMessage.body };
  });
  return { generatedAt, opportunities: updated, resolutions, errors: [] };
}

function unresolved(opportunities: readonly GtmOpportunity[], error: string, generatedAt: string): DirectRecipientResolutionRun { return { generatedAt, opportunities: [...opportunities], resolutions: opportunities.map((opportunity) => result(opportunity, null, "NOT_FOUND", error, false)), errors: [error] }; }
function result(opportunity: GtmOpportunity, contact: { name: string; title: string } | null, contactSource: ContactSource, blocker: string | null, hunterUsed: boolean): DirectRecipientResolution { return { organization: opportunity.organization, signal: opportunity.signalKind, recipientFound: Boolean(contact), contact: contact?.name || null, title: contact?.title || null, roleEvidence: null, contactSource, email: null, blocker, hunterUsed }; }
function removeUnacceptableContact(opportunity: GtmOpportunity) { return opportunity.primaryContact && hasAppropriateDirectRecipientTitle(opportunity.primaryContact.title, opportunity.primaryContact.responsibilityEvidence) ? opportunity : { ...opportunity, primaryContact: undefined }; }
function unique<T>(values: T[]) { return [...new Set(values)]; }
function uniqueEvidence(values: GtmOpportunity["evidence"]) { const seen = new Set<string>(); return values.filter((item) => { const key = normalizeUrl(item.url); if (!key || seen.has(key)) return false; seen.add(key); return true; }); }
function normalizeName(value: string) { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function clean(value: string) { return String(value || "").replace(/\s+/g, " ").trim(); }
function canonicalUrl(value: string) { return normalizeUrl(value); }
function normalizeUrl(value: string) { try { const url = new URL(value); if (url.protocol !== "https:") return ""; url.hostname = url.hostname.toLowerCase().replace(/^www\./, ""); url.search = ""; url.hash = ""; return url.toString().replace(/\/$/, ""); } catch { return ""; } }
function sameDomain(left: string, right: string) { try { const a = new URL(left).hostname.replace(/^www\./, ""); const b = new URL(right).hostname.replace(/^www\./, ""); return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`); } catch { return false; } }
function validBusinessEmail(value: string, officialUrl: string) { try { const domain = new URL(officialUrl).hostname.replace(/^www\./, ""); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim()) && value.trim().toLowerCase().endsWith(`@${domain}`); } catch { return false; } }
function collectUrls(body: SearchResponse) { const urls: string[] = []; for (const item of body.output || []) { for (const source of item.action?.sources || []) if (source.url) urls.push(source.url); for (const content of item.content || []) for (const annotation of content.annotations || []) if (annotation.url) urls.push(annotation.url); } return [...new Set(urls)]; }
