import fs from "node:fs/promises";
import path from "node:path";

const endpoint = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const outputPath = path.resolve(process.argv.find((value) => value.startsWith("--output="))?.slice(9) || "public/gtm/award-signals.json");
const scanDate = process.env.GTM_SCAN_DATE || new Date().toISOString().slice(0, 10);
const startDate = process.env.GTM_SCAN_START_DATE || offsetDate(scanDate, -36);
const minimumAward = Number(process.env.GTM_MINIMUM_AWARD || 100000);

const requestBody = {
  filters: {
    time_period: [{ start_date: startDate, end_date: scanDate }],
    award_type_codes: ["02", "03", "04", "05"],
    recipient_type_names: ["Nonprofit Organization"],
    award_amounts: [{ lower_bound: minimumAward }]
  },
  fields: ["Award ID", "Recipient Name", "Award Amount", "Description", "Start Date", "End Date", "Awarding Agency", "Awarding Sub Agency", "Assistance Listing"],
  page: 1,
  limit: 40,
  sort: "Start Date",
  order: "desc",
  subawards: false
};

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "GrantDeskHQ-GTM/1.0 (source-backed award monitor)" },
  body: JSON.stringify(requestBody)
});
if (!response.ok) throw new Error(`USAspending returned ${response.status}. Existing dashboard data was not replaced.`);
const body = await response.json();
const results = Array.isArray(body.results) ? body.results : [];
const opportunities = results
  .filter(isUsableAward)
  .filter((award) => !/\b(university|college|city of|county of|state of)\b/i.test(award["Recipient Name"]))
  .slice(0, 12)
  .map(toOpportunity);

if (!opportunities.length) throw new Error("USAspending returned no usable nonprofit award records. Existing dashboard data was not replaced.");

const payload = {
  generatedAt: new Date().toISOString(),
  source: endpoint,
  query: { startDate, endDate: scanDate, minimumAward, recipientType: "Nonprofit Organization", awardTypes: ["02", "03", "04", "05"] },
  coverage: `First ${requestBody.limit} matching federal assistance records, reduced to ${opportunities.length} usable nonprofit candidates. This is not exhaustive.`,
  opportunities
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${opportunities.length} source-backed federal award signals to ${path.relative(process.cwd(), outputPath)}.`);
console.log("No contact was discovered, no message was sent, and no CRM record was changed.");

function isUsableAward(award) {
  return Boolean(
    award
    && typeof award["Recipient Name"] === "string"
    && award["Recipient Name"].trim()
    && Number.isFinite(Number(award["Award Amount"]))
    && Number(award["Award Amount"]) >= minimumAward
    && typeof award.generated_internal_id === "string"
    && award.generated_internal_id.trim()
  );
}

function toOpportunity(award) {
  const organization = titleCase(award["Recipient Name"]);
  const organizationInSentence = organization.replace(/[.,]+$/, "");
  const amount = Number(award["Award Amount"]);
  const description = compact(award.Description || "Federal assistance award record.", 280);
  const awardId = award["Award ID"] || award.generated_internal_id;
  const federalSource = `https://www.usaspending.gov/award/${encodeURIComponent(award.generated_internal_id)}/`;
  return {
    id: `usaspending-${String(awardId).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    organization,
    signalKind: "grant_award",
    headline: "Recent federal assistance record detected",
    observedAt: scanDate,
    amount,
    awardStartDate: award["Start Date"] || undefined,
    funder: award["Awarding Sub Agency"] || award["Awarding Agency"] || "Federal agency",
    evidence: [{
      id: `source-${award.generated_internal_id}`,
      title: `USAspending award ${awardId}`,
      url: federalSource,
      observedAt: scanDate,
      authority: "official",
      excerpt: `${description} Award amount: ${formatMoney(amount)}.`,
      supports: ["recipient", "award amount", "funder", "program description", "award period"]
    }],
    score: { pain: 18, timing: 25, fit: 22, value: valueScore(amount) },
    entityVerified: true,
    nonprofitVerified: true,
    conflicts: [],
    unknowns: ["The award record does not establish report cadence, current software, reporting pain, or a contact person."],
    recommendedRoles: ["Chief financial officer", "Controller", "Finance director", "Grants manager"],
    whyNow: "A recent federal assistance record creates a timely reason to verify the post-award reporting requirements before implementation work accelerates.",
    recommendedAngle: "Offer a free readiness audit of the award agreement. Ask about the reporting workflow instead of asserting that the organization has a problem.",
    draftMessage: `I noticed the recent federal award record for ${organizationInSentence}. If your team is translating the agreement into reporting deadlines, financial schedules, program metrics, and an evidence checklist, GrantDeskHQ can prepare a free source-linked readiness audit for professional review.`
  };
}

function valueScore(amount) {
  if (amount >= 1000000) return 20;
  if (amount >= 500000) return 17;
  if (amount >= 250000) return 14;
  return 12;
}

function compact(value, limit) {
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).trimEnd()}…`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function titleCase(value) {
  return String(value).toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase()).replace(/\b(Inc|Llc|Nfp)\b/g, (value) => value.toUpperCase());
}

function offsetDate(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
