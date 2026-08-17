import type { AwardDiscoveryCriteria, AwardDiscoveryScan, GtmOpportunity, TargetTier } from "../src/lib/gtm.ts";

const ENDPOINT = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const AWARD_TYPES = ["02", "03", "04", "05"];
const RECIPIENT_TYPES = ["Nonprofit Organization"];

interface AwardRecord {
  "Award ID"?: string;
  "Recipient Name"?: string;
  "Award Amount"?: number | string;
  "Description"?: string;
  "Start Date"?: string;
  "End Date"?: string;
  "Awarding Agency"?: string;
  "Awarding Sub Agency"?: string;
  "Assistance Listing"?: string | { cfda_number?: string; program_title?: string };
  generated_internal_id?: string;
}

interface AwardPage {
  results?: AwardRecord[];
  page_metadata?: { hasNext?: boolean };
}

export function awardDiscoveryCriteria(scanDate: string, environment: NodeJS.ProcessEnv = process.env): AwardDiscoveryCriteria {
  const windowDays = boundedInteger(environment.GTM_AWARD_WINDOW_DAYS, 90, 14, 365);
  return {
    startDate: environment.GTM_SCAN_START_DATE || offsetDate(scanDate, -windowDays),
    endDate: scanDate,
    minimumAward: boundedNumber(environment.GTM_MINIMUM_AWARD, 25_000, 1_000, 10_000_000),
    recipientTypes: RECIPIENT_TYPES,
    awardTypes: AWARD_TYPES,
    pageSize: boundedInteger(environment.GTM_AWARD_PAGE_SIZE, 100, 10, 100),
    maxPages: boundedInteger(environment.GTM_AWARD_MAX_PAGES, 4, 1, 10),
    maxCandidates: boundedInteger(environment.GTM_AWARD_MAX_CANDIDATES, 100, 10, 500)
  };
}

export async function runDailyAwardScan(now = new Date()): Promise<AwardDiscoveryScan> {
  const scanDate = now.toISOString().slice(0, 10);
  const criteria = awardDiscoveryCriteria(scanDate);
  const records: AwardRecord[] = [];
  let pagesChecked = 0;

  for (let page = 1; page <= criteria.maxPages; page += 1) {
    const body = await fetchAwardPage(criteria, page);
    const results = Array.isArray(body.results) ? body.results : [];
    records.push(...results);
    pagesChecked = page;
    if (!results.length || body.page_metadata?.hasNext === false || results.length < criteria.pageSize) break;
  }

  const seen = new Set<string>();
  let duplicateCount = 0;
  const opportunities = records
    .filter((award) => isUsableAward(award, criteria.minimumAward))
    .filter((award) => {
      const key = String(award.generated_internal_id);
      if (seen.has(key)) { duplicateCount += 1; return false; }
      seen.add(key);
      return true;
    })
    .map((award) => toOpportunity(award, scanDate))
    .sort(compareOpportunityResearchValue)
    .slice(0, criteria.maxCandidates);
 

  return {
    generatedAt: now.toISOString(),
    source: ENDPOINT,
    scanStatus: opportunities.length ? "success" : "no_new_awards",
    lastSuccessfulScanAt: now.toISOString(),
    criteria,
    recordsChecked: records.length,
    pagesChecked,
    newAwardCount: opportunities.length,
    duplicateCount,
    errorCount: 0,
    coverage: records.length + " recent federal grant records were checked across " + pagesChecked + " page(s); " + opportunities.length + " new nonprofit candidates passed the research criteria and " + duplicateCount + " duplicates were excluded. " + (opportunities.length ? "Candidates still require contact and workflow verification before outreach." : "No new awards matched; this was a successful empty scan, not a scanner failure."),
    opportunities,
    limitations: [
      "USAspending covers federal assistance, not private-foundation or state and local awards that are not reported there.",
      "An award record establishes timing and funding, but it does not prove reporting pain, software use, report cadence, or willingness to buy.",
      "Education, research, healthcare, and very large recipients are kept as adjacent candidates rather than silently excluded.",
      "No contact is discovered and no message is sent by this scanner."
    ]
  };
}

export function toOpportunity(award: AwardRecord, observedAt: string): GtmOpportunity {
  const organization = titleCase(String(award["Recipient Name"]));
  const amount = Number(award["Award Amount"]);
  const description = compact(award.Description || "Federal assistance award record.", 300);
  const awardId = award["Award ID"] || award.generated_internal_id || "award";
  const generatedId = String(award.generated_internal_id);
  const targetTier = classifyTargetTier(organization, amount);
  const fitSignals = inferVisibleFitSignals(description, amount, targetTier);
  const listing = formatAssistanceListing(award["Assistance Listing"]);
  const sourceUrl = `https://www.usaspending.gov/award/${encodeURIComponent(generatedId)}/`;
  const score = {
    pain: 16 + Math.min(4, fitSignals.length),
    timing: 25,
    fit: targetTier === "core" ? 23 : targetTier === "emerging" ? 20 : 16,
    value: valueScore(amount)
  };

  return {
    id: `usaspending-${String(awardId).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    organization,
    signalKind: "grant_award",
    headline: "Recent federal grant record detected",
    observedAt,
    amount,
    awardStartDate: award["Start Date"] || undefined,
    awardEndDate: award["End Date"] || undefined,
    assistanceListing: listing || undefined,
    funder: award["Awarding Sub Agency"] || award["Awarding Agency"] || "Federal agency",
    targetTier,
    fitSignals,
    evidence: [{
      id: `source-${generatedId}`,
      title: `USAspending award ${awardId}`,
      url: sourceUrl,
      observedAt,
      authority: "official",
      excerpt: `${description} Award amount: ${formatMoney(amount)}.${listing ? ` Assistance listing: ${listing}.` : ""}`,
      supports: ["recipient", "award amount", "funder", "program description", "award period", ...(listing ? ["assistance listing"] : [])]
    }],
    score,
    entityVerified: true,
    nonprofitVerified: true,
    conflicts: [],
    unknowns: ["The award record does not establish report cadence, current software, reporting pain, or a contact person."],
    recommendedRoles: ["Chief financial officer", "Controller", "Finance director", "Grants manager", "Director of compliance"],
    whyNow: "A recent federal award creates a timely reason to verify the post-award reporting requirements before implementation work accelerates.",
    recommendedAngle: "Offer a free readiness audit of the award agreement. Ask about the reporting workflow instead of asserting that the organization has a problem.",
    emailSubject: `Reporting-readiness analysis for ${organization}`,
    draftMessage: `I noticed the recent federal award record for ${organization.replace(/[.,]+$/, "")}. If your team is translating the agreement into reporting deadlines, financial schedules, program metrics, and an evidence checklist, GrantDeskHQ can prepare a free source-linked readiness audit for professional review.`
  };
}

function fetchAwardPage(criteria: AwardDiscoveryCriteria, page: number) {
  return fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "GrantDeskHQ-GTM/2.0 (source-backed nonprofit award monitor)" },
    body: JSON.stringify({
      filters: {
        time_period: [{ start_date: criteria.startDate, end_date: criteria.endDate }],
        award_type_codes: criteria.awardTypes,
        recipient_type_names: criteria.recipientTypes,
        award_amounts: [{ lower_bound: criteria.minimumAward }]
      },
      fields: ["Award ID", "Recipient Name", "Award Amount", "Description", "Start Date", "End Date", "Awarding Agency", "Awarding Sub Agency", "Assistance Listing"],
      page,
      limit: criteria.pageSize,
      sort: "Start Date",
      order: "desc",
      subawards: false
    })
  }).then(async (response) => {
    if (!response.ok) throw new Error(`USAspending returned ${response.status}. The last verified scan remains available.`);
    return response.json() as Promise<AwardPage>;
  });
}

function isUsableAward(award: AwardRecord, minimumAward: number) {
  return Boolean(
    typeof award["Recipient Name"] === "string"
    && award["Recipient Name"].trim()
    && Number.isFinite(Number(award["Award Amount"]))
    && Number(award["Award Amount"]) >= minimumAward
    && typeof award.generated_internal_id === "string"
    && award.generated_internal_id.trim()
  );
}

function classifyTargetTier(organization: string, amount: number): TargetTier {
  if (/\b(university|college|hospital|health system|medical center|research institute)\b/i.test(organization) || amount >= 10_000_000) return "adjacent";
  if (amount < 100_000) return "emerging";
  return "core";
}

function inferVisibleFitSignals(description: string, amount: number, tier: TargetTier) {
  const signals: string[] = [];
  const normalized = description.toLowerCase();
  if (/participant|student|household|client|patient|people served|beneficiar/.test(normalized)) signals.push("measurable participant outcomes");
  if (/site|school|county|statewide|regional|community|multi-/.test(normalized)) signals.push("multi-site or community delivery");
  if (/training|education|workforce|housing|health|environment|restoration|services/.test(normalized)) signals.push("financial and program reporting inputs");
  if (amount >= 1_000_000) signals.push("large award value");
  if (tier === "emerging") signals.push("lower-cost entry candidate");
  if (tier === "adjacent") signals.push("adjacent segment requiring fit verification");
  return [...new Set(signals)];
}

function compareOpportunityResearchValue(left: GtmOpportunity, right: GtmOpportunity) {
  const tierOrder: Record<TargetTier, number> = { core: 0, emerging: 1, adjacent: 2 };
  const tierDifference = tierOrder[left.targetTier || "core"] - tierOrder[right.targetTier || "core"];
  if (tierDifference) return tierDifference;
  return (right.score.fit + right.score.value) - (left.score.fit + left.score.value) || left.organization.localeCompare(right.organization);
}

function valueScore(amount: number) {
  if (amount >= 1_000_000) return 20;
  if (amount >= 500_000) return 17;
  if (amount >= 250_000) return 14;
  if (amount >= 100_000) return 12;
  if (amount >= 50_000) return 10;
  return 8;
}

function formatAssistanceListing(value: AwardRecord["Assistance Listing"]) {
  if (!value) return "";
  if (typeof value === "string") return compact(value, 160);
  return [value.cfda_number, value.program_title].filter(Boolean).join(" — ");
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  return Math.round(boundedNumber(value, fallback, minimum, maximum));
}

function boundedNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function compact(value: string, limit: number) {
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase()).replace(/\b(Inc|Llc|Nfp)\b/g, (word) => word.toUpperCase());
}

function offsetDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
