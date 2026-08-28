import { canonicalGtmCandidates } from "./contactEnrichmentBatch.ts";
import { listGtmChannelSeeds, listGtmContactEnrichments, readGtmAwardScan, readGtmDirectDiscoveryScan, readGtmOutreachLedger, readInstantlyRecords, readGtmPartnerDiscoveryScan } from "./persistence.ts";
import { confirmedHumanOutreach } from "../src/lib/gtmOutreach.ts";
import { buildCanonicalGtmModel } from "../src/lib/gtmCanonical.ts";
import { channelSeedToCanonicalCandidate } from "../src/lib/gtmChannelSeeds.ts";

/** Read-only composition boundary for every founder-facing commercial queue. */
export async function readCanonicalGtmModel() {
  const [enrichments, outreach, awardScan, directDiscovery, partnerDiscovery, instantly, seeds] = await Promise.all([
    listGtmContactEnrichments(),
    readGtmOutreachLedger(confirmedHumanOutreach),
    readGtmAwardScan(),
    readGtmDirectDiscoveryScan(),
    readGtmPartnerDiscoveryScan(),
    readInstantlyRecords(), listGtmChannelSeeds()
  ]);
  return buildCanonicalGtmModel({ candidates: [...canonicalGtmCandidates([...(awardScan?.opportunities || []), ...(directDiscovery?.opportunities || [])], partnerDiscovery?.opportunities || []), ...seeds.map(channelSeedToCanonicalCandidate)], enrichments, outreach, instantly });
}
