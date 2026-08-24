export const CONTACT_ENRICHMENT_MODE = "SHADOW" as const;
export const PROSPECT_CHANNELS = ["DIRECT_NONPROFIT", "PARTNER_FRACTIONAL_CFO", "PARTNER_ACCOUNTING", "PARTNER_GRANT_ADVISOR", "PARTNER_NONPROFIT_ADVISOR", "PARTNER_TECH_ADVISOR"] as const;
export type ProspectChannel = typeof PROSPECT_CHANNELS[number];
export const DIRECT_ASSESSMENT_URL = "https://grantdeskhq.com/assessment";
export const PARTNER_DEMO_URL = "https://grantdeskhq.com/demo";
/** Historical compatibility only; future drafts use the benefit-led helpers below. */
export const INTRODUCTORY_GROWTH_OFFER = "We're offering introductory Growth pricing to 25 nonprofit customers at $99/month, normally $199/month.";
export const FREE_FIRST_AWARD_CTA = "Would you be open to trying it with one award for free?";

/** Stable internal verification states; business logic never depends on raw provider strings. */
export type EmailVerificationStatus = "VERIFIED" | "ACCEPT_ALL" | "RISKY" | "INVALID" | "UNKNOWN" | "ERROR" | "VERIFICATION_RESULT_MISSING" | "NOT_FOUND" | "UNAVAILABLE";
export type ContactReadinessState = EmailVerificationStatus | "SUPPRESSED" | "ALREADY_CONTACTED" | "READY_FOR_HUMAN_APPROVAL" | "CONTACT_NOT_ESTABLISHED";
export type SuppressionStatus = "CLEAR" | "BLOCKED" | "UNKNOWN";
export type ContactEnrichmentProviderName = "hunter" | "apollo" | "public";
export type PriorContactStatus = "CLEAR" | "ALREADY_CONTACTED" | "UNKNOWN";
export type OrganizationDedupeStatus = "PASS" | "DUPLICATE";
export type ContactEvidenceStatus = "PASS" | "FAIL";
export type FinderResult = "FOUND" | "NOT_FOUND" | "ERROR" | "NOT_RECORDED";

export interface EnrichmentTarget {
  prospectChannel?: ProspectChannel;
  organization: string;
  organizationDomain: string;
  domainSourceUrl: string;
  person: { firstName: string; lastName: string; fullName: string; currentTitle: string; titleSourceUrl: string; titleObservedAt?: string; responsibilityEvidence?: string };
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
  providerRequestType?: "EMAIL_FINDER_AND_VERIFIER" | "EMAIL_FINDER" | "PEOPLE_MATCH" | "AUTHORITATIVE_PUBLISHED_EMAIL";
  finderResult?: FinderResult;
  verifierStatus?: EmailVerificationStatus;
  verificationTimestamp?: string;
  verificationSource?: EmailSource[];
}

export interface SuppressionCheck {
  status: SuppressionStatus;
  reasons: string[];
  checkedAt: string;
  sourcesChecked: string[];
}

export interface NormalizedVerificationState {
  provider: ContactEnrichmentProviderName | null;
  providerRequestType: "EMAIL_FINDER_AND_VERIFIER" | "EMAIL_FINDER" | "PEOPLE_MATCH" | "AUTHORITATIVE_PUBLISHED_EMAIL" | "RECOVERED_PERSISTED" | "NONE";
  email: string | null;
  finderResult: FinderResult;
  verifierStatus: EmailVerificationStatus;
  providerScore: number | null;
  verificationTimestamp: string | null;
  verificationSource: EmailSource[];
  suppressionStatus: SuppressionStatus;
  priorContactStatus: PriorContactStatus;
  organizationDedupe: OrganizationDedupeStatus;
  contactEvidence: ContactEvidenceStatus;
  blockers: string[];
  readyToSend: boolean;
  readyBlocker: string | null;
  lastEnrichmentAttempt: string | null;
  nextEligibleRetry: string | null;
}

export interface ContactReadinessContext {
  qualifiedOrganization?: boolean;
  priorContactStatus?: PriorContactStatus;
  organizationDedupe?: OrganizationDedupeStatus;
  lastEnrichmentAttempt?: string | null;
  nextEligibleRetry?: string | null;
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
  lastEnrichmentAttempt?: string;
  provider?: ContactEnrichmentProviderName;
  result?: string;
  failureReason?: string;
  candidateFingerprint?: string;
  nextEligibleRetry?: string;
  verification: NormalizedVerificationState;
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
  if (["UNKNOWN", "ERROR", "VERIFICATION_RESULT_MISSING", "NOT_FOUND", "UNAVAILABLE"].includes(record.emailVerificationStatus)) return true;
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
  prior?: Pick<ContactEnrichmentRecord, "createdAt" | "lastEnrichmentAttempt" | "nextEligibleRetry" | "verification">,
  context: ContactReadinessContext = {}
): ContactEnrichmentRecord {
  const normalizedAttempts = providerAttempts.map((attempt) => normalizeProviderResult(attempt, target.organizationDomain));
  const latest = normalizedAttempts.at(-1);
  const latestEmail = latest?.email || prior?.verification?.email || null;
  const verification = evaluateContactReadiness({
    provider: latest?.provider || prior?.verification?.provider || null,
    providerRequestType: latest?.providerRequestType || (latest ? "EMAIL_FINDER_AND_VERIFIER" : prior?.verification ? "RECOVERED_PERSISTED" : "NONE"),
    email: latestEmail,
    finderResult: latest?.finderResult || (latest?.email ? "FOUND" : prior?.verification?.finderResult || "NOT_RECORDED"),
    verifierStatus: normalizedVerifierStatus(latest, prior?.verification),
    providerScore: latest?.confidence ?? prior?.verification?.providerScore ?? null,
    verificationTimestamp: latest?.verificationTimestamp || latest?.attemptedAt || prior?.verification?.verificationTimestamp || null,
    verificationSource: latest?.verificationSource || latest?.sourceUrls || prior?.verification?.verificationSource || [],
    suppressionStatus: suppression.status,
    priorContactStatus: context.priorContactStatus || prior?.verification?.priorContactStatus || "CLEAR",
    organizationDedupe: context.organizationDedupe || prior?.verification?.organizationDedupe || "PASS",
    contactEvidence: hasContactEvidence(target) ? "PASS" : "FAIL",
    lastEnrichmentAttempt: context.lastEnrichmentAttempt ?? prior?.lastEnrichmentAttempt ?? prior?.verification?.lastEnrichmentAttempt ?? latest?.attemptedAt ?? null,
    nextEligibleRetry: context.nextEligibleRetry ?? prior?.nextEligibleRetry ?? prior?.verification?.nextEligibleRetry ?? null
  }, context.qualifiedOrganization ?? true);
  const readiness: ContactReadinessState = verification.readyToSend
    ? "READY_FOR_HUMAN_APPROVAL"
    : verification.priorContactStatus === "ALREADY_CONTACTED"
      ? "ALREADY_CONTACTED"
      : suppression.status === "BLOCKED"
      ? "SUPPRESSED"
      : ["NOT_FOUND", "UNAVAILABLE", "VERIFICATION_RESULT_MISSING"].includes(verification.verifierStatus)
        ? "CONTACT_NOT_ESTABLISHED"
        : verification.verifierStatus;
  return {
    id: contactEnrichmentKey(target),
    mode: CONTACT_ENRICHMENT_MODE,
    target: normalizedTarget(target),
    ...(latestEmail ? { email: latestEmail } : {}),
    ...(latest?.provider ? { emailProvider: latest.provider, providerConfidence: latest.confidence, emailProvenance: verification.verificationSource } : { emailProvenance: verification.verificationSource }),
    emailVerificationStatus: verification.verifierStatus,
    providerAttempts: normalizedAttempts,
    suppression,
    readiness,
    readyForHumanApproval: verification.readyToSend,
    blockers: verification.blockers,
    createdAt: prior?.createdAt || now,
    updatedAt: now,
    verification
  };
}

/** One authoritative fail-closed READY_TO_SEND decision. */
export function evaluateContactReadiness(
  state: Omit<NormalizedVerificationState, "blockers" | "readyToSend" | "readyBlocker">,
  qualifiedOrganization = true
): NormalizedVerificationState {
  const blockers: string[] = [];
  if (!qualifiedOrganization) blockers.push("The organization is not qualified for this outreach segment.");
  if (state.organizationDedupe !== "PASS") blockers.push("Organization dedupe did not pass.");
  if (state.priorContactStatus === "ALREADY_CONTACTED") blockers.push("Previously contacted organizations are not eligible for first-touch outreach.");
  if (state.priorContactStatus === "UNKNOWN") blockers.push("Prior-contact status is not available.");
  if (state.contactEvidence !== "PASS") blockers.push("The current finance or grants contact needs an authoritative role source.");
  if (state.verifierStatus === "ACCEPT_ALL") blockers.push("Hunter returned ACCEPT_ALL; a direct verified result is required.");
  else if (state.verifierStatus === "RISKY") blockers.push("Hunter returned RISKY; a direct verified result is required.");
  else if (state.verifierStatus === "INVALID") blockers.push("Hunter returned INVALID.");
  else if (state.verifierStatus === "ERROR") blockers.push("Hunter verification ended in a provider error.");
  else if (state.verifierStatus === "VERIFICATION_RESULT_MISSING") blockers.push("VERIFICATION_RESULT_MISSING: Finder result exists but no durable verifier result was recorded.");
  else if (state.verifierStatus !== "VERIFIED") blockers.push("A verified direct business email has not been established.");
  if (state.suppressionStatus === "UNKNOWN") blockers.push("Suppression and contact-history status is not available.");
  if (state.suppressionStatus === "BLOCKED") blockers.push("Suppressed by contact-history or unsubscribe policy.");
  if (!state.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(state.email)) blockers.push("A provider-returned business email is required.");
  const readyToSend = blockers.length === 0;
  return { ...state, blockers, readyToSend, readyBlocker: readyToSend ? null : blockers[0] || null };
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
  const subject = "Save time preparing grant reports";
  const body = [
    `Hi ${input.firstName},`,
    "",
    `I saw ${input.organization}'s ${input.awardingAgency} award beginning ${input.awardStartDate}. That timing may make a streamlined reporting process relevant.`,
    "",
    "Preparing a funder report can mean pulling together the award terms, accounting data, program updates, and supporting evidence across several places.",
    "",
    "GrantDeskHQ is designed to reduce that preparation work by creating a source-linked first draft and showing what still needs review. Your team remains responsible for review and submission.",
    "",
    `You can try it with one award here:\n${DIRECT_ASSESSMENT_URL}`,
    "",
    "Would you be open to giving it a try?",
    "",
    "Best,",
    "Eli"
  ].join("\n");
  return { subject, body, status: "SHADOW_DRAFT" as const };
}

export function createDirectOutreachDraft(input: { firstName: string; organization: string; timingSignal: string }) {
  return {
    subject: "Save time preparing grant reports",
    body: [
      `Hi ${input.firstName},`,
      "",
      `I saw ${input.timingSignal} at ${input.organization}. It may make a streamlined reporting process relevant.`,
      "",
      "Preparing a funder report can mean pulling together the award terms, accounting data, program updates, and supporting evidence across several places.",
      "",
      "GrantDeskHQ is designed to reduce that preparation work by creating a source-linked first draft and showing what still needs review. Your team remains responsible for review and submission.",
      "",
      `You can try it with one award here:\n${DIRECT_ASSESSMENT_URL}`,
      "",
      "Would you be open to giving it a try?",
      "",
      "Best,",
      "Eli"
    ].join("\n"),
    status: "SHADOW_DRAFT" as const
  };
}

export interface PartnerShadowDraftInput {
  firstName: string;
  organization: string;
  partnerType: string;
  whySelected: string;
}

export function createPartnerShadowDraft(input: PartnerShadowDraftInput) {
  const subject = "Helping " + input.organization + " clients save time on grant reporting";
  const body = [
    "Hi " + input.firstName + ",",
    "",
    "I came across " + input.organization + " and saw the work you do helping nonprofits with " + input.partnerType + " services. " + input.whySelected,
    "",
    "A lot of post-award reporting still means pulling together the agreement, accounting data, program updates, and supporting evidence by hand.",
    "",
    "GrantDeskHQ is designed to cut down that preparation work by turning those inputs into a source-linked first draft, while the advisor and nonprofit retain review and submission control.",
    "",
    "You can see how the workflow works here:\n" + PARTNER_DEMO_URL,
    "",
    "Would you be open to trying it with one nonprofit client or award?",
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
    sourceUrls: uniqueSources(result.sourceUrls),
    verifierStatus: mapProviderVerificationStatus(result.verifierStatus || status),
    ...(result.verificationSource ? { verificationSource: uniqueSources(result.verificationSource) } : {})
  };
}

function normalizedTarget(target: EnrichmentTarget): EnrichmentTarget {
  return {
    ...target,
    ...(target.prospectChannel ? { prospectChannel: target.prospectChannel } : {}),
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

export function hasAppropriateDirectRecipientTitle(title: string, responsibilityEvidence = "") {
  const financeOrGrants = /(chief financial|chief finance|\bcfo\b|vp.{0,12}finance|(finance|grants).{0,18}director|director.{0,18}(finance|grants)|controller|comptroller|director.{0,8}accounting|accounting.{0,8}director|grants? manager|grants?.{0,12}contracts?|grant finance|grant accountant|grants? administrator|grant compliance|post.?award.{0,18}(manager|grants?))/i.test(title);
  if (financeOrGrants) return true;
  const operatingFallback = /(chief operating|\bcoo\b|chief administrative|director.{0,12}operations|operations.{0,12}director|vp.{0,12}operations|director.{0,18}administration)/i.test(title);
  return operatingFallback && /(grant reporting|grant compliance|financial reporting|restricted funds|grant accounting|post.?award|grant budgets?|budget.?to.?actual|funding compliance|grants?.{0,12}contracts?)/i.test(responsibilityEvidence);
}

function hasContactEvidence(target: EnrichmentTarget) {
  if (!target.organizationDomain || !/^https:\/\//.test(target.domainSourceUrl) || !target.person.fullName || !target.person.currentTitle || !/^https:\/\//.test(target.person.titleSourceUrl)) return false;
  // Direct first-touch records must use a finance or grants operating owner.
  // Partner titles intentionally remain broader because that segment is an
  // advisory/distribution motion, not the nonprofit reporting owner itself.
  if (target.prospectChannel === "DIRECT_NONPROFIT" && !hasAppropriateDirectRecipientTitle(target.person.currentTitle, target.person.responsibilityEvidence)) return false;
  return true;
}

function normalizedVerifierStatus(attempt: ProviderLookupResult | undefined, prior: NormalizedVerificationState | undefined): EmailVerificationStatus {
  if (attempt) return mapProviderVerificationStatus(attempt.verifierStatus || attempt.status);
  if (prior) return mapProviderVerificationStatus(prior.verifierStatus);
  return "VERIFICATION_RESULT_MISSING";
}

export function mapProviderVerificationStatus(value: string | undefined): EmailVerificationStatus {
  switch (String(value || "").trim().toUpperCase()) {
    case "VERIFIED": case "VALID": return "VERIFIED";
    case "ACCEPT_ALL": case "ACCEPT-ALL": return "ACCEPT_ALL";
    case "RISKY": return "RISKY";
    case "INVALID": return "INVALID";
    case "ERROR": case "UNAVAILABLE": return "ERROR";
    case "NOT_FOUND": case "VERIFICATION_RESULT_MISSING": return "VERIFICATION_RESULT_MISSING";
    default: return "UNKNOWN";
  }
}

function normalize(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}
