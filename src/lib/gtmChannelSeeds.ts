import { createHash } from "node:crypto";
import type { DailySocialSignal, GtmOpportunity } from "./gtm.ts";
import type { PartnerDiscoveryOpportunity } from "../../server/gtmPartnerDiscovery.ts";
import type { CanonicalGtmCandidate, CanonicalSegment } from "./gtmCanonical.ts";

/** Imported organization seeds are not contact records. */
export interface ChannelSeedRecord {
  id: string;
  organization: string;
  segment: CanonicalSegment;
  targetRoleGroup: string[];
  source: string;
  sourceUrl: string;
  observedAt: string;
  importedAt: string;
  lifecycle: "DISCOVERED" | "DUPLICATE" | "REJECTED" | "ROLE_UNRESOLVED" | "ENRICHMENT_PENDING" | "ENRICHMENT_SUBMITTED" | "ENRICHMENT_FAILED" | "VERIFIED";
  organizationDomain: string | null;
  evidenceSummary: string;
  qualificationReasons: string[];
  rejectionReason: string | null;
  enrichmentProvider: string | null;
  enrichmentResult: string | null;
  enrichmentResourceId?: string | null;
  enrichmentUpdatedAt?: string | null;
  /** Instantly enrichment operation ID, distinct from the target lead list. */
  enrichmentJobId?: string | null;
  enrichmentProviderStatus?: "SUBMITTED" | "PROCESSING" | "COMPLETED" | "FAILED" | "MISSING_PROVIDER_OBJECT" | "STALE" | null;
  enrichmentSubmittedAt?: string | null;
  enrichmentLastCheckedAt?: string | null;
  enrichmentAttemptCount?: number;
  enrichmentLastProviderError?: string | null;
  enrichmentTerminalAt?: string | null;
  deduplicationKey: string;
  scannerBatchId?: string;
  scannerFileId?: string;
  scannerSourceRecordKey?: string;
  scannerContentHash?: string;
  scannerClaimedDomain?: string | null;
  scannerUnknownFields?: Record<string, unknown>;
}

export const CHANNEL_SCAN_SOURCE_URL = "https://chatgpt.com/share/6a913e29-1c68-83ed-acc3-8c6e00423acb?ogimg=plain";

/** A deliberately small, primary-source verified subset. Every other shared
 * scan row stays DISCOVERED until an independent verifier supplies the same
 * organization/domain/role evidence. */
const independentlyVerifiedPartnerSeeds: Record<string, Pick<ChannelSeedRecord, "organizationDomain" | "sourceUrl" | "evidenceSummary" | "qualificationReasons">> = {
  "Jitasa": { organizationDomain: "jitasagroup.com", sourceUrl: "https://www.jitasagroup.com/about/", evidenceSummary: "Jitasa's official management page identifies its leadership and describes nonprofit accounting services; founder/executive leadership is an appropriate partner-role group.", qualificationReasons: ["Official organization domain confirmed.", "Official management page confirms a partner decision-maker role group.", "Official site describes nonprofit accounting services."] },
  "GrantWin Consulting": { organizationDomain: "grantwinconsulting.com", sourceUrl: "https://www.grantwinacademy.com/global-grant-collective", evidenceSummary: "GrantWin's official founder page identifies Patrice Davis and describes pre- and post-award consulting and training.", qualificationReasons: ["Official organization domain confirmed.", "Official founder role confirmed.", "Official source describes post-award grant-management work."] },
  "CFO Leverage": { organizationDomain: "cfoleverage.com", sourceUrl: "https://www.cfoleverage.com/about", evidenceSummary: "CFO Leverage's official team page identifies co-founders and describes nonprofit financial leadership and accounting services.", qualificationReasons: ["Official organization domain confirmed.", "Official co-founder role confirmed.", "Official site describes nonprofit financial services."] },
  "JFW Accounting Services": { organizationDomain: "jfwaccountingservices.cpa", sourceUrl: "https://jfwaccountingservices.cpa/", evidenceSummary: "JFW's official site identifies Jo-Anne Williams-Barnes as Founder & CEO and describes nonprofit accounting, restricted-fund, audit, and grant-reporting services.", qualificationReasons: ["Official organization domain confirmed.", "Official founder/CEO role confirmed.", "Official source describes nonprofit grant and compliance work."] },
  "DSD Business Systems": { organizationDomain: "dsdinc.com", sourceUrl: "https://www.dsdinc.com/about-us/", evidenceSummary: "DSD's official team page identifies its founder and describes accounting/ERP implementation services; partner relevance remains limited to evidence-supported technology/service collaboration.", qualificationReasons: ["Official organization domain confirmed.", "Official founder role confirmed.", "Official source describes accounting/ERP services."] }
};
const independentlyVerifiedDirectSeeds: Record<string, Pick<ChannelSeedRecord, "organizationDomain" | "sourceUrl" | "evidenceSummary" | "qualificationReasons">> = {
  "Mama’s Kitchen": { organizationDomain: "mamaskitchen.org", sourceUrl: "https://mamaskitchen.org/wp-content/uploads/2026/02/MAMAS-KITCHEN-INC-MAMAS-KITCHEN-6-30-25-AUDITED-FINANCIAL-STATEMENTS-FINAL.pdf", evidenceSummary: "Mama's Kitchen's published audited financial statements include federal grant activity and Uniform Guidance reporting context; finance/grants operating-owner search is appropriate.", qualificationReasons: ["Official organization domain confirmed.", "Published financial statement documents federal grant activity.", "Finance/grants role group is required for any provider contact search."] }
};

const directOrganizations = [
  "Avenge Pediatric Cancer Foundation", "Freedom Service Dogs of America", "Mama’s Kitchen", "Armand Bayou Nature Center", "Barbara Bush Houston Literacy Foundation", "Baytown Habitat for Humanity", "Compudopt", "Galena Park Resource and Training Center", "Lee College Foundation", "Kids’ Meals", "Second Servings of Houston", "Target Hunger", "Ronald McDonald House Charities Greater Houston", "The Rose", "SERJobs", "Women Offshore Foundation", "Prison Entrepreneurship Program", "Houston Symphony Society", "Segundo Barrio Children’s Chorus", "Experiences That Matter Foundation"
];
const partnerOrganizations = [
  "Jitasa", "Resurgens Impact Consulting", "GrantWin Consulting", "CFO Leverage", "Your Part-Time Controller / YPTC", "JFW Accounting Services", "Anders CPAs + Advisors", "Cherry Bekaert", "Attain Partners", "DSD Business Systems"
];

function recordId(segment: CanonicalSegment, organization: string) {
  return `channel_seed_${createHash("sha256").update(`${segment}:${organization.normalize("NFKC").trim().toLowerCase()}`).digest("hex").slice(0, 24)}`;
}

export function channelSeedManifest(importedAt = new Date().toISOString()): ChannelSeedRecord[] {
  const build = (organization: string, segment: CanonicalSegment): ChannelSeedRecord => {
    const verified = segment === "PARTNER" ? independentlyVerifiedPartnerSeeds[organization] : independentlyVerifiedDirectSeeds[organization];
    return {
    id: recordId(segment, organization), organization, segment,
    targetRoleGroup: segment === "DIRECT"
      ? ["CFO", "Finance Director", "Controller", "Director of Grants", "Grants Manager", "Institutional Giving leader"]
      : ["Founder", "CEO", "Managing Partner", "Nonprofit Practice Lead", "Grants-management or alliances leader"],
    source: "chatgpt_channel_scan_2026_08_28", sourceUrl: verified?.sourceUrl || CHANNEL_SCAN_SOURCE_URL,
    observedAt: "2026-08-28", importedAt, lifecycle: verified ? "ENRICHMENT_PENDING" : "DISCOVERED", organizationDomain: verified?.organizationDomain || null,
    evidenceSummary: verified?.evidenceSummary || "Organization seed imported from a shared channel scan; no scan claim is treated as verified evidence.",
    qualificationReasons: verified?.qualificationReasons || ["Requires independent public organization, signal, role, and email verification before enrichment."],
    rejectionReason: null, enrichmentProvider: null, enrichmentResult: null,
    deduplicationKey: `${segment}:${organization.normalize("NFKC").trim().toLowerCase()}`
    };
  };
  return [...directOrganizations.map((organization) => build(organization, "DIRECT")), ...partnerOrganizations.map((organization) => build(organization, "PARTNER"))];
}

/** Converts public, evidence-backed organization discovery into the existing
 * Instantly-first enrichment queue. This preserves the source signal but does
 * not create a contact, enroll a campaign, or allow a send. */
export function discoveredOpportunityToChannelSeed(opportunity: GtmOpportunity, importedAt = new Date().toISOString()): ChannelSeedRecord {
  return dynamicSeed({ organization: opportunity.organization, segment: "DIRECT", organizationDomain: domainFromUrl(opportunity.organizationUrl || ""), sourceUrl: opportunity.evidence[0]?.url || opportunity.organizationUrl || "", observedAt: opportunity.observedAt || importedAt, evidenceSummary: opportunity.whyNow, targetRoleGroup: ["CFO", "Finance Director", "Controller", "Director of Grants", "Grants Manager", "Institutional Giving leader"], importedAt });
}

export function discoveredPartnerToChannelSeed(opportunity: PartnerDiscoveryOpportunity, importedAt = new Date().toISOString()): ChannelSeedRecord {
  return dynamicSeed({ organization: opportunity.organization, segment: "PARTNER", organizationDomain: opportunity.organizationDomain, sourceUrl: opportunity.sourceUrl, observedAt: opportunity.observedAt || importedAt, evidenceSummary: opportunity.whyFit, targetRoleGroup: ["Founder", "CEO", "Managing Partner", "Nonprofit Practice Lead", "Partner", "Principal"], importedAt });
}

function dynamicSeed(input: { organization: string; segment: CanonicalSegment; organizationDomain: string; sourceUrl: string; observedAt: string; evidenceSummary: string; targetRoleGroup: string[]; importedAt: string }): ChannelSeedRecord {
  const organization = input.organization.trim();
  return { id: recordId(input.segment, organization), organization, segment: input.segment, targetRoleGroup: input.targetRoleGroup, source: "gtm_public_discovery", sourceUrl: input.sourceUrl, observedAt: input.observedAt, importedAt: input.importedAt, lifecycle: "ENRICHMENT_PENDING", organizationDomain: input.organizationDomain || null, evidenceSummary: input.evidenceSummary, qualificationReasons: ["Evidence-backed organization signal was saved by the daily GrantDeskHQ discovery worker.", "Provider enrichment must produce a verified business email before readiness."], rejectionReason: null, enrichmentProvider: null, enrichmentResult: null, deduplicationKey: input.segment + ":" + organization.normalize("NFKC").trim().toLowerCase() };
}

export interface ScannerLeadFeedRecord {
  source_record_key: string;
  segment: CanonicalSegment;
  organization_name: string;
  organization_domain?: string | null;
  signal_text?: string | null;
  source_urls?: unknown;
  source_confidence?: string | null;
  unresolved_fields?: string | null;
  [key: string]: unknown;
}

export interface ScannerSocialResearchRecord {
  source_record_key: string;
  platform?: string | null;
  source_url?: string | null;
  published_at?: string | null;
  observed_at?: string | null;
  evidence_excerpt?: string | null;
  pain_category?: string | null;
  fit_rationale?: string | null;
  attribution_status?: string | null;
  next_action?: string | null;
  organization_name?: string | null;
  organization_domain?: string | null;
}

/** Anonymous scanner research remains visible but cannot create an outbound seed. */
export function scannerSocialResearchToSignals(input: { batchId: string; records: readonly ScannerSocialResearchRecord[]; observedAt?: string }) {
  const observedAt = input.observedAt || new Date().toISOString();
  const accepted: DailySocialSignal[] = [];
  const rejected: Array<{ sourceRecordKey: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const raw of input.records) {
    const sourceRecordKey = typeof raw.source_record_key === "string" ? raw.source_record_key.trim() : "";
    const url = typeof raw.source_url === "string" ? raw.source_url.trim() : "";
    const platform = String(raw.platform || "").trim().toLowerCase();
    if (!sourceRecordKey || !url || platform !== "reddit" || !isSafePublicSourceUrl(url) || !/^https:\/\/(?:www\.)?reddit\.com\/r\/[^/]+\/comments\//i.test(url)) {
      rejected.push({ sourceRecordKey, reason: "MALFORMED_OR_UNSAFE_SOCIAL_RESEARCH" });
      continue;
    }
    const id = `scanner-social-${createHash("sha256").update(`${input.batchId}:${sourceRecordKey}:${url}`).digest("hex").slice(0, 18)}`;
    if (seen.has(id)) { rejected.push({ sourceRecordKey, reason: "DUPLICATE_SOCIAL_SOURCE_RECORD" }); continue; }
    seen.add(id);
    const pain = scannerText(raw.pain_category, "Post-award reporting research");
    const evidence = scannerText(raw.evidence_excerpt, "Older anonymous public research evidence.");
    accepted.push({
      id, platform: "reddit", title: `Historical Reddit research: ${pain}`.slice(0, 180), url,
      author: "anonymous", publishedAt: scannerText(raw.published_at, "unknown"), observedAt: scannerText(raw.observed_at, observedAt),
      evidenceSummary: evidence, observedPain: pain, painThemes: [pain],
      whyRelevant: scannerText(raw.fit_rationale, "Older anonymous research evidence only; no organization or buyer is identified."),
      suggestedResponse: "RESEARCH_ONLY — preserve for content and product research; do not contact or engage this anonymous author.",
      status: "SKIPPED"
    });
  }
  return { accepted, rejected };
}

/** Scanner exports are untrusted discovery data. They never advance to enrichment or READY. */
export function scannerLeadFeedToChannelSeeds(input: { batchId: string; sourceFileId: string; contentHash: string; records: readonly ScannerLeadFeedRecord[]; importedAt?: string }) {
  const importedAt = input.importedAt || new Date().toISOString();
  const accepted: ChannelSeedRecord[] = [];
  const rejected: Array<{ sourceRecordKey: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const raw of input.records) {
    const sourceRecordKey = typeof raw.source_record_key === "string" ? raw.source_record_key.trim() : "";
    const organization = typeof raw.organization_name === "string" ? raw.organization_name.normalize("NFKC").trim() : "";
    const segment = raw.segment;
    const urls = Array.isArray(raw.source_urls) ? raw.source_urls.filter((value): value is string => typeof value === "string") : [];
    const sourceUrl = urls.find(isSafePublicSourceUrl) || "";
    if (!sourceRecordKey || !organization || (segment !== "DIRECT" && segment !== "PARTNER")) { rejected.push({ sourceRecordKey, reason: "MALFORMED_REQUIRED_FIELDS" }); continue; }
    if (!sourceUrl) { rejected.push({ sourceRecordKey, reason: "NO_SAFE_SOURCE_URL" }); continue; }
    if (seen.has(sourceRecordKey)) { rejected.push({ sourceRecordKey, reason: "DUPLICATE_SOURCE_RECORD_KEY" }); continue; }
    seen.add(sourceRecordKey);
    const claimedDomain = typeof raw.organization_domain === "string" && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw.organization_domain.trim()) ? raw.organization_domain.trim().toLowerCase().replace(/^www\./, "") : null;
    const id = `channel_seed_${createHash("sha256").update(`${input.batchId}:${sourceRecordKey}`).digest("hex").slice(0, 24)}`;
    const unknown = Object.fromEntries(Object.entries(raw).filter(([key]) => !["source_record_key", "segment", "organization_name", "organization_domain", "signal_text", "source_urls", "source_confidence", "unresolved_fields", "state", "verification_status", "email", "email_verification"].includes(key)));
    accepted.push({ id, organization, segment, targetRoleGroup: segment === "DIRECT" ? ["CFO", "Finance Director", "Controller", "Director of Grants", "Grants Manager", "Executive Director"] : ["Founder", "Managing Partner", "Nonprofit Practice Lead", "Fractional CFO", "Grant Consulting Lead"], source: "chatgpt_scanner_drive", sourceUrl, observedAt: scannerObservedAt(raw, importedAt), importedAt, lifecycle: "DISCOVERED", organizationDomain: null, evidenceSummary: scannerText(raw.signal_text, "Scanner research claim requires independent organization and evidence validation."), qualificationReasons: ["Imported scanner candidate is DISCOVERED only.", `Scanner confidence: ${scannerText(raw.source_confidence, "unknown")}.`, scannerText(raw.unresolved_fields, "Organization, ICP, role, evidence, and email require validation.")], rejectionReason: null, enrichmentProvider: null, enrichmentResult: null, deduplicationKey: `${segment}:${organization.toLowerCase()}`, scannerBatchId: input.batchId, scannerFileId: input.sourceFileId, scannerSourceRecordKey: sourceRecordKey, scannerContentHash: input.contentHash, scannerClaimedDomain: claimedDomain, scannerUnknownFields: unknown });
  }
  return { accepted, rejected };
}

function scannerText(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value.trim().slice(0, 900) : fallback; }
function scannerObservedAt(raw: ScannerLeadFeedRecord, fallback: string) { const value = typeof raw.signal_date === "string" ? raw.signal_date : typeof raw.observed_at === "string" ? raw.observed_at : ""; return Number.isFinite(Date.parse(value)) ? value : fallback; }
function isSafePublicSourceUrl(value: string) { try { const url = new URL(value); const host = url.hostname.toLowerCase(); return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && host !== "localhost" && host !== "metadata.google.internal" && !/^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host); } catch { return false; } }


function domainFromUrl(value: string) { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } }

/** Seed records remain organization evidence until provider reconciliation records a
 * role-fit, verified business contact. Their lifecycle is visible in the
 * canonical queue; it never implies an email has been sent. */
export function channelSeedToCanonicalCandidate(seed: ChannelSeedRecord): CanonicalGtmCandidate {
  const evidenceVerified = Boolean(seed.organizationDomain && ["ENRICHMENT_PENDING", "ENRICHMENT_SUBMITTED", "VERIFIED"].includes(seed.lifecycle));
  const providerVerified = seed.lifecycle === "VERIFIED";
  const blockers = providerVerified ? [] : seed.lifecycle === "ENRICHMENT_SUBMITTED" ? ["INSTANTLY_ENRICHMENT_PENDING"] : seed.lifecycle === "ENRICHMENT_FAILED" ? ["ENRICHMENT_FAILED"] : ["SEED_REQUIRES_INDEPENDENT_PUBLIC_VERIFICATION", "NO_RESOLVED_DOMAIN", "NO_NAMED_CONTACT", "NO_VERIFIED_BUSINESS_EMAIL"];
  return {
    id: seed.id, segment: seed.segment, qualified: evidenceVerified,
    target: {
      organization: seed.organization,
      organizationDomain: seed.organizationDomain || `${seed.id}.unresolved.invalid`,
      domainSourceUrl: seed.sourceUrl,
      person: { firstName: "Contact", lastName: "Research", fullName: "Contact research required", currentTitle: "Role research required", titleSourceUrl: seed.sourceUrl }
    },
    sourceUrl: seed.sourceUrl, whyNow: seed.evidenceSummary, priority: providerVerified ? 90 : evidenceVerified ? 70 : 0,
    blockers
  };
}
