import { canonicalGtmCandidates } from "./contactEnrichmentBatch.ts";
import { listGtmContactEnrichments, readGtmAwardScan, readGtmDirectDiscoveryScan, readGtmOutreachLedger, readInstantlyRecords } from "./persistence.ts";
import { confirmedHumanOutreach } from "../src/lib/gtmOutreach.ts";
import { buildCanonicalGtmModel } from "../src/lib/gtmCanonical.ts";

/** Read-only composition boundary for every founder-facing commercial queue. */
export async function readCanonicalGtmModel() {
  const [enrichments, outreach, awardScan, directDiscovery, instantly] = await Promise.all([
    listGtmContactEnrichments(),
    readGtmOutreachLedger(confirmedHumanOutreach),
    readGtmAwardScan(),
    readGtmDirectDiscoveryScan(),
    readInstantlyRecords()
  ]);
  return buildCanonicalGtmModel({ candidates: canonicalGtmCandidates([...(awardScan?.opportunities || []), ...(directDiscovery?.opportunities || [])]), enrichments, outreach, instantly });
}
