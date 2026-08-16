export const CONTACT_ENRICHMENT_MODE = "SHADOW" as const;
export const INTRODUCTORY_GROWTH_OFFER = "We're offering introductory Growth pricing to 25 nonprofit customers at $99/month, normally $199/month.";
export const FREE_FIRST_AWARD_CTA = "Would you be open to trying it with one award for free?";

export type EmailVerificationStatus = "VERIFIED" | "ACCEPT_ALL" | "UNKNOWN" | "INVALID" | "NOT_FOUND" | "UNAVAILABLE";
export type ContactReadinessState = EmailVerificationStatus | "SUPPRESSED" | "READY_FOR_HUMAN_APPROVAL" | "CONTACT_NOT_ESTABLISHED";
export type SuppressionStatus = "CLEAR" | "BLOCKED" | "UNKNOWN";
export type ContactEnrichmentProviderName = "hunter" | "apollo";

export interface EnrichmentTarget {
  organization: string;
  organizationDomain: string;
  domainSourceUrl: string;
  person: { firstName: string; lastName: string; fullName: string; currentTitle: string; titleSourceUrl: string; titleObservedAt?: string };
}

export interface EmailSource {
  url: string;
  lastSeenAt?: string;
}

export interface ProviderLookupResult {
  provider: ContactEnrichmentProviderName;
  status: EmailVerificationStatus;
  email?: string;
  confidence?: number;
  acceptAll?: boolean;
  sourceUrls: EmailSource[];
  providerMetadata: Record<string, string | number | boolean>;
  attemptedAt: string;
  attempted: boolean;
  errorCategory?: "not_configured" | "limit_reached" | "authentication" | "rate_limited" | "provider_error" | "network" | "invalid_response";
}

export interface SuppressionCheck {
  status: SuppressionStatus;
  reasons: string[];
  checkedAt: string;
  sourcesChecked: string[];
}

export interface ContactEnrichmentRecord {
  id: string;
  mode: typeof CONTACT_ENRICHMENT_MODE;
  target: EnrichmentTarget;
  email?: string;
  emailProvider?: ContactEnrichmentProviderName;
  emailVerificationStatus: EmailVerificationStatus;
  providerConfidence?: number;
  providerAttempts: ProviderLookupResult[];
  emailProvenance: EmailSource[];
  suppression: SuppressionCheck;
  readiness: ContactReadinessState;
  readyForHumanApproval: boolean;
  blockers: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EnrichmentUsage {
  hunterLookups: number;
  hunterVerifications: number;
  apolloLookups: number;
  emailsVerified: number;
  contactsNotFound: number;
  providerSuccesses: Partial<Record<ContactEnrichmentProviderName, number>>;
  updatedAt: string;
}

export interface ShadowAwardDraftInput {
  firstName: string;
  organization: string;
  awardAmount: string;
  awardingAgency: string;
  awardStartDate: string;
}

export function contactEnrichmentKey(target: Pick<EnrichmentTarget, "organization" | "organizationDomain" | "person">) {
  return `contact_${normalize(target.organization)}_${normalize(target.organizationDomain)}_${normalize(target.person.fullName)}`.slice(0, 180);
}

export function normalizeBusinessDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

export function isVerifiedBusinessEmail(email: string | undefined, domain: string) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedDomain = normalizeBusinessDomain(domain);
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail) && normalizedDomain.length > 0 && normalizedEmail.endsWith(`@${normalizedDomain}`);
}

export function shouldRefreshContactEnrichment(record: ContactEnrichmentRecord | null | undefined, now = Date.now(), verifiedMaxAgeDays = 30) {
  if (!record) return true;
  if (record.emailVerificationStatus === "UNKNOWN" || record.emailVerificationStatus === "NOT_FOUND" || record.emailVerificationStatus === "UNAVAILABLE") return true;
  const updatedAt = Date.parse(record.updatedAt);
  if (!Number.isFinite(updatedAt)) return true;
  return now - updatedAt > verifiedMaxAgeDays * 86_400_000;
}

export async function runProviderWaterfall(
  target: EnrichmentTarget,
  providers: { hunter: () => Promise<ProviderLookupResult>; apollo: () => Promise<ProviderLookupResult> }
) {
  const hunter = normalizeProviderResult(await providers.hunter(), target.organizationDomain);
  if (hunter.status === "VERIFIED") return [hunter];
  const apollo = normalizeProviderResult(await providers.apollo(), target.organizationDomain);
  return [hunter, apollo];
}

export function buildContactEnrichmentRecord(
  target: EnrichmentTarget,
  providerAttempts: ProviderLookupResult[],
  suppression: SuppressionCheck,
  now = new Date().toISOString(),
  prior?: Pick<ContactEnrichmentRecord, "createdAt">
): ContactEnrichmentRecord {
  const normalizedAttempts = providerAttempts.map((attempt) => normalizeProviderResult(attempt, target.organizationDomain));
  const verified = normalizedAttempts.find((attempt) => attempt.status === "VERIFIED" && isVerifiedBusinessEmail(attempt.email, target.organizationDomain));
  const latest = verified || normalizedAttempts.at(-1);
  const status = verified?.status || latest?.status || "NOT_FOUND";
  const email = verified?.email;
  const blockers = buildBlockers(target, verified, status, suppression);
  const readiness = suppression.status === "BLOCKED"
    ? "SUPPRESSED"
    : verified && suppression.status === "CLEAR" && blockers.length === 0
      ? "READY_FOR_HUMAN_APPROVAL"
      : verified
        ? "VERIFIED"
        : status === "NOT_FOUND" || status === "UNAVAILABLE"
          ? "CONTACT_NOT_ESTABLISHED"
          : status;
  return {
    id: contactEnrichmentKey(target),
    mode: CONTACT_ENRICHMENT_MODE,
    target: normalizedTarget(target),
    ...(email ? { email } : {}),
    ...(verified ? { emailProvider: verified.provider, providerConfidence: verified.confidence, emailProvenance: verified.sourceUrls } : { emailProvenance: [] }),
    emailVerificationStatus: status,
    providerAttempts: normalizedAttempts,
    suppression,
    readiness,
    readyForHumanApproval: readiness === "READY_FOR_HUMAN_APPROVAL",
    blockers,
    createdAt: prior?.createdAt || now,
    updatedAt: now
  };
}

export function accumulateEnrichmentUsage(current: EnrichmentUsage | null | undefined, attempts: ProviderLookupResult[], updatedAt = new Date().toISOString()): EnrichmentUsage {
  const next: EnrichmentUsage = current || { hunterLookups: 0, hunterVerifications: 0, apolloLookups: 0, emailsVerified: 0, contactsNotFound: 0, providerSuccesses: {}, updatedAt };
  const actualAttempts = attempts.filter((attempt) => attempt.attempted);
  const hunter = actualAttempts.filter((attempt) => attempt.provider === "hunter");
  const apollo = actualAttempts.filter((attempt) => attempt.provider === "apollo");
  const verified = actualAttempts.filter((attempt) => attempt.status === "VERIFIED");
  const notFound = actualAttempts.filter((attempt) => attempt.status === "NOT_FOUND");
  const providerSuccesses = { ...next.providerSuccesses };
  for (const attempt of verified) providerSuccesses[attempt.provider] = (providerSuccesses[attempt.provider] || 0) + 1;
  return {
    hunterLookups: next.hunterLookups + hunter.length,
    hunterVerifications: next.hunterVerifications + hunter.filter((attempt) => attempt.providerMetadata.verifierCalled === true).length,
    apolloLookups: next.apolloLookups + apollo.length,
    emailsVerified: next.emailsVerified + verified.length,
    contactsNotFound: next.contactsNotFound + notFound.length,
    providerSuccesses,
    updatedAt
  };
}

export function createTopicalShadowDraft(input: ShadowAwardDraftInput) {
  const subject = `${input.awardingAgency} award reporting workflow for ${input.organization}`;
  const body = [
    `Hi ${input.firstName},`,
    "",
    "We built GrantDeskHQ to take repetitive post-award reporting work off nonprofit finance teams. Our AI-powered workflow turns the grant agreement, accounting data, program updates, and supporting evidence into a reviewable funder-report draft, while your team keeps control of review and submission.",
    "",
    `I saw ${input.organization}'s ${input.awardAmount} ${input.awardingAgency} award beginning ${input.awardStartDate}, so the timing seemed relevant.`,
    "",
    `${INTRODUCTORY_GROWTH_OFFER} ${FREE_FIRST_AWARD_CTA}`,
    "",
    "Best,",
    "Eli"
  ].join("\n");
  return { subject, body, status: "SHADOW_DRAFT" as const };
}

function normalizeProviderResult(result: ProviderLookupResult, domain: string): ProviderLookupResult {
  const { email: rawEmail, ...withoutEmail } = result;
  const email = rawEmail?.trim().toLowerCase();
  const status = result.status === "VERIFIED" && !isVerifiedBusinessEmail(email, domain) ? "UNKNOWN" : result.status;
  return {
    ...withoutEmail,
    status,
    ...(email && isVerifiedBusinessEmail(email, domain) ? { email } : {}),
    sourceUrls: uniqueSources(result.sourceUrls)
  };
}

function normalizedTarget(target: EnrichmentTarget): EnrichmentTarget {
  return {
    ...target,
    organization: target.organization.trim(),
    organizationDomain: normalizeBusinessDomain(target.organizationDomain),
    domainSourceUrl: target.domainSourceUrl.trim(),
    person: {
      ...target.person,
      firstName: target.person.firstName.trim(),
      lastName: target.person.lastName.trim(),
      fullName: target.person.fullName.trim(),
      currentTitle: target.person.currentTitle.trim(),
      titleSourceUrl: target.person.titleSourceUrl.trim()
    }
  };
}

function uniqueSources(sources: EmailSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const url = source.url.trim();
    if (!/^https:\/\//.test(url) || seen.has(url)) return false;
    seen.add(url);
    return true;
  }).map((source) => ({ ...source, url: source.url.trim() }));
}

function buildBlockers(target: EnrichmentTarget, verified: ProviderLookupResult | undefined, status: EmailVerificationStatus, suppression: SuppressionCheck) {
  const blockers: string[] = [];
  if (!target.organizationDomain || !/^https:\/\//.test(target.domainSourceUrl)) blockers.push("The organization domain needs a verified source.");
  if (!target.person.fullName || !target.person.currentTitle || !/^https:\/\//.test(target.person.titleSourceUrl)) blockers.push("The current finance or grants contact needs an authoritative role source.");
  if (!verified) blockers.push(status === "ACCEPT_ALL" ? "The candidate email is accept-all and needs an additional verified result." : "A verified direct business email has not been established.");
  if (suppression.status === "UNKNOWN") blockers.push("Suppression and contact-history status is not available.");
  if (suppression.status === "BLOCKED") blockers.push(...suppression.reasons.map((reason) => `Suppressed: ${reason}`));
  return blockers;
}

function normalize(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}
