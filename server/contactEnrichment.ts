import {
  accumulateEnrichmentUsage,
  buildContactEnrichmentRecord,
  contactEnrichmentKey,
  runProviderWaterfall,
  shouldRefreshContactEnrichment,
  type ContactEnrichmentRecord,
  type EnrichmentTarget,
  type SuppressionCheck
} from "../src/lib/contactEnrichment.ts";
import {
  readGtmContactEnrichment,
  readGtmContactSuppression,
  readGtmEnrichmentUsage,
  saveGtmContactEnrichment,
  saveGtmEnrichmentUsage
} from "./persistence.ts";
import { createApolloProvider, createHunterProvider } from "./contactEnrichmentProviders.ts";

export interface ContactEnrichmentRuntimeConfiguration {
  mode: "SHADOW";
  providerCallsEnabled: boolean;
  hunter: { configured: boolean; lookupLimit: number };
  apollo: { configured: boolean; lookupLimit: number };
}

export function contactEnrichmentRuntimeConfiguration(environment: NodeJS.ProcessEnv = process.env): ContactEnrichmentRuntimeConfiguration {
  const providerCallsEnabled = environment.GTM_CONTACT_ENRICHMENT_ENABLED === "true";
  return {
    mode: "SHADOW",
    providerCallsEnabled,
    hunter: { configured: Boolean(environment.HUNTER_API_KEY?.trim()), lookupLimit: configuredLimit(environment.HUNTER_MAX_LOOKUPS_PER_RUN) },
    apollo: { configured: Boolean(environment.APOLLO_API_KEY?.trim()), lookupLimit: configuredLimit(environment.APOLLO_MAX_LOOKUPS_PER_RUN) }
  };
}

export async function enrichGtmContactInShadow(target: EnrichmentTarget, environment: NodeJS.ProcessEnv = process.env): Promise<ContactEnrichmentRecord> {
  const key = contactEnrichmentKey(target);
  const cached = await readGtmContactEnrichment(key);
  const now = new Date().toISOString();
  if (cached && !shouldRefreshContactEnrichment(cached)) {
    const suppression = cached.email ? await readGtmContactSuppression(cached.email) : cached.suppression;
    const refreshed = buildContactEnrichmentRecord(target, cached.providerAttempts, suppression, now, cached);
    await saveGtmContactEnrichment(refreshed);
    return refreshed;
  }

  const configuration = contactEnrichmentRuntimeConfiguration(environment);
  const usage = await readGtmEnrichmentUsage();
  const hunter = createHunterProvider({
    enabled: configuration.providerCallsEnabled,
    apiKey: environment.HUNTER_API_KEY?.trim(),
    lookupLimit: configuration.hunter.lookupLimit,
    lookupsUsed: 0
  });
  const apollo = createApolloProvider({
    enabled: configuration.providerCallsEnabled,
    apiKey: environment.APOLLO_API_KEY?.trim(),
    lookupLimit: configuration.apollo.lookupLimit,
    lookupsUsed: 0
  });
  const attempts = await runProviderWaterfall(target, { hunter: () => hunter.discover(target), apollo: () => apollo.discover(target) });
  const verifiedEmail = attempts.find((attempt) => attempt.status === "VERIFIED")?.email;
  const suppression = verifiedEmail
    ? await readGtmContactSuppression(verifiedEmail)
    : noEmailSuppressionCheck(now);
  const record = buildContactEnrichmentRecord(target, attempts, suppression, now, cached || undefined);
  await saveGtmContactEnrichment(record);
  await saveGtmEnrichmentUsage(accumulateEnrichmentUsage(usage, attempts, now));
  return record;
}

function configuredLimit(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100 ? parsed : 0;
}

function noEmailSuppressionCheck(checkedAt: string): SuppressionCheck {
  return {
    status: "UNKNOWN",
    reasons: ["A verified direct business email is required before suppression history can be checked."],
    checkedAt,
    sourcesChecked: []
  };
}
