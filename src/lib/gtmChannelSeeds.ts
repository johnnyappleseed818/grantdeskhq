import { createHash } from "node:crypto";
import type { CanonicalGtmCandidate, CanonicalSegment } from "./gtmCanonical.ts";

/** Imported organization seeds are not contact records. */
export interface ChannelSeedRecord {
  id: string;
  organization: string;
  segment: CanonicalSegment;
  targetRoleGroup: string[];
  source: "chatgpt_channel_scan_2026_08_28";
  sourceUrl: string;
  observedAt: string;
  importedAt: string;
  lifecycle: "DISCOVERED" | "DUPLICATE" | "REJECTED" | "ROLE_UNRESOLVED" | "ENRICHMENT_PENDING";
  organizationDomain: string | null;
  evidenceSummary: string;
  qualificationReasons: string[];
  rejectionReason: string | null;
  enrichmentProvider: string | null;
  enrichmentResult: string | null;
  deduplicationKey: string;
}

export const CHANNEL_SCAN_SOURCE_URL = "https://chatgpt.com/share/6a913e29-1c68-83ed-acc3-8c6e00423acb?ogimg=plain";

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
  const build = (organization: string, segment: CanonicalSegment): ChannelSeedRecord => ({
    id: recordId(segment, organization), organization, segment,
    targetRoleGroup: segment === "DIRECT"
      ? ["CFO", "Finance Director", "Controller", "Director of Grants", "Grants Manager", "Institutional Giving leader"]
      : ["Founder", "CEO", "Managing Partner", "Nonprofit Practice Lead", "Grants-management or alliances leader"],
    source: "chatgpt_channel_scan_2026_08_28", sourceUrl: CHANNEL_SCAN_SOURCE_URL,
    observedAt: "2026-08-28", importedAt, lifecycle: "DISCOVERED", organizationDomain: null,
    evidenceSummary: "Organization seed imported from a shared channel scan; no scan claim is treated as verified evidence.",
    qualificationReasons: ["Requires independent public organization, signal, role, and email verification before enrichment."],
    rejectionReason: null, enrichmentProvider: null, enrichmentResult: null,
    deduplicationKey: `${segment}:${organization.normalize("NFKC").trim().toLowerCase()}`
  });
  return [...directOrganizations.map((organization) => build(organization, "DIRECT")), ...partnerOrganizations.map((organization) => build(organization, "PARTNER"))];
}

/** Seed records enter the canonical view but cannot become sendable. */
export function channelSeedToCanonicalCandidate(seed: ChannelSeedRecord): CanonicalGtmCandidate {
  return {
    id: seed.id, segment: seed.segment, qualified: false,
    target: {
      organization: seed.organization,
      organizationDomain: `${seed.id}.unresolved.invalid`,
      domainSourceUrl: seed.sourceUrl,
      person: { firstName: "Contact", lastName: "Research", fullName: "Contact research required", currentTitle: "Role research required", titleSourceUrl: seed.sourceUrl }
    },
    sourceUrl: seed.sourceUrl, whyNow: seed.evidenceSummary, priority: 0,
    blockers: ["SEED_REQUIRES_INDEPENDENT_PUBLIC_VERIFICATION", "NO_RESOLVED_DOMAIN", "NO_NAMED_CONTACT", "NO_VERIFIED_BUSINESS_EMAIL"]
  };
}
