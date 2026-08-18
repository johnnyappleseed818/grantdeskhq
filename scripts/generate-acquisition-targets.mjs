import fs from "node:fs/promises";

const cohortPath = new URL("../reports/gtm-shadow-cohort-20.csv", import.meta.url);
const outputPath = process.argv[2] || "/home/eli_katz/grantdeskhq-acquisition-targets-20260818.csv";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') { field += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (!quoted && character === ",") { row.push(field); field = ""; continue; }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [headers, ...values] = rows;
  return values.map((value) => Object.fromEntries(headers.map((header, index) => [header, value[index] || ""])));
}

function csv(value) {
  return `"${String(value || "").replaceAll('"', '""')}"`;
}

const partners = [
  ["The Charity CFO", "REFERRAL_PARTNER", "Nonprofit accounting / fractional CFO", "Grant tracking, restricted-fund tracking, and grant-aligned financial reports are explicitly described on its official service page.", "Tosha Anderson, CPA", "Founder + Managing Partner", "https://thecharitycfo.com/about-us/leadership-team/", "https://thecharitycfo.com/cfo-services/grant-management/", "A", "Human-review partnership fit; do not enrich or contact without separate approval.", "P1"],
  ["Kiwi Partners", "REFERRAL_PARTNER", "Nonprofit accounting / CFO advisory", "Public nonprofit accounting and CFO coverage includes budget-to-actual and advisory support.", "Ken Hafner", "Head of Accounting Services", "https://www.kiwipartners.com/ken-hafner", "https://www.kiwipartners.com/", "A", "Human-review partnership fit; validate service overlap before any outreach.", "P1"],
  ["Altruic Advisors", "REFERRAL_PARTNER", "Nonprofit accounting / CFO advisory", "Public CFO Solutions materials describe grant tracking, financial statements, and audit support.", "Ryan Hagan, CPA, CFE", "Founder & Managing Partner", "https://altruic.com/ryan-hagan", "https://altruic.com/", "A", "Human-review partnership fit; do not infer a contact route.", "P1"],
  ["JMT Consulting", "REFERRAL_PARTNER", "Nonprofit technology and grant-management advisory", "Public nonprofit consulting materials identify grant-management and accounting-system advisory work.", "Jacqueline M. Tiso", "Founder & Chief Executive Officer", "https://jmtconsulting.com/blog/nonprofit-ai-adoption-leadership-capacity-change/", "https://jmtconsulting.com/", "C", "Commercial-overlap review required before any partner motion.", "P2"],
  ["NFO Nonprofit Financial Outsourcing", "REFERRAL_PARTNER", "Fractional CFO / fiscal grant management", "Public team and services materials describe fractional CFO, fiscal grant management, financial reporting, and audit support.", "Scott Kriete", "Chief Executive Officer", "https://www.nfoyourcfo.com/our-team", "https://www.nfoyourcfo.com/", "A", "Human-review partnership fit; do not enrich or contact without separate approval.", "P1"],
  ["Bookr", "REFERRAL_PARTNER", "Outsourced nonprofit accounting", "Official services describe outsourced accounting, payroll, grant fiscal compliance, grant invoicing, and program data management.", "", "", "", "https://www.bookr.inc/", "A", "Research a current leader from an official source before considering contact enrichment.", "P2"],
  ["BPM", "REFERRAL_PARTNER", "Nonprofit outsourced accounting", "Official nonprofit outsourcing page describes contract/grant management, fund accounting, and financial reporting.", "", "", "", "https://www.bpm.com/services/accounting/outsourced-accounting/nonprofit/", "A", "Research a nonprofit-practice leader from an official source before considering contact enrichment.", "P2"],
  ["hfco", "REFERRAL_PARTNER", "Nonprofit accounting advisory", "Official page describes grant reporting, expense-allocation review, supporting-document review, and audit preparation.", "", "", "", "https://hfco.com/nonprofit-accounting-advisory-services/", "A", "Research a current advisory leader from an official source before considering contact enrichment.", "P2"],
  ["NCheng LLP", "REFERRAL_PARTNER", "Nonprofit finance and grants advisory", "Official nonprofit financial-services page includes grants/contracts management, reconciliation, and funder reporting.", "", "", "", "https://www.ncheng.com/non-profit-financial-services/", "A", "Research a nonprofit-practice leader from an official source before considering contact enrichment.", "P2"],
  ["Fohrman & Fohrman", "REFERRAL_PARTNER", "Outsourced CFO / nonprofit accounting", "Official site describes outsourced CFO services, grant management, reporting/allocations, compliance, and audit preparation.", "Janet Fohrman", "Chief Executive Officer", "https://fohrman.com/", "https://fohrman.com/", "A", "Human-review partnership fit; verify current role before any enrichment.", "P2"]
];

const directRows = parseCsv(await fs.readFile(cohortPath, "utf8")).slice(0, 20).map((record, index) => ({
  priority: index < 10 ? "P1" : "P2",
  organization: record.organization,
  segment: "DIRECT_NONPROFIT",
  fit: `${record.mission_category}; recent ${record.awarding_organization} award of $${Number(record.award_amount_usd).toLocaleString("en-US")} beginning ${record.award_start_date}.`,
  decisionMaker: record.contact_name,
  title: record.contact_title,
  titleStatus: /requires reconfirmation|not publicly resolved/i.test(record.contact_title) ? "PUBLIC_SOURCE_RECORDED_RECONFIRM_REQUIRED" : "PUBLIC_SOURCE_RECORDED",
  personSource: record.contact_provenance_url,
  organizationSource: record.award_source_url,
  relationship: "N/A",
  approach: "Use the canonical Control Plane, confirm current finance/grants ownership from an official source, then follow the separate human-approved enrichment and suppression workflow. No contact action is authorized here."
}));

const partnerRows = partners.map(([organization, segment, type, fit, decisionMaker, title, personSource, organizationSource, relationship, approach, priority]) => ({
  priority, organization, segment, fit: `${type}. ${fit}`, decisionMaker, title,
  titleStatus: decisionMaker ? "PUBLIC_SOURCE_RECORDED_RECONFIRM_REQUIRED" : "NO_NAMED_PERSON_RECORDED",
  personSource, organizationSource, relationship, approach
}));

const columns = ["priority", "organization", "segment", "why_it_fits", "named_decision_maker", "title", "public_title_status", "public_profile_or_title_source_url", "organization_or_signal_source_url", "partner_relationship_class", "recommended_approach"];
const rows = [...directRows, ...partnerRows];
if (rows.length !== 30) throw new Error(`Expected 30 targets, found ${rows.length}.`);
const body = [columns.join(","), ...rows.map((row) => [row.priority, row.organization, row.segment, row.fit, row.decisionMaker, row.title, row.titleStatus, row.personSource, row.organizationSource, row.relationship, row.approach].map(csv).join(","))].join("\n") + "\n";
await fs.writeFile(outputPath, body, "utf8");
console.log(JSON.stringify({ outputPath, targets: rows.length, direct: directRows.length, partners: partnerRows.length }));
