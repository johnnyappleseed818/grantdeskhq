import { createHash } from "node:crypto";
import type { GtmOpportunity } from "./gtm.ts";
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
  deduplicationKey: string;
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
