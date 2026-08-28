import { InstantlyClient, instantlyConfig } from "./instantly.ts";
import { listGtmChannelSeeds, saveGtmChannelSeed } from "./persistence.ts";
import { recordInstantlyVerifiedGtmContact } from "./contactEnrichment.ts";

export type ChannelSeedEnrichmentSegment = "DIRECT" | "PARTNER";
const titles: Record<ChannelSeedEnrichmentSegment, string[]> = {
  DIRECT: ["CFO", "Finance Director", "Controller", "Director of Grants", "Grants Manager", "Director of Institutional Giving"],
  PARTNER: ["Founder", "CEO", "Managing Partner", "Nonprofit Practice Lead", "Partner", "Principal"]
};
export interface ChannelSeedEnrichmentResult { segment: ChannelSeedEnrichmentSegment; selected: number; previewCount: number | null; submitted: number; resourceId: string | null; providerStatus: string | null; blocked: string | null; }

/** Idempotent Instantly-first organization enrichment. No list membership is
 * considered email verification and this function cannot touch campaigns. */
export async function enrichChannelSeedsWithInstantly(segment: ChannelSeedEnrichmentSegment, env: NodeJS.ProcessEnv = process.env): Promise<ChannelSeedEnrichmentResult> {
  const config = instantlyConfig(env);
  const seeds = (await listGtmChannelSeeds()).filter((seed) => seed.segment === segment && ["ENRICHMENT_PENDING", "ENRICHMENT_FAILED"].includes(seed.lifecycle) && Boolean(seed.organizationDomain));
  if (!config.integrationEnabled || !config.apiKeyConfigured) return { segment, selected: seeds.length, previewCount: null, submitted: 0, resourceId: null, providerStatus: null, blocked: "INSTANTLY_NOT_CONFIGURED" };
  const listId = segment === "DIRECT" ? config.directListId : config.partnerListId;
  if (!listId) return { segment, selected: seeds.length, previewCount: null, submitted: 0, resourceId: null, providerStatus: null, blocked: "MISSING_SEGMENT_LIST" };
  if (!seeds.length) return { segment, selected: 0, previewCount: 0, submitted: 0, resourceId: null, providerStatus: null, blocked: null };
  const client = new InstantlyClient(config, env.INSTANTLY_API_KEY || "");
  const names = seeds.map((seed) => seed.organization);
  const preview = await client.previewSuperSearch({ companyNames: names, titles: titles[segment], limit: names.length });
  const response = await client.enrichSuperSearch({ companyNames: names, titles: titles[segment], listId, limit: names.length, searchName: `GrantDeskHQ ${segment} channel seeds 2026-08-28` });
  const resourceId = String(response.id || response.resource_id || "").trim() || null;
  const now = new Date().toISOString();
  await Promise.all(seeds.map((seed) => saveGtmChannelSeed({ ...seed, lifecycle: "ENRICHMENT_SUBMITTED", enrichmentProvider: "instantly_supersearch", enrichmentResult: `Submitted to Instantly SuperSearch; preview matched ${Number(preview.number_of_leads || 0)} candidate contact(s). Provider verification and role reconciliation remain required before any handoff.`, enrichmentResourceId: resourceId, enrichmentUpdatedAt: now })));
  return { segment, selected: seeds.length, previewCount: Number(preview.number_of_leads || 0), submitted: seeds.length, resourceId, providerStatus: String(response.status || "") || null, blocked: null };
}

export async function reconcileChannelSeedEnrichment(segment: ChannelSeedEnrichmentSegment, env: NodeJS.ProcessEnv = process.env) {
  const config = instantlyConfig(env);
  const seeds = (await listGtmChannelSeeds()).filter((seed) => seed.segment === segment && seed.lifecycle === "ENRICHMENT_SUBMITTED" && seed.enrichmentResourceId);
  if (!config.integrationEnabled || !config.apiKeyConfigured || !seeds.length) return { segment, reconciled: 0, pending: seeds.length, failed: 0 };
  const client = new InstantlyClient(config, env.INSTANTLY_API_KEY || "");
  const listId = segment === "DIRECT" ? config.directListId : config.partnerListId;
  const listed = await client.listLeadsInList(listId);
  const leads = Array.isArray(listed.items) ? listed.items : [];
  let reconciled = 0; const failed = 0; let verified = 0;
  for (const seed of seeds) {
    const lead = leads.find((item) => norm(text(item.company_name)) === norm(seed.organization) && roleFits(segment, text(item.job_title)) && text(item.email));
    if (!lead) continue;
    const email = text(lead.email); const verification = await client.getEmailVerification(email);
    if (String(verification.verification_status || "").toLowerCase() !== "verified" || verification.catch_all === true || verification.catch_all === "true") continue;
    const firstName = text(lead.first_name) || "Contact"; const lastName = text(lead.last_name) || "Research";
    await recordInstantlyVerifiedGtmContact({ organization: seed.organization, organizationDomain: seed.organizationDomain!, domainSourceUrl: seed.sourceUrl, person: { firstName, lastName, fullName: `${firstName} ${lastName}`.trim(), currentTitle: text(lead.job_title), titleSourceUrl: seed.sourceUrl, responsibilityEvidence: "Instantly provider returned a role within the independently verified target-role group." } }, email, text(lead.id), seed.sourceUrl);
    await saveGtmChannelSeed({ ...seed, lifecycle: "VERIFIED", enrichmentResult: "Instantly returned a role-fit contact with a verified, non-catch-all business email; final suppression, deduplication, content, and campaign gates remain required.", enrichmentUpdatedAt: new Date().toISOString() });
    reconciled += 1; verified += 1;
  }
  return { segment, reconciled, pending: seeds.length - reconciled, failed, verified };
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function norm(value: string) { return value.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function roleFits(segment: ChannelSeedEnrichmentSegment, title: string) { return segment === "DIRECT" ? /\b(cfo|finance director|controller|director of grants|grants manager|institutional giving)\b/i.test(title) : /\b(founder|ceo|managing partner|partner|principal)\b/i.test(title); }
