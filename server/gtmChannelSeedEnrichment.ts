import type { ChannelSeedRecord } from "../src/lib/gtmChannelSeeds.ts";
import { InstantlyClient, instantlyConfig } from "./instantly.ts";
import { listGtmChannelSeeds, saveGtmChannelSeed } from "./persistence.ts";

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
  const seeds = (await listGtmChannelSeeds()).filter((seed) => seed.segment === segment && ["DISCOVERED", "ENRICHMENT_FAILED"].includes(seed.lifecycle));
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
  const groups = new Map<string, ChannelSeedRecord[]>();
  for (const seed of seeds) groups.set(seed.enrichmentResourceId!, [...(groups.get(seed.enrichmentResourceId!) || []), seed]);
  let reconciled = 0; let failed = 0;
  for (const [resourceId, group] of groups) {
    const state = await client.getSuperSearchEnrichment(resourceId);
    const status = String(state.status || "").trim().toLowerCase();
    if (!["failed", "error", "cancelled", "canceled"].includes(status)) continue;
    failed += group.length; reconciled += group.length;
    await Promise.all(group.map((seed) => saveGtmChannelSeed({ ...seed, lifecycle: "ENRICHMENT_FAILED", enrichmentResult: `Instantly SuperSearch terminal status: ${status}.`, enrichmentUpdatedAt: new Date().toISOString() })));
  }
  return { segment, reconciled, pending: seeds.length - reconciled, failed };
}
