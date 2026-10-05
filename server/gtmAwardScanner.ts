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

export type AwardTiming = "RECENT" | "ACTIVE" | "SPENDDOWN";

interface AwardQuery {
  kind: "RECENT" | "ACTIVE";
  startDate: string;
  endDate: string;
}

export function awardDiscoveryCriteria(scanDate: string, environment: NodeJS.ProcessEnv = process.env, priorSuccessfulScanAt: string | null = null): AwardDiscoveryCriteria {
  const windowDays = boundedInteger(environment.GTM_AWARD_WINDOW_DAYS, 90, 14, 365);
  const overlapDays = boundedInteger(environment.GTM_AWARD_INCREMENTAL_OVERLAP_DAYS, 7, 1, 30);
  const activeLookbackDays = boundedInteger(environment.GTM_AWARD_ACTIVE_LOOKBACK_DAYS, 730, 90, 1_825);
  const spenddownWindowDays = boundedInteger(environment.GTM_AWARD_SPENDDOWN_WINDOW_DAYS, 120, 30, 365);
  const checkpointStartDate = dateOnly(priorSuccessfulScanAt);
  const configuredStart = dateOnly(environment.GTM_SCAN_START_DATE || null);
  // A source scan is incremental after its first successful checkpoint.  The
  // short overlap catches late amendments while canonical seed idempotency
  // prevents those records from becoming duplicate organizations.
  const startDate = configuredStart || (checkpointStartDate ? offsetDate(checkpointStartDate, -overlapDays) : offsetDate(scanDate, -windowDays));
  return {
    startDate,
    endDate: scanDate,
    activeStartDate: offsetDate(scanDate, -activeLookbackDays),
    activeLookbackDays,
    spenddownWindowDays,
    checkpointStartDate,
    incremental: Boolean(checkpointStartDate && !configuredStart),
    overlapDays,
    minimumAward: boundedNumber(environment.GTM_MINIMUM_AWARD, 25_000, 1_000, 10_000_000),
    recipientTypes: RECIPIENT_TYPES,
    awardTypes: AWARD_TYPES,
    pageSize: boundedInteger(environment.GTM_AWARD_PAGE_SIZE, 100, 10, 100),
    maxPages: boundedInteger(environment.GTM_AWARD_MAX_PAGES, 5, 1, 10),
    maxCandidates: boundedInteger(environment.GTM_AWARD_MAX_CANDIDATES, 500, 10, 500)
  };
}

export async function runDailyAwardScan(now = new Date(), priorSuccessfulScanAt: string | null = null, environment: NodeJS.ProcessEnv = process.env): Promise<AwardDiscoveryScan> {
  const scanDate = now.toISOString().slice(0, 10);
  const criteria = awardDiscoveryCriteria(scanDate, environment, priorSuccessfulScanAt);
  const records: Array<{ award: AwardRecord; query: AwardQuery }> = [];
  let pagesChecked = 0;
  let activeRecordsChecked = 0;
  const queries: AwardQuery[] = [
    { kind: "RECENT", startDate: criteria.startDate, endDate: criteria.endDate },
    { kind: "ACTIVE", startDate: criteria.activeStartDate || criteria.startDate, endDate: criteria.endDate }
  ];

  for (const query of queries) {
    for (let page = 1; page <= criteria.maxPages; page += 1) {
      const body = await fetchAwardPage(criteria, page, query);
      const results = Array.isArray(body.results) ? body.results : [];
      records.push(...results.map((award) => ({ award, query })));
      if (query.kind === "ACTIVE") activeRecordsChecked += results.length;
      pagesChecked += 1;
      if (!results.length || body.page_metadata?.hasNext === false || results.length < criteria.pageSize) break;
    }
  }

  const seen = new Map<string, { award: AwardRecord; timing: AwardTiming }>();
  let duplicateCount = 0;
  let futureDatedCount = 0;
  let inactiveAwardCount = 0;
  for (const { award, query } of records) {
    if (!isUsableAward(award, criteria.minimumAward)) continue;
    if (awardStartsAfter(award, criteria.endDate)) {
      futureDatedCount += 1;
      continue;
    }
    if (query.kind === "ACTIVE" && !awardIsActiveOn(award, criteria.endDate)) {
      inactiveAwardCount += 1;
      continue;
    }
    const key = String(award.generated_internal_id);
    const timing = awardTiming(award, criteria.endDate, criteria.spenddownWindowDays || 120);
    const existing = seen.get(key);
    if (existing) {
      duplicateCount += 1;
      if (timingPriority(timing) > timingPriority(existing.timing)) seen.set(key, { award, timing });
      continue;
    }
    seen.set(key, { award, timing });
  }
  const selected = [...seen.values()];
  const activeAwardCount = selected.filter((item) => item.timing === "ACTIVE" || item.timing === "SPENDDOWN").length;
  const spenddownAwardCount = selected.filter((item) => item.timing === "SPENDDOWN").length;
  const opportunities = selected
    .map(({ award, timing }) => toOpportunity(award, scanDate, timing))
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
    futureDatedCount,
    activeAwardCount,
    spenddownAwardCount,
    inactiveAwardCount,
    errorCount: 0,
    coverage: records.length + " federal assistance records were checked across " + pagesChecked + " page(s), including " + activeRecordsChecked + " record(s) from the bounded active-award lookback; " + opportunities.length + " current or past-start nonprofit candidates passed the research criteria, including " + activeAwardCount + " active and " + spenddownAwardCount + " near-end award(s). " + futureDatedCount + " future-start award" + (futureDatedCount === 1 ? " was" : "s were") + " deferred, " + inactiveAwardCount + " inactive historical award" + (inactiveAwardCount === 1 ? " was" : "s were") + " excluded from the active scan, and " + duplicateCount + " duplicates were excluded. " + (opportunities.length ? "Candidates still require contact and workflow verification before outreach." : "No current, active, or near-end awards matched; this was a successful empty scan, not a scanner failure."),
    opportunities,
    limitations: [
      "USAspending covers federal assistance, not private-foundation or state and local awards that are not reported there.",
      "An award record establishes timing and funding, but it does not prove reporting pain, software use, report cadence, or willingness to buy.",
      "Observed-at is the scanner timestamp; the source award start and end dates are retained separately. Future-start awards are deferred rather than treated as current post-award work.",
      "Education, research, healthcare, and very large recipients are kept as adjacent candidates rather than silently excluded.",
      "No contact is discovered and no message is sent by this scanner."
    ]
  };
}

export function toOpportunity(award: AwardRecord, observedAt: string, timing: AwardTiming = "RECENT"): GtmOpportunity {
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
    timing: timing === "SPENDDOWN" ? 25 : timing === "ACTIVE" ? 22 : 20,
    fit: targetTier === "core" ? 23 : targetTier === "emerging" ? 20 : 16,
    value: valueScore(amount)
  };

  return {
    id: `usaspending-${String(awardId).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    organization,
    signalKind: "grant_award",
    headline: timing === "SPENDDOWN" ? "Federal award entering a near-end reporting period" : timing === "ACTIVE" ? "Active federal award record detected" : "Recent federal grant record detected",
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
    whyNow: timing === "SPENDDOWN"
      ? "The public award period is near its recorded end date, which is a timely reason to verify post-award reporting inputs without asserting that a deadline is due."
      : timing === "ACTIVE"
        ? "A public award period is currently active, which is a timely reason to verify post-award reporting inputs without asserting that a report is due."
        : "A recent federal award creates a timely reason to verify the post-award reporting requirements before implementation work accelerates.",
    recommendedAngle: "Offer a free readiness audit of the award agreement. Ask about the reporting workflow instead of asserting that the organization has a problem.",
    emailSubject: `Reporting-readiness analysis for ${organization}`,
    draftMessage: `I noticed the public federal award record for ${organization.replace(/[.,]+$/, "")}. If your team is translating the agreement into reporting deadlines, financial schedules, program metrics, and an evidence checklist, GrantDeskHQ can prepare a free source-linked readiness audit for professional review.`
  };
}

function fetchAwardPage(criteria: AwardDiscoveryCriteria, page: number, query: AwardQuery) {
  return fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "GrantDeskHQ-GTM/2.0 (source-backed nonprofit award monitor)" },
    body: JSON.stringify({
      filters: {
        time_period: [{ start_date: query.startDate, end_date: query.endDate }],
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

/** USAspending can surface announced assistance whose displayed start date is
 * beyond the query end date. It is useful research, but cannot substantiate a
 * present post-award reporting workflow. Keep that count visible and defer it
 * rather than allowing a source API quirk to create current candidates. */
export function awardStartsAfter(award: Pick<AwardRecord, "Start Date">, endDate: string) {
  const start = dateOnly(award["Start Date"] || null);
  return Boolean(start && start > endDate);
}

/** An active candidate has demonstrably started and has no recorded end date
 * in the past. This is source timing only; it never proves an upcoming report
 * deadline, buyer identity, or intent. */
export function awardIsActiveOn(award: Pick<AwardRecord, "Start Date" | "End Date">, scanDate: string) {
  const start = dateOnly(award["Start Date"] || null);
  const end = dateOnly(award["End Date"] || null);
  return Boolean(start && start <= scanDate && (!end || end >= scanDate));
}

export function awardTiming(award: Pick<AwardRecord, "Start Date" | "End Date">, scanDate: string, spenddownWindowDays = 120): AwardTiming {
  if (!awardIsActiveOn(award, scanDate)) return "RECENT";
  const end = dateOnly(award["End Date"] || null);
  return end && end <= offsetDate(scanDate, spenddownWindowDays) ? "SPENDDOWN" : "ACTIVE";
}

function timingPriority(timing: AwardTiming) {
  return timing === "SPENDDOWN" ? 3 : timing === "ACTIVE" ? 2 : 1;
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

function dateOnly(value: string | null) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}
