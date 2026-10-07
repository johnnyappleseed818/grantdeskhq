import type { ChannelSeedRecord } from "../src/lib/gtmChannelSeeds.ts";

/**
 * Supplemental public identity evidence for one immutable scanner batch. This
 * is deliberately narrower than a discovery source: it binds only a supplied
 * source-record key, the original award page, and a publicly reachable
 * organization page. The normal validator must still fetch both pages and
 * establish ICP fit before any contact-provider work can begin.
 */
export const DALLAS_FOUNDATION_2026_SUMMER_AWARD_URL = "https://www.dallasfoundation.org/general/the-dallas-foundation-awards-nearly-2-7-million-through-2026-summer-grant-cycle/";
export const DALLAS_FOUNDATION_2026_SUMMER_BATCH_ID = "0948d4f4-a261-40ed-b6e9-9434244558d4";

export type SupplementalIdentityEvidence = {
  sourceKey: string;
  originalOrganizationName: string;
  proposedDomain: string;
  identityEvidenceUrl: string;
  sharedAwardSourceUrl: string;
  aliases: string[];
};

type SuppliedIdentity = Omit<SupplementalIdentityEvidence, "sourceKey" | "sharedAwardSourceUrl">;

const supplied: SuppliedIdentity[] = [
  { originalOrganizationName: "Living for Zachary", proposedDomain: "livingforzachary.org", identityEvidenceUrl: "https://www.livingforzachary.org/", aliases: [] },
  { originalOrganizationName: "Health Services of North Texas, Inc.", proposedDomain: "healthservicesntx.org", identityEvidenceUrl: "https://healthservicesntx.org/about-us/", aliases: ["Health Services of North Texas"] },
  { originalOrganizationName: "Dallas Services", proposedDomain: "dallasservices.org", identityEvidenceUrl: "https://dallasservices.org/about-us/", aliases: [] },
  { originalOrganizationName: "Beyond the Burn Foundation", proposedDomain: "beyondtheburnfoundation.org", identityEvidenceUrl: "https://beyondtheburnfoundation.org/about-us/", aliases: ["Sons of the Flag"] },
  { originalOrganizationName: "The Concilio", proposedDomain: "theconcilio.org", identityEvidenceUrl: "https://theconcilio.org/about-us/", aliases: [] },
  { originalOrganizationName: "Society of St. Vincent de Paul Charitable Pharmacy of North Texas, Inc.", proposedDomain: "svdpdallas.org", identityEvidenceUrl: "https://www.svdpdallas.org/st-vincent-center-services", aliases: ["Society of St. Vincent de Paul Charitable Pharmacy of North Texas", "NPI 1295237543"] },
  { originalOrganizationName: "Healing Hands Ministries (HHM Health)", proposedDomain: "hhmhealth.org", identityEvidenceUrl: "https://www.hhmhealth.org/about-us/", aliases: ["Healing Hands Ministries", "HHM Health"] },
  { originalOrganizationName: "Rosa Es Rojo, Inc", proposedDomain: "supervive.org", identityEvidenceUrl: "https://www.supervive.org/medios", aliases: ["ROSAesROJO", "SuperVive"] },
  { originalOrganizationName: "Prism Health North Texas", proposedDomain: "phntx.org", identityEvidenceUrl: "https://www.phntx.org/about-prism-health-north-texas/", aliases: [] },
  { originalOrganizationName: "Vickery Meadow Youth Development Foundation", proposedDomain: "vmydf.org", identityEvidenceUrl: "https://www.vmydf.org/about", aliases: [] },
  { originalOrganizationName: "YMCA of Metropolitan Dallas", proposedDomain: "ymcadallas.org", identityEvidenceUrl: "https://ymcadallas.org/about-us", aliases: ["YMCA Dallas"] },
  { originalOrganizationName: "Hope Cottage Inc.", proposedDomain: "hopecottage.org", identityEvidenceUrl: "https://www.hopecottage.org/about-hope-cottage", aliases: ["Hope Cottage"] },
  { originalOrganizationName: "Scottish Rite for Children", proposedDomain: "scottishriteforchildren.org", identityEvidenceUrl: "https://scottishriteforchildren.org/about/", aliases: [] },
  { originalOrganizationName: "The Agape Clinic", proposedDomain: "theagapeclinic.org", identityEvidenceUrl: "https://www.theagapeclinic.org/", aliases: [] },
  { originalOrganizationName: "The Magdalen House", proposedDomain: "magdalenhouse.org", identityEvidenceUrl: "https://magdalenhouse.org/about-us/", aliases: [] },
  { originalOrganizationName: "Center for Integrative Counseling and Psychology", proposedDomain: "thecentercounseling.org", identityEvidenceUrl: "https://thecentercounseling.org/about-us/history/", aliases: ["Pastoral Counseling Center"] },
  { originalOrganizationName: "Youth 180 Inc.", proposedDomain: "youth180tx.org", identityEvidenceUrl: "https://www.youth180tx.org/aboutus", aliases: ["Youth180", "Dallas Challenge"] },
  { originalOrganizationName: "Girls, Incorporated of Metropolitan Dallas", proposedDomain: "girlsincdallas.org", identityEvidenceUrl: "https://www.girlsincdallas.org/", aliases: ["Girls Inc. of Metropolitan Dallas"] },
  { originalOrganizationName: "Community Partners of Dallas", proposedDomain: "cpdtx.org", identityEvidenceUrl: "https://www.cpdtx.org/about-us/", aliases: [] },
  { originalOrganizationName: "Rebuilding Together Greater Dallas", proposedDomain: "rtntx.org", identityEvidenceUrl: "https://rtntx.org/terms-and-conditions", aliases: ["Rebuilding Together Greater Dallas, Inc.", "Rebuilding Together North Texas"] }
];

export function scannerSupplementalIdentitySourceKey(organization: string) {
  return `${organization.normalize("NFKC").trim().toLowerCase()}|${DALLAS_FOUNDATION_2026_SUMMER_AWARD_URL}`;
}

function normalizedUrl(value: string) {
  try { return new URL(value).toString(); } catch { return ""; }
}

const evidenceByKey = new Map(supplied.map((entry) => {
  const sourceKey = scannerSupplementalIdentitySourceKey(entry.originalOrganizationName);
  return [sourceKey, { ...entry, sourceKey, sharedAwardSourceUrl: DALLAS_FOUNDATION_2026_SUMMER_AWARD_URL } satisfies SupplementalIdentityEvidence];
}));

/** Returns evidence only when the immutable batch, original award URL, and
 * supplied record-key convention all agree. A same-named organization from
 * another source cannot inherit this evidence. */
export function scannerSupplementalIdentityEvidenceFor(seed: Pick<ChannelSeedRecord, "source" | "segment" | "scannerBatchId" | "scannerSourceRecordKey" | "sourceUrl">): SupplementalIdentityEvidence | null {
  if (seed.source !== "chatgpt_scanner_drive" || seed.segment !== "DIRECT" || seed.scannerBatchId !== DALLAS_FOUNDATION_2026_SUMMER_BATCH_ID) return null;
  if (normalizedUrl(seed.sourceUrl) !== normalizedUrl(DALLAS_FOUNDATION_2026_SUMMER_AWARD_URL)) return null;
  const key = String(seed.scannerSourceRecordKey || "").normalize("NFKC").trim().toLowerCase();
  return evidenceByKey.get(key) || null;
}

export function attachScannerSupplementalIdentityEvidence(seed: ChannelSeedRecord): ChannelSeedRecord {
  const evidence = scannerSupplementalIdentityEvidenceFor(seed);
  if (!evidence || JSON.stringify(seed.scannerSupplementalIdentityEvidence || null) === JSON.stringify(evidence)) return seed;
  return { ...seed, scannerSupplementalIdentityEvidence: evidence };
}

/** Aliases are considered only after the immutable batch/source-key match. */
export function supplementalOrganizationNames(seed: Pick<ChannelSeedRecord, "organization" | "scannerSupplementalIdentityEvidence">) {
  return [seed.organization, ...(seed.scannerSupplementalIdentityEvidence?.aliases || [])]
    .map((value) => value.normalize("NFKC").trim())
    .filter(Boolean);
}
