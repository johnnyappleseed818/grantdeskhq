import { createHash } from "node:crypto";

export interface PartnerDiscoveryOpportunity {
  id: string;
  organization: string;
  organizationDomain: string;
  organizationUrl: string;
  sourceUrl: string;
  observedAt: string;
  partnerType: string;
  whyFit: string;
  contact: { firstName: string; lastName: string; fullName: string; title: string; titleSourceUrl: string };
  publicEmail?: string;
}

export interface PartnerDiscoveryScan {
  generatedAt: string;
  sourceRegistry: Array<{ name: string; mode: "PUBLIC_SEARCH_DISCOVERY"; enabled: boolean; lastAttempt: string; lastSuccess: string | null; status: "PASS" | "ERROR"; error?: string }>;
  rawCandidatesExamined: number;
  priorContactRemoved: number;
  duplicates: number;
  qualified: number;
  opportunities: PartnerDiscoveryOpportunity[];
  errors: string[];
  mainBottleneck: string;
}

type SearchDraft = { candidates: Array<Omit<PartnerDiscoveryOpportunity, "id" | "observedAt">> };
const apiUrl = "https://api.openai.com/v1/responses";
const partnerDiscoverySchema = JSON.parse(`{"type":"object","additionalProperties":false,"required":["candidates"],"properties":{"candidates":{"type":"array","maxItems":30,"items":{"type":"object","additionalProperties":false,"required":["organization","organizationDomain","organizationUrl","sourceUrl","partnerType","whyFit","contact"],"properties":{"organization":{"type":"string"},"organizationDomain":{"type":"string"},"organizationUrl":{"type":"string"},"sourceUrl":{"type":"string"},"partnerType":{"type":"string"},"whyFit":{"type":"string"},"publicEmail":{"type":"string"},"contact":{"type":"object","additionalProperties":false,"required":["firstName","lastName","fullName","title","titleSourceUrl"],"properties":{"firstName":{"type":"string"},"lastName":{"type":"string"},"fullName":{"type":"string"},"title":{"type":"string"},"titleSourceUrl":{"type":"string"}}}}}}}}`);

/** Bounded, public evidence discovery only. It finds research candidates; the
 * canonical prior-contact, contact, verification, and suppression gates run
 * before any paid provider action. */
export async function runPartnerPublicDiscovery(input: { knownDomains: string[]; priorContactDomains: string[]; maximum?: number }, now = new Date()): Promise<PartnerDiscoveryScan> {
  const generatedAt = now.toISOString();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const maximum = Math.max(20, Math.min(30, Math.floor(input.maximum || 25)));
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_GTM_MODEL || "gpt-5-mini",
      store: false,
      reasoning: { effort: "low" },
      tools: [{ type: "web_search", search_context_size: "medium", external_web_access: true }],
      tool_choice: "required",
      max_tool_calls: 12,
      input: [
        { role: "system", content: [{ type: "input_text", text: "You are an evidence-first partner researcher. Return only US-facing firms with public evidence of nonprofit accounting, CAS, fractional CFO, nonprofit CPA/advisory, grant accounting, post-award grant management, fiscal management, controller services, or grant-compliance advisory. A candidate needs an official public firm URL, a public source URL, and a named founder, partner, practice lead, CEO, president, or managing director connected to that firm. Exclude generic bookkeeping, fundraising-only consulting, marketing, business coaching, huge audit firms, and any firm without an explicit nonprofit-finance or post-award signal. Do not invent people, emails, titles, services, or URLs. A public email is optional and must be displayed on an authoritative source." }] },
        { role: "user", content: [{ type: "input_text", text: `Find up to ${maximum} new candidate firms. Search official company sites, public professional listings, and ordinary public search. For each, give organization, primary domain, official website, exact public source URL, partner type, a concise evidence-backed why-fit, and the named decision maker with their title/source URL. Already known/previously contacted domains to avoid: ${[...new Set([...input.knownDomains, ...input.priorContactDomains].filter(Boolean))].slice(0, 250).join(", ") || "none supplied"}.` }] }
      ],
      text: { format: { type: "json_schema", name: "grantdeskhq_partner_discovery", strict: true, schema: partnerDiscoverySchema } }
    })
  });
  const body = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || `Partner discovery failed (${response.status}).`);
  const text = body.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("Partner discovery returned no structured output.");
  return normalizePartnerDiscovery(JSON.parse(text) as SearchDraft, input, generatedAt);
}

export function normalizePartnerDiscovery(draft: SearchDraft, input: { knownDomains: string[]; priorContactDomains: string[] }, generatedAt = new Date().toISOString()): PartnerDiscoveryScan {
  const known = new Set([...input.knownDomains, ...input.priorContactDomains].map(normalizeDomain).filter(Boolean));
  const seen = new Set<string>(); let priorContactRemoved = 0; let duplicates = 0;
  const opportunities: PartnerDiscoveryOpportunity[] = [];
  for (const candidate of draft.candidates || []) {
    const domain = normalizeDomain(candidate.organizationDomain || domainFromUrl(candidate.organizationUrl));
    if (!domain || !validUrl(candidate.organizationUrl) || !validUrl(candidate.sourceUrl) || !validUrl(candidate.contact?.titleSourceUrl) || !candidate.organization?.trim() || !candidate.whyFit?.trim() || !candidate.contact?.fullName?.trim() || !candidate.contact?.title?.trim()) continue;
    if (known.has(domain)) { priorContactRemoved++; continue; }
    if (seen.has(domain)) { duplicates++; continue; }
    seen.add(domain);
    opportunities.push({ ...candidate, id: `partner-${createHash("sha256").update(domain).digest("hex").slice(0, 18)}`, organization: candidate.organization.trim(), organizationDomain: domain, organizationUrl: candidate.organizationUrl.trim(), sourceUrl: candidate.sourceUrl.trim(), partnerType: candidate.partnerType.trim(), whyFit: candidate.whyFit.trim(), contact: { ...candidate.contact, firstName: candidate.contact.firstName.trim(), lastName: candidate.contact.lastName.trim(), fullName: candidate.contact.fullName.trim(), title: candidate.contact.title.trim(), titleSourceUrl: candidate.contact.titleSourceUrl.trim() }, ...(validEmail(candidate.publicEmail) ? { publicEmail: candidate.publicEmail!.trim().toLowerCase() } : {}), observedAt: generatedAt });
  }
  return { generatedAt, sourceRegistry: [{ name: "Public nonprofit-finance partner research", mode: "PUBLIC_SEARCH_DISCOVERY", enabled: true, lastAttempt: generatedAt, lastSuccess: generatedAt, status: "PASS" }], rawCandidatesExamined: (draft.candidates || []).length, priorContactRemoved, duplicates, qualified: opportunities.length, opportunities, errors: [], mainBottleneck: opportunities.length ? "Qualified public nonprofit-finance firms await authoritative contact evidence." : "No new public candidate cleared the nonprofit-finance and named-decision-maker gates." };
}

function normalizeDomain(value: string) { return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""); }
function domainFromUrl(value: string) { try { return normalizeDomain(new URL(value).hostname); } catch { return ""; } }
function validUrl(value: string) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
function validEmail(value: string | undefined) { return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)); }
