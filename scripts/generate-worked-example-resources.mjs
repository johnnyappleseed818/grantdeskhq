import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync, zipSync } from "fflate";
import writeExcelFile from "write-excel-file/node";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const publicPath = "/resources/downloads/grant-report-example";
export const requiredFiles = [
  "GrantDeskHQ-budget-vs-actual.xlsx",
  "approved-budget.csv",
  "account-mapping.csv",
  "general-ledger.csv",
  "program-attendance-summary.csv",
  "synthetic-award-agreement.md",
  "program-update.md",
  "evidence-register.csv",
  "reviewable-quarterly-report.md",
  "program-update-handoff-template.md",
  "README.md"
];

export const fixture = {
  organization: "Harbor Path Community Services — Synthetic Example",
  funder: "Example Community Fund — Synthetic",
  grant: "Community Skills Access",
  code: "SYN-2026-001",
  start: "2026-07-01",
  end: "2026-09-30",
  due: "2026-10-31",
  budget: 60000,
  participantTarget: 120,
  participants: 108,
  budgetRows: [
    ["6100", "Personnel", 36000],
    ["6200", "Participant support", 12000],
    ["6300", "Travel", 6000],
    ["6400", "Supplies", 6000]
  ],
  ledger: [
    ["SYN-T001", "2026-07-28", "SYN-2026-001", "6100", 10800],
    ["SYN-T002", "2026-08-28", "SYN-2026-001", "6100", 10800],
    ["SYN-T003", "2026-09-28", "SYN-2026-001", "6100", 10800],
    ["SYN-T004", "2026-07-28", "SYN-2026-001", "6200", 4000],
    ["SYN-T005", "2026-08-28", "SYN-2026-001", "6200", 4800],
    ["SYN-T006", "2026-09-28", "SYN-2026-001", "6200", 5000],
    ["SYN-T007", "2026-07-28", "SYN-2026-001", "6300", 1200],
    ["SYN-T008", "2026-08-28", "SYN-2026-001", "6300", 1400],
    ["SYN-T009", "2026-09-28", "SYN-2026-001", "6300", 1600],
    ["SYN-T010", "2026-07-28", "SYN-2026-001", "6400", 1500],
    ["SYN-T011", "2026-08-28", "SYN-2026-001", "6400", 1700],
    ["SYN-T012", "2026-09-28", "SYN-2026-001", "6400", 1800],
    ["SYN-T013", "2026-09-30", "SYN-2026-001", "6400", -200],
    ["SYN-T014", "2026-10-01", "SYN-2026-001", "6300", 1200],
    ["SYN-T015", "2026-09-30", "SYN-2026-002", "6400", 800]
  ]
};

export function calculatedTotals() {
  const raw = fixture.ledger.reduce((sum, row) => sum + row[4], 0);
  const included = fixture.ledger.filter((row) => row[2] === fixture.code && row[1] >= fixture.start && row[1] <= fixture.end);
  const actual = included.reduce((sum, row) => sum + row[4], 0);
  const categories = fixture.budgetRows.map(([account, category, budget]) => {
    const value = included.filter((row) => row[3] === account).reduce((sum, row) => sum + row[4], 0);
    return { category, budget, actual: value, variance: value - budget, percentage: budget === 0 ? null : (value - budget) / budget };
  });
  return { raw, includedRows: included.length, actual, categories };
}

const marker = "SYNTHETIC — fictional teaching example only; not a customer result, live product run, grant term, or submission-ready report.";
const csv = (rows) => rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n") + "\n";
const formula = (value) => ({ value, type: "Formula" });
const money = (value) => ({ value, type: Number, format: "[$$-409]#,##0;[Red]-[$$-409]#,##0" });
const percent = (value) => ({ value, type: Number, format: "0%;[Red]-0%" });
const heading = (value) => ({ value, type: String, fontWeight: "bold", color: "#FFFFFF", backgroundColor: "#10233F" });
const banner = (columns) => Array.from({ length: columns }, (_, index) => index === 0 ? ({ value: marker, type: String, fontWeight: "bold", color: "#355442", backgroundColor: "#DDEBE2" }) : "");

function markdownFiles() {
  const totals = calculatedTotals();
  const table = totals.categories.map((item) => `| ${item.category} | $${item.budget.toLocaleString()} | $${item.actual.toLocaleString()} | $${item.variance.toLocaleString()} | ${item.percentage === null ? "undefined" : `${Math.round(item.percentage * 100)}%`} |`).join("\n");
  return {
    "synthetic-award-agreement.md": `# ${fixture.grant}\n\n> ${marker}\n\n**Organization:** ${fixture.organization}  \n**Funder:** ${fixture.funder}  \n**Grant code:** ${fixture.code}  \n**Award/reporting period:** ${fixture.start} through ${fixture.end} inclusive  \n**Report due:** ${fixture.due}\n\n## Fictional example rules\n\n- Explain every category variance with an absolute percentage of at least 10%.\n- Category overspend above 10% requires documented funder approval.\n- An underspend elsewhere does not authorize a budget transfer.\n- Original financial support, participant records, and finance/program sign-offs are required for review.\n\nThese invented example terms are not universal grant requirements.\n`,
    "program-update.md": `# Program update — synthetic example\n\n> ${marker}\n\nThe program lead reports that a staffing gap postponed workshops, contributing to the participant shortfall and lower personnel spending. Fewer staff visits reduced travel. Higher transport-assistance needs increased participant support. Some supplies purchases were deferred. These are fictional explanations requiring review against source records. No funded extension or new delivery date has been approved.\n\n**Reported result:** ${fixture.participants} unique participants attended at least one skills workshop against a target of ${fixture.participantTarget}. No verified employment outcomes were supplied.\n`,
    "reviewable-quarterly-report.md": `# Quarterly grant report — Draft for review\n\n> ${marker}\n\n## Cover\n\n- **Organization:** ${fixture.organization}\n- **Funder:** ${fixture.funder}\n- **Grant:** ${fixture.grant} (${fixture.code})\n- **Period:** ${fixture.start} through ${fixture.end}\n- **Status:** Draft for review\n- **Authorized submitter:** Unassigned\n- **Submission date:** Not submitted\n\n## Program result\n\nThe program recorded ${fixture.participants} unique participants against a target of ${fixture.participantTarget} (90%). A participant is counted once after attending at least one skills workshop during the period. The synthetic attendance summary uses nonoverlapping ID ranges; underlying participant-level records were not supplied and remain required for review. No verified employment outcomes were supplied, so this draft makes no employment outcome claim.\n\n## Financial result\n\nPeriod ledger actuals total **$${totals.actual.toLocaleString()}** against an approved **$${fixture.budget.toLocaleString()}** budget. The raw ledger total is $${totals.raw.toLocaleString()} across 15 rows; $1,200 is outside the period and $800 belongs to another grant. The $200 supplies refund remains negative.\n\n| Category | Budget | Actual | Actual minus budget | Percentage |\n| --- | ---: | ---: | ---: | ---: |\n${table}\n\n## Explanations and evidence\n\nThe fictional program lead reports a staffing gap, postponed workshops, fewer staff visits, higher transport-assistance needs, and deferred supplies purchases. These explanations still need review against supporting records. Participant support is 15% over budget. The fictional agreement requires documented approval above 10%; no approval was provided.\n\n## Open items\n\n| Open item | Owner | Current state |\n| --- | --- | --- |\n| Overspend approval | Grants owner | Missing |\n| Original financial support | Finance reviewer | Missing |\n| Participant records and deduplication | Program reviewer | Missing |\n| Final sign-offs | Finance and program reviewers | Missing |\n\nSee [evidence-register.csv](evidence-register.csv), [general-ledger.csv](general-ledger.csv), and [GrantDeskHQ-budget-vs-actual.xlsx](GrantDeskHQ-budget-vs-actual.xlsx).\n`,
    "program-update-handoff-template.md": `# Program-update handoff template\n\n> ${marker}\n\n## Grant and reporting context\n\n- Grant / code:\n- Reporting period:\n- Owner:\n- Due date:\n\n## Results\n\n| Metric definition | Target | Result | Source record | Deduplication method |\n| --- | --- | --- | --- | --- |\n| Missing | Missing | Missing | Missing | Missing |\n\n## Changes and explanations\n\n- Observed change:\n- Source-supported explanation:\n- What remains unverified:\n\n## Budget questions\n\n- Category and variance:\n- Required approval or agreement question:\n- Finance owner:\n\n## Missing evidence and next actions\n\n| Missing item | Responsible role | Next action | Due / review date |\n| --- | --- | --- | --- |\n| Missing | Missing | Missing | Missing |\n\nMissing results stay **Missing**; do not replace them with zero.\n`,
    "README.md": `# GrantDeskHQ synthetic worked example\n\n> ${marker}\n\nThis ungated packet is a fictional teaching example. It includes a formula-based workbook, approved budget, mapping, ledger, attendance summary, draft agreement, program update, evidence register, report draft, and handoff template. It intentionally does **not** include original receipts/invoices/payroll, participant-level records, documented overspend approval, or reviewer sign-offs.\n\nOpen the workbook and inspect the Inputs, Ledger, and Budget vs Actual sheets. The workbook excludes the out-of-period and other-grant ledger rows, retains the negative refund, calculates category variances, flags explanations at absolute 10%, and flags a fictional overspend approval requirement above 10%.\n`
  };
}

async function createWorkbook(file) {
  const inputRows = [
    banner(3),
    [heading("Input"), heading("Value"), heading("Synthetic marker")],
    ["Grant code", fixture.code, "SYNTHETIC"],
    ["Period start", { value: new Date("2026-07-01T00:00:00Z"), type: Date, format: "yyyy-mm-dd" }, "SYNTHETIC"],
    ["Period end", { value: new Date("2026-09-30T00:00:00Z"), type: Date, format: "yyyy-mm-dd" }, "SYNTHETIC"],
    ["Variance explanation threshold", percent(0.1), "SYNTHETIC"],
    ["Overspend approval threshold", percent(0.1), "SYNTHETIC"],
    [],
    [heading("Account code"), heading("Budget category"), heading("Period budget USD")],
    ...fixture.budgetRows.map(([account, category, value]) => [account, category, money(value)])
  ];
  const ledgerRows = [
    banner(8),
    ["Transaction ID", "Date", "Grant code", "Account code", "Amount USD", "Included?", "Exclusion reason", "Budget category"].map(heading),
    ...fixture.ledger.map((row, index) => {
      const excelRow = index + 3;
      return [row[0], { value: new Date(`${row[1]}T00:00:00Z`), type: Date, format: "yyyy-mm-dd" }, row[2], row[3], money(row[4]), formula(`IF(C${excelRow}<>Inputs!$B$3,"EXCLUDED",IF(OR(B${excelRow}<Inputs!$B$4,B${excelRow}>Inputs!$B$5),"EXCLUDED","INCLUDED"))`), formula(`IF(C${excelRow}<>Inputs!$B$3,"OTHER_GRANT",IF(B${excelRow}<Inputs!$B$4,"OUTSIDE_PERIOD_BEFORE",IF(B${excelRow}>Inputs!$B$5,"OUTSIDE_PERIOD_AFTER","")))`), formula(`IFERROR(VLOOKUP(D${excelRow},Inputs!$A$10:$C$13,2,FALSE),"UNMAPPED")`)];
    })
  ];
  const categoryRows = fixture.budgetRows.map(([, category], index) => {
    const excelRow = index + 3;
    const inputRow = index + 10;
    return [category, formula(`Inputs!$C$${inputRow}`), formula(`SUMIFS(Ledger!$E$3:$E$17,Ledger!$H$3:$H$17,A${excelRow},Ledger!$F$3:$F$17,"INCLUDED")`), formula(`C${excelRow}-B${excelRow}`), formula(`IF(B${excelRow}=0,"undefined",D${excelRow}/B${excelRow})`), formula(`IF(OR(E${excelRow}="undefined",ABS(E${excelRow})>=Inputs!$B$6),"EXPLAIN","")`), formula(`IF(AND(E${excelRow}<>"undefined",E${excelRow}>Inputs!$B$7),"APPROVAL REQUIRED","")`)];
  });
  const bvaRows = [
    banner(7),
    ["Budget category", "Budget USD", "Actual USD", "Actual minus budget", "Percentage", "Variance explanation", "Approval required"].map(heading),
    ...categoryRows,
    ["Total", formula("SUM(B3:B6)"), formula("SUM(C3:C6)"), formula("C7-B7"), formula("IF(B7=0,\"undefined\",D7/B7)"), "", ""]
  ];
  await writeExcelFile([
    { sheet: "Inputs", data: inputRows, columns: [{ width: 36 }, { width: 26 }, { width: 18 }], stickyRowsCount: 2 },
    { sheet: "Ledger", data: ledgerRows, columns: [16, 15, 16, 15, 16, 16, 24, 24].map((width) => ({ width })), stickyRowsCount: 2 },
    { sheet: "Budget vs Actual", data: bvaRows, columns: [25, 17, 17, 22, 14, 22, 25].map((width) => ({ width })), stickyRowsCount: 2 }
  ]).toFile(file);
}

export async function generateWorkedExampleResources(destination = path.join(root, "public", "resources", "downloads", "grant-report-example")) {
  await fs.mkdir(destination, { recursive: true });
  const docs = markdownFiles();
  const staticFiles = {
    "approved-budget.csv": csv([["account_code", "budget_category", "period_budget_usd", "synthetic_marker"], ...fixture.budgetRows.map(([account, category, amount]) => [account, category, amount, "SYNTHETIC"])]),
    "account-mapping.csv": csv([["account_code", "budget_category", "synthetic_marker"], ...fixture.budgetRows.map(([account, category]) => [account, category, "SYNTHETIC"])]),
    "general-ledger.csv": csv([["transaction_id", "date", "grant_code", "account_code", "amount_usd", "synthetic_marker"], ...fixture.ledger.map((row) => [...row, "SYNTHETIC"])]),
    "program-attendance-summary.csv": csv([["month", "participant_id_range", "unique_participants", "synthetic_marker", "review_note"], ["July", "SYN-P001–SYN-P036", 36, "SYNTHETIC", "Range is fictional and disjoint from other months"], ["August", "SYN-P037–SYN-P072", 36, "SYNTHETIC", "Range is fictional and disjoint from other months"], ["September", "SYN-P073–SYN-P108", 36, "SYNTHETIC", "Range is fictional and disjoint from other months"], ["Total", "SYN-P001–SYN-P108", 108, "SYNTHETIC", "Underlying participant-level records are absent; real monthly totals need deduplication"]]),
    "evidence-register.csv": csv([["evidence_item", "status", "what_it_supports", "synthetic_marker"], ["Fictional agreement", "Included", "Example terms and period", "SYNTHETIC"], ["Approved budget", "Included", "Budget categories", "SYNTHETIC"], ["Ledger", "Included", "Illustrative transactions", "SYNTHETIC"], ["Account mapping", "Included", "Illustrative category mapping", "SYNTHETIC"], ["Program update", "Included", "Fictional explanation", "SYNTHETIC"], ["Attendance summary", "Included", "Synthetic result summary", "SYNTHETIC"], ["Overspend approval", "Missing", "Required open item", "SYNTHETIC"], ["Original receipts/invoices/payroll", "Missing", "Required finance support", "SYNTHETIC"], ["Participant-level attendance", "Missing", "Required program support", "SYNTHETIC"], ["Finance/program reviewer sign-offs", "Missing", "Required review", "SYNTHETIC"]])
  };
  for (const [name, content] of Object.entries({ ...staticFiles, ...docs })) await fs.writeFile(path.join(destination, name), content, "utf8");
  const workbook = path.join(destination, "GrantDeskHQ-budget-vs-actual.xlsx");
  await createWorkbook(workbook);
  const zipEntries = {};
  for (const name of requiredFiles) zipEntries[name] = new Uint8Array(await fs.readFile(path.join(destination, name)));
  await fs.writeFile(path.join(destination, "GrantDeskHQ-synthetic-report-kit.zip"), zipSync(zipEntries, { level: 6 }));
  const totals = calculatedTotals();
  assert.equal(totals.raw, 57200);
  assert.equal(totals.actual, 55200);
  assert.equal(totals.includedRows, 13);
  return { destination, files: requiredFiles, zip: "GrantDeskHQ-synthetic-report-kit.zip", totals };
}

export async function verifyWorkedExampleResources(destination) {
  const totals = calculatedTotals();
  const workbook = await fs.readFile(path.join(destination, "GrantDeskHQ-budget-vs-actual.xlsx"));
  const workbookEntries = unzipSync(workbook);
  const formulaSheet = strFromU8(workbookEntries["xl/worksheets/sheet3.xml"]);
  assert.match(formulaSheet, /SUMIFS\(Ledger!/);
  assert.match(formulaSheet, /APPROVAL REQUIRED/);
  const zipEntries = unzipSync(await fs.readFile(path.join(destination, "GrantDeskHQ-synthetic-report-kit.zip")));
  assert.deepEqual(Object.keys(zipEntries).sort(), [...requiredFiles].sort());
  assert.match(strFromU8(zipEntries["reviewable-quarterly-report.md"]), /\$55,200/);
  return { fileCount: Object.keys(zipEntries).length, totals };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await generateWorkedExampleResources();
  const verification = await verifyWorkedExampleResources(result.destination);
  console.log(JSON.stringify({ ...result, verification }, null, 2));
}
