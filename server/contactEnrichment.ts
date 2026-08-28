import {
  accumulateEnrichmentUsage,
  buildContactEnrichmentRecord,
  isVerifiedBusinessEmail,
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


/** Hunter-only path for bounded production batches; no secondary provider is invoked. */
export async function enrichGtmContactWithHunter(target: EnrichmentTarget, environment: NodeJS.ProcessEnv = process.env, prior?: ContactEnrichmentRecord): Promise<ContactEnrichmentRecord> {
  const now = new Date().toISOString();
  const configuration = contactEnrichmentRuntimeConfiguration(environment);
  const usage = await readGtmEnrichmentUsage();
  const hunter = createHunterProvider({ enabled: configuration.providerCallsEnabled, apiKey: environment.HUNTER_API_KEY?.trim(), lookupLimit: configuration.hunter.lookupLimit, lookupsUsed: 0 });
  const attempt = await hunter.discover(target);
  const suppression = attempt.status === "VERIFIED" && attempt.email ? await readGtmContactSuppression(attempt.email) : noEmailSuppressionCheck(now);
  const base = buildContactEnrichmentRecord(target, [attempt], suppression, now, prior);
  const transient = ["UNAVAILABLE", "ERROR"].includes(attempt.status) && ["network", "rate_limited", "provider_error"].includes(attempt.errorCategory || "");
  const retryDays = transient ? 1 : 14;
  const nextEligibleRetry = base.readyForHumanApproval ? undefined : new Date(Date.now() + retryDays * 86_400_000).toISOString();
  const record: ContactEnrichmentRecord = { ...base, lastEnrichmentAttempt: now, provider: "hunter", result: base.readiness, failureReason: base.readyForHumanApproval ? undefined : base.blockers.join(" "), candidateFingerprint: candidateFingerprint(target), ...(nextEligibleRetry ? { nextEligibleRetry } : {}), verification: { ...base.verification, lastEnrichmentAttempt: now, nextEligibleRetry: nextEligibleRetry || null } };
  await saveGtmContactEnrichment(record);
  await saveGtmEnrichmentUsage(accumulateEnrichmentUsage(usage, [attempt], now));
  return record;
}

/** Records an organization-published business email without a paid provider lookup. */
export async function recordPublishedGtmContact(target: EnrichmentTarget, email: string, sourceUrl: string, prior?: ContactEnrichmentRecord): Promise<ContactEnrichmentRecord> {
  const now = new Date().toISOString();
  const normalizedEmail = email.trim().toLowerCase();
  const emailDomain = normalizedEmail.split("@")[1] || "";
  if (!isVerifiedBusinessEmail(normalizedEmail, emailDomain) || !/^https:\/\//.test(sourceUrl)) throw new Error("A published business email and authoritative source are required.");
  const suppression = await readGtmContactSuppression(normalizedEmail);
  const attempt = {
    provider: "public" as const,
    status: "VERIFIED" as const,
    email: normalizedEmail,
    confidence: 100,
    sourceUrls: [{ url: sourceUrl }],
    providerMetadata: { publishedByOrganization: true },
    attemptedAt: now,
    attempted: false,
    providerRequestType: "AUTHORITATIVE_PUBLISHED_EMAIL" as const,
    finderResult: "FOUND" as const,
    verifierStatus: "VERIFIED" as const,
    verificationTimestamp: now,
    verificationSource: [{ url: sourceUrl }]
  };
  const base = buildContactEnrichmentRecord(target, [attempt], suppression, now, prior);
  const record: ContactEnrichmentRecord = { ...base, provider: "public", result: base.readiness, ...(base.readyForHumanApproval ? {} : { failureReason: base.verification.readyBlocker || base.blockers.join(" ") }), candidateFingerprint: candidateFingerprint(target), lastEnrichmentAttempt: now, verification: { ...base.verification, lastEnrichmentAttempt: now } };
  await saveGtmContactEnrichment(record);
  return record;
}

/** Stores an email only after Instantly's dedicated verifier returns verified
 * and non-catch-all. It records provider provenance; it never enrolls or
 * sends. */
export async function recordInstantlyVerifiedGtmContact(target: EnrichmentTarget, email: string, providerLeadId: string, sourceUrl: string, prior?: ContactEnrichmentRecord): Promise<ContactEnrichmentRecord> {
  const now = new Date().toISOString();
  const normalizedEmail = email.trim().toLowerCase();
  if (!isVerifiedBusinessEmail(normalizedEmail, target.organizationDomain) || !providerLeadId || !/^https:\/\//.test(sourceUrl)) throw new Error("A verified provider business email, lead ID, and evidence source are required.");
  const suppression = await readGtmContactSuppression(normalizedEmail);
  const attempt = { provider: "instantly" as const, status: "VERIFIED" as const, email: normalizedEmail, confidence: 100, sourceUrls: [{ url: sourceUrl }], providerMetadata: { providerLeadId, verification: "instantly_email_verification", catchAll: false }, attemptedAt: now, attempted: true, providerRequestType: "EMAIL_FINDER_AND_VERIFIER" as const, finderResult: "FOUND" as const, verifierStatus: "VERIFIED" as const, verificationTimestamp: now, verificationSource: [{ url: sourceUrl }] };
  const base = buildContactEnrichmentRecord(target, [attempt], suppression, now, prior);
  const record: ContactEnrichmentRecord = { ...base, provider: "instantly", result: base.readiness, ...(base.readyForHumanApproval ? {} : { failureReason: base.verification.readyBlocker || base.blockers.join(" ") }), candidateFingerprint: candidateFingerprint(target), lastEnrichmentAttempt: now, verification: { ...base.verification, lastEnrichmentAttempt: now } };
  await saveGtmContactEnrichment(record);
  return record;
}

/** Rebuild canonical readiness from stored attempts only. This never calls a provider or changes retry eligibility. */
export async function reconcileStoredGtmContact(
  target: EnrichmentTarget,
  prior: ContactEnrichmentRecord | null | undefined,
  context: { priorContactStatus?: "CLEAR" | "ALREADY_CONTACTED" | "UNKNOWN"; organizationDedupe?: "PASS" | "DUPLICATE"; qualifiedOrganization?: boolean } = {}
): Promise<ContactEnrichmentRecord> {
  const now = new Date().toISOString();
  const persistedEmail = prior?.providerAttempts.at(-1)?.email || prior?.verification?.email || prior?.email;
  const suppression = persistedEmail && isVerifiedBusinessEmail(persistedEmail, target.organizationDomain)
    ? await readGtmContactSuppression(persistedEmail)
    : prior?.suppression || noEmailSuppressionCheck(now);
  const base = buildContactEnrichmentRecord(target, prior?.providerAttempts || [], suppression, now, prior || undefined, {
    ...context,
    lastEnrichmentAttempt: prior?.lastEnrichmentAttempt || null,
    nextEligibleRetry: prior?.nextEligibleRetry || null
  });
  const record: ContactEnrichmentRecord = {
    ...base,
    ...(prior?.provider ? { provider: prior.provider } : {}),
    result: base.readiness,
    ...(base.readyForHumanApproval ? {} : { failureReason: base.verification.readyBlocker || base.blockers.join(" ") }),
    ...(prior?.candidateFingerprint ? { candidateFingerprint: prior.candidateFingerprint } : {}),
    ...(prior?.lastEnrichmentAttempt ? { lastEnrichmentAttempt: prior.lastEnrichmentAttempt } : {}),
    ...(prior?.nextEligibleRetry ? { nextEligibleRetry: prior.nextEligibleRetry } : {})
  };
  await saveGtmContactEnrichment(record);
  return record;
}

export function retryEligible(record: ContactEnrichmentRecord | null | undefined, target: EnrichmentTarget, now = Date.now()) {
  if (!record) return true;
  if (record.candidateFingerprint && record.candidateFingerprint !== candidateFingerprint(target)) return true;
  if (record.readyForHumanApproval) return false;
  return !record.nextEligibleRetry || Date.parse(record.nextEligibleRetry) <= now;
}

function candidateFingerprint(target: EnrichmentTarget) {
  return [target.organization, target.organizationDomain, target.person.fullName, target.person.currentTitle, target.person.titleSourceUrl].map((value) => value.trim().toLowerCase()).join("|");
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
