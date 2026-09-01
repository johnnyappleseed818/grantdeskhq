import { InstantlyClient, instantlyConfig } from "./instantly.ts";
import { listGtmChannelSeeds, saveGtmChannelSeed } from "./persistence.ts";
import { recordInstantlyVerifiedGtmContact } from "./contactEnrichment.ts";

import type { ChannelSeedRecord } from "../src/lib/gtmChannelSeeds.ts";
type ProviderLead = Record<string, unknown>;
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
  const seeds = (await listGtmChannelSeeds()).filter((seed) => seed.segment === segment && (seed.lifecycle === "ENRICHMENT_PENDING" || (seed.lifecycle === "ENRICHMENT_FAILED" && !seed.enrichmentTerminalAt && (seed.enrichmentAttemptCount || 0) < 3)) && Boolean(seed.organizationDomain));
  if (!config.integrationEnabled || !config.apiKeyConfigured) return { segment, selected: seeds.length, previewCount: null, submitted: 0, resourceId: null, providerStatus: null, blocked: "INSTANTLY_NOT_CONFIGURED" };
  const listId = segment === "DIRECT" ? config.directListId : config.partnerListId;
  if (!listId) return { segment, selected: seeds.length, previewCount: null, submitted: 0, resourceId: null, providerStatus: null, blocked: "MISSING_SEGMENT_LIST" };
  if (!seeds.length) return { segment, selected: 0, previewCount: 0, submitted: 0, resourceId: null, providerStatus: null, blocked: null };
  const client = new InstantlyClient(config, env.INSTANTLY_API_KEY || "");
  const names = seeds.map((seed) => seed.organization);
  const preview = await client.previewSuperSearch({ companyNames: names, titles: titles[segment], limit: names.length });
  const response = await client.enrichSuperSearch({ companyNames: names, titles: titles[segment], listId, limit: names.length, searchName: `GrantDeskHQ ${segment} channel seeds 2026-08-28` });
  const enrichmentJobId = String(response.id || "").trim() || null; const resourceId = String(response.resource_id || listId).trim() || listId;
  const now = new Date().toISOString();
  await Promise.all(seeds.map((seed) => saveGtmChannelSeed({ ...seed, lifecycle: "ENRICHMENT_SUBMITTED", enrichmentProvider: "instantly_supersearch", enrichmentResult: `Submitted to Instantly SuperSearch; preview matched ${Number(preview.number_of_leads || 0)} candidate contact(s). Provider verification and role reconciliation remain required before any handoff.`, enrichmentResourceId: resourceId, enrichmentJobId, enrichmentProviderStatus: "SUBMITTED", enrichmentSubmittedAt: now, enrichmentLastCheckedAt: now, enrichmentAttemptCount: (seed.enrichmentAttemptCount || 0) + 1, enrichmentLastProviderError: null, enrichmentTerminalAt: null, enrichmentUpdatedAt: now })));
  return { segment, selected: seeds.length, previewCount: Number(preview.number_of_leads || 0), submitted: seeds.length, resourceId, providerStatus: String(response.status || "") || null, blocked: null };
}

export async function reconcileChannelSeedEnrichment(segment: ChannelSeedEnrichmentSegment, env: NodeJS.ProcessEnv = process.env) {
  const config = instantlyConfig(env);
  const seeds = (await listGtmChannelSeeds()).filter((seed) => seed.segment === segment && seed.lifecycle === "ENRICHMENT_SUBMITTED");
  const result = { segment, reconciled: 0, verified: 0, pending: seeds.length, neverSubmitted: 0, processing: 0, completedButUnreconciled: 0, providerRejected: 0, rateLimited: 0, missingProviderObject: 0, stale: 0, failed: 0 };
  if (!config.integrationEnabled || !config.apiKeyConfigured || !seeds.length) return result;
  const client = new InstantlyClient(config, env.INSTANTLY_API_KEY || "");
  const listId = segment === "DIRECT" ? config.directListId : config.partnerListId;
  const listed = await client.listLeadsInList(listId);
  const leads = Array.isArray(listed.items) ? listed.items : [];
  const now = new Date().toISOString();
  for (const seed of seeds) {
    const lead = leads.find((item) => roleFits(segment, text(item.job_title)) && text(item.email) && (norm(text(item.company_name)) === norm(seed.organization) || norm(text(item.company_domain)) === norm(seed.organizationDomain || "")));
    if (lead && providerLeadIsVerified(lead)) {
      const email = text(lead.email); const firstName = text(lead.first_name) || "Contact"; const lastName = text(lead.last_name) || "Research";
      try {
        await recordInstantlyVerifiedGtmContact({ organization: seed.organization, organizationDomain: seed.organizationDomain!, domainSourceUrl: seed.sourceUrl, person: { firstName, lastName, fullName: `${firstName} ${lastName}`.trim(), currentTitle: text(lead.job_title), titleSourceUrl: seed.sourceUrl, responsibilityEvidence: "Instantly SuperSearch returned a role-fit provider-verified contact." } }, email, text(lead.id), seed.sourceUrl);
        await saveGtmChannelSeed({ ...seed, lifecycle: "VERIFIED", enrichmentResult: "Instantly returned a role-fit contact with a verified, non-catch-all business email; final suppression, deduplication, content, and campaign gates remain required.", enrichmentProviderStatus: "COMPLETED", enrichmentLastCheckedAt: now, enrichmentLastProviderError: null, enrichmentUpdatedAt: now });
        result.reconciled += 1; result.verified += 1; continue;
      } catch (error) {
        await markTerminal(seed, "CANONICAL_CONTACT_GATE_REJECTED", "FAILED", now, safeError(error)); result.providerRejected += 1; result.failed += 1; continue;
      }
    }
    if (lead && [-1, -2, -3, -4].includes(Number(lead.verification_status))) {
      await markTerminal(seed, "PROVIDER_EMAIL_NOT_VERIFIED", "FAILED", now); result.providerRejected += 1; result.failed += 1; continue;
    }
    const providerId = seed.enrichmentJobId || seed.enrichmentResourceId;
    if (!providerId) { result.neverSubmitted += 1; continue; }
    try {
      const provider = await client.getSuperSearchEnrichment(providerId);
      if (provider.in_progress === true || (lead && [11, 12].includes(Number(lead.verification_status)))) {
        if (providerJobIsStale(seed, Date.now(), env)) { await markTerminal(seed, "PROVIDER_JOB_STALE", "STALE", now); result.stale += 1; result.failed += 1; continue; }
        await saveGtmChannelSeed({ ...seed, enrichmentProviderStatus: "PROCESSING", enrichmentLastCheckedAt: now, enrichmentUpdatedAt: now }); result.processing += 1; continue;
      }
      await markTerminal(seed, lead ? "PROVIDER_VERIFICATION_NOT_TERMINAL" : "NO_ROLE_FIT_VERIFIED_PROVIDER_CONTACT", "COMPLETED", now);
      result.completedButUnreconciled += 1; result.failed += 1;
    } catch (error) {
      const message = safeError(error);
      if (message.includes("(429)")) { await saveGtmChannelSeed({ ...seed, enrichmentProviderStatus: "PROCESSING", enrichmentLastCheckedAt: now, enrichmentLastProviderError: "PROVIDER_RATE_LIMITED", enrichmentUpdatedAt: now }); result.rateLimited += 1; continue; }
      if (message.includes("(404)")) { await markTerminal(seed, "MISSING_PROVIDER_ENRICHMENT_OBJECT", "MISSING_PROVIDER_OBJECT", now, message); result.missingProviderObject += 1; result.failed += 1; continue; }
      await markTerminal(seed, "PROVIDER_ENRICHMENT_FAILED", "FAILED", now, message); result.providerRejected += 1; result.failed += 1;
    }
  }
  result.pending = result.processing + result.rateLimited + result.neverSubmitted;
  return result;
}

async function markTerminal(seed: Awaited<ReturnType<typeof listGtmChannelSeeds>>[number], reason: string, status: "COMPLETED" | "FAILED" | "MISSING_PROVIDER_OBJECT" | "STALE", at: string, error: string | null = null) {
  await saveGtmChannelSeed({ ...seed, lifecycle: "ENRICHMENT_FAILED", rejectionReason: reason, enrichmentResult: reason, enrichmentProviderStatus: status, enrichmentLastCheckedAt: at, enrichmentLastProviderError: error, enrichmentTerminalAt: at, enrichmentUpdatedAt: at });
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
export function providerLeadIsVerified(lead: Record<string, unknown>) { return Number(lead.verification_status) === 1; }
function norm(value: string) { return value.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function roleFits(segment: ChannelSeedEnrichmentSegment, title: string) { return segment === "DIRECT" ? /\b(cfo|finance director|controller|director of grants|grants manager|institutional giving)\b/i.test(title) : /\b(founder|ceo|managing partner|partner|principal)\b/i.test(title); }
export function providerJobIsStale(seed: { enrichmentSubmittedAt?: string | null; enrichmentUpdatedAt?: string | null }, now: number, env: NodeJS.ProcessEnv = process.env) { const submitted = Date.parse(seed.enrichmentSubmittedAt || seed.enrichmentUpdatedAt || ""); const staleMs = Number(env.INSTANTLY_ENRICHMENT_STALE_MS || 3600000); return Number.isFinite(submitted) && now - submitted > (Number.isFinite(staleMs) && staleMs >= 60000 ? staleMs : 3600000); }
function safeError(error: unknown) { return error instanceof Error ? error.message.slice(0, 240) : "provider_error"; }
