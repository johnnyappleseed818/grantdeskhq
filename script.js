import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import writeExcelFile from "write-excel-file/node";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(projectRoot, "public", "samples");
const rawData = await fs.readFile(path.join(projectRoot, "src", "data", "grantData.json"), "utf8");
const data = JSON.parse(rawData);

await fs.mkdir(samplesDir, { recursive: true });

const categoryTotals = Object.fromEntries(data.budget.map((line) => [line.category, 0]));
for (const transaction of data.transactions) {
  if (transaction.suggestedCategory) categoryTotals[transaction.suggestedCategory] += transaction.amount;
}
const mappedTotal = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0);
const ledgerTotal = data.transactions.reduce((sum, transaction) => sum + transaction.amount, 0);

const money = (value) => `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

async function createPdf(fileName, pageDefinitions) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  pageDefinitions.forEach((definition, index) => {
    const page = pdf.addPage([612, 792]);
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: height - 74, width, height: 74, color: rgb(0.063, 0.137, 0.247) });
    page.drawText("GrantDesk", { x: 42, y: height - 42, size: 18, font: bold, color: rgb(1, 1, 1) });
    page.drawText("SYNTHETIC DEMONSTRATION DATA", { x: 376, y: height - 39, size: 8, font: bold, color: rgb(0.75, 0.86, 0.79) });
    page.drawText(definition.title, { x: 42, y: height - 112, size: 19, font: bold, color: rgb(0.063, 0.137, 0.247) });

    let y = height - 142;
    for (const paragraph of definition.lines) {
      const wrapped = wrap(paragraph, 88);
      for (const line of wrapped) {
        page.drawText(line, { x: 42, y, size: 10.5, font: regular, color: rgb(0.16, 0.22, 0.3) });
        y -= 15;
      }
      y -= 8;
    }

    page.drawLine({ start: { x: 42, y: 42 }, end: { x: width - 42, y: 42 }, thickness: 0.5, color: rgb(0.78, 0.81, 0.84) });
    page.drawText("Interactive demo · Synthetic data · Draft for professional review", { x: 42, y: 26, size: 7.5, font: regular, color: rgb(0.35, 0.4, 0.46) });
    page.drawText(`${index + 1} / ${pageDefinitions.length}`, { x: width - 68, y: 26, size: 7.5, font: regular, color: rgb(0.35, 0.4, 0.46) });
  });

  const bytes = await pdf.save();
  await fs.writeFile(path.join(samplesDir, fileName), bytes);
}

function wrap(text, maxLength) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxLength) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

await createPdf("Synthetic_Grant_Agreement.pdf", [
  { title: "Synthetic Grant Agreement", lines: ["Pacific Youth Foundation", "Youth Access Initiative · Hope Community Services", "Grant period: January 1, 2026 through December 31, 2026", "This document contains synthetic demonstration data and is not a legal agreement."] },
  { title: "1. Award", lines: ["The Foundation awards Hope Community Services an amount not to exceed $150,000 for the Youth Access Initiative.", "Award-rule extraction source: page 2."] },
  { title: "2. Approved Purpose", lines: ["The Youth Access Initiative will provide school-linked learning support within the approved community-school service area.", "Program outcomes require professional review against confirmed program records."] },
  { title: "3. Approved Budget", lines: ["Personnel: $90,000", "Program Supplies: $35,000", "Local Travel: $15,000", "Indirect Overhead: $10,000", "Total approved annual budget: $150,000"] },
  { title: "4. Reporting Period", lines: ["The six-month progress report covers January 1, 2026 through June 30, 2026.", "The report is a draft until reviewed and approved by an authorized professional."] },
  { title: "5. Financial Evidence", lines: ["Cumulative expenditure must be supported by the grantee's reviewed general-ledger records and transaction evidence.", "GrantDesk does not replace the accounting system of record."] },
  { title: "6. Narrative Requirement", lines: ["The grantee will describe progress toward approved program goals using confirmed program information.", "The six-month narrative response may not exceed 200 words."] },
  { title: "7. Travel Documentation", lines: ["Each local-travel transaction above $1,000 must include an itemized receipt and written justification.", "This rule applies to TRV-001, TRV-002, and TRV-003 in the synthetic ledger."] },
  { title: "8. Material Variances", lines: ["Explain each budget category varying by more than ten percent from the elapsed-period spending plan.", "Local Travel is $2,300, or 30.67%, above the six-month elapsed-period plan."] },
  { title: "9. Program Result", lines: ["The six-month report must state the unduplicated number of youth served.", "Confirmed synthetic program result: 118 youth served against a target of 120."] },
  { title: "10. Supporting Records", lines: ["Source documents, transaction IDs, and supporting-document status should be retained for professional review.", "One itemized receipt for TRV-003 remains missing in the initial demonstration state."] },
  { title: "11. Amendments", lines: ["No synthetic amendment changes the $150,000 award or approved category budgets shown in this demonstration."] },
  { title: "12. Contact Record", lines: ["Funder: Pacific Youth Foundation", "Grantee: Hope Community Services", "Outsourced finance team: Northstar Nonprofit Finance", "All names are synthetic."] },
  { title: "13. Certification", lines: ["An authorized representative must sign the certification before the report is submitted.", "This synthetic agreement is unsigned and has no legal effect."] }
]);

await createPdf("Synthetic_Funder_Report_Draft.pdf", [
  { title: "Six-Month Progress Report — Draft", lines: ["Pacific Youth Foundation · Youth Access Initiative", "Hope Community Services", "Reporting period: January 1, 2026 through June 30, 2026", "Synthetic demonstration data. Professional review required."] },
  { title: "Executive Summary", lines: ["Hope Community Services served 118 youth during the first six months, reaching 98.3% of its six-month target of 120.", "Mapped cumulative expenditures total $74,150 against the $150,000 annual award.", "Two workshops were deferred; the reason and corrective action still require confirmation."] },
  { title: "Budget Versus Actual", lines: data.budget.map((line) => {
    const actual = categoryTotals[line.category];
    const expected = line.annualBudget * 0.5;
    const variance = actual - expected;
    const percent = expected === 0 ? 0 : variance / expected * 100;
    return `${line.category}: annual ${money(line.annualBudget)}; six-month plan ${money(expected)}; mapped actual ${money(actual)}; remaining ${money(line.annualBudget - actual)}; variance ${money(variance)} (${percent.toFixed(2)}%).`;
  }).concat(["Total mapped actuals: $74,150. Remaining mapped budget: $75,850.", "UNM-001 for $1,250 remains excluded pending review."]) },
  { title: "Local Travel Variance Explanation", lines: ["Annual travel budget: $15,000. Six-month elapsed plan: $7,500. Actual travel: $9,800. Above elapsed plan: $2,300, or 30.67%.", "Three additional school-site visits were approved. The program expanded into two additional schools, and mileage reimbursement increased during the reporting period.", "TRV-001 and TRV-002 receipts are attached. The TRV-003 itemized receipt remains missing.", "The statement that travel increased because of hotel costs is blocked because no synthetic source supports hotel costs."] },
  { title: "Program Results and Missing Inputs", lines: ["Confirmed youth served: 118. Six-month target: 120. Achievement: 98.3%.", "Known: two workshops were deferred into the next reporting period.", "Still required: reason for deferral, corrective action, TRV-003 receipt, and authorized certification."] },
  { title: "Controller Review Checklist", lines: ["PASSED: Budget totals reconcile.", "PASSED: Initial mapped actuals reconcile to $74,150.", "PASSED: Travel variance identified and source-supported draft prepared.", "PASSED: Youth-served contradiction detected.", "OPEN: $1,250 unmapped transaction.", "OPEN: Missing receipt for TRV-003.", "OPEN: Final certification not signed."] },
  { title: "Source Citation Appendix", lines: ["Synthetic Grant Agreement — award, category, travel, and certification rules.", "Approved Grant Budget — annual category amounts totaling $150,000.", "General Ledger Export — 20 transactions totaling $75,400.", "Program Update Form — 118 youth served, school expansion, additional visits, and deferred workshops.", "Supporting Receipt Schedule — two attached travel receipts and one missing receipt."] }
]);

const syntheticBanner = (columnCount) => [[{
  value: "SYNTHETIC DEMONSTRATION DATA · DRAFT FOR PROFESSIONAL HUMAN REVIEW",
  span: columnCount,
  fontWeight: "bold",
  color: "#355442",
  backgroundColor: "#DDEBE2",
  align: "center"
}]];

const columnHeader = (labels) => labels.map((value) => ({
  value,
  fontWeight: "bold",
  color: "#FFFFFF",
  backgroundColor: "#10233F"
}));

const currencyCell = (value) => ({ value, type: Number, format: "[$$-409]#,##0" });
const percentCell = (value) => ({ value, type: Number, format: "0.00%" });

const approvedBudgetData = [
  ...syntheticBanner(2),
  columnHeader(["Budget category", "Approved annual budget"]),
  ...data.budget.map((line) => [line.category, currencyCell(line.annualBudget)]),
  [{ value: "Total", fontWeight: "bold" }, { ...currencyCell(data.grantAmount), fontWeight: "bold" }]
];

const bvaRows = data.budget.map((line) => {
  const actual = categoryTotals[line.category];
  const expected = line.annualBudget * data.elapsedTime;
  return [
    line.category,
    currencyCell(line.annualBudget),
    currencyCell(expected),
    currencyCell(actual),
    currencyCell(line.annualBudget - actual),
    currencyCell(actual - expected),
    percentCell((actual - expected) / expected)
  ];
});
const totalExpected = data.grantAmount * data.elapsedTime;
const bvaData = [
  ...syntheticBanner(7),
  columnHeader(["Budget category", "Annual budget", "Elapsed plan", "Mapped actual", "Remaining", "Variance amount", "Variance percent"]),
  ...bvaRows,
  [
    { value: "Total", fontWeight: "bold" },
    { ...currencyCell(data.grantAmount), fontWeight: "bold" },
    { ...currencyCell(totalExpected), fontWeight: "bold" },
    { ...currencyCell(mappedTotal), fontWeight: "bold" },
    { ...currencyCell(data.grantAmount - mappedTotal), fontWeight: "bold" },
    { ...currencyCell(mappedTotal - totalExpected), fontWeight: "bold" },
    { ...percentCell((mappedTotal - totalExpected) / totalExpected), fontWeight: "bold" }
  ]
];

const reportingRulesData = [
  ...syntheticBanner(3),
  columnHeader(["Rule", "Threshold or value", "Source"]),
  ["Award total", "$150,000", "Grant Agreement · page 2"],
  ["Travel documentation", "Receipt and written justification above $1,000", "Grant Agreement · page 8"],
  ["Material variance", "Explanation above 10% from elapsed plan", "Funder Template · page 4"],
  ["Narrative limit", "200 words", "Funder Template · page 2"],
  ["Program result", "Youth served required", "Funder Template · page 3"],
  ["Certification", "Authorized signature required", "Funder Template · page 6"]
];

await writeExcelFile([
  { data: approvedBudgetData, sheet: "Approved Budget", columns: [{ width: 28 }, { width: 24 }], stickyRowsCount: 2 },
  { data: bvaData, sheet: "Six-Month BVA", columns: [{ width: 28 }, ...Array.from({ length: 6 }, () => ({ width: 18 }))], stickyRowsCount: 2 },
  { data: reportingRulesData, sheet: "Reporting Rules", columns: [{ width: 28 }, { width: 48 }, { width: 32 }], stickyRowsCount: 2 }
]).toFile(path.join(samplesDir, "Approved_Grant_Budget.xlsx"));

const transactionEvidenceData = [
  ...syntheticBanner(11),
  columnHeader(["Transaction ID", "Date", "Vendor or memo", "GL account", "Amount", "Suggested category", "Confidence", "Evidence", "Review status", "Grant tag", "Receipt status"]),
  ...data.transactions.map((transaction) => [
    transaction.id,
    transaction.date,
    transaction.vendorMemo,
    transaction.glAccount,
    currencyCell(transaction.amount),
    transaction.suggestedCategory ?? "Unmapped",
    transaction.confidence,
    transaction.evidence,
    transaction.reviewStatus,
    transaction.grantTag || "Blank",
    transaction.receiptStatus
  ]),
  [
    { value: "TOTAL", fontWeight: "bold" },
    "",
    "20 transactions",
    "",
    { ...currencyCell(ledgerTotal), fontWeight: "bold" },
    "",
    "",
    "Mapped actuals: $74,150; unmapped: $1,250",
    "",
    "",
    ""
  ]
];

const receiptChecklistData = [
  ...syntheticBanner(6),
  columnHeader(["Transaction ID", "Amount", "Above $1,000", "Itemized receipt", "Written justification", "Review state"]),
  ...data.transactions
    .filter((transaction) => transaction.suggestedCategory === "Local Travel")
    .map((transaction) => [
      transaction.id,
      currencyCell(transaction.amount),
      "Yes",
      transaction.receiptStatus,
      "Documented",
      transaction.receiptStatus === "Missing" ? "Needs review" : "Support present"
    ])
];

const citationLogData = [
  ...syntheticBanner(4),
  columnHeader(["Source", "Location", "Supports", "Reviewer status"]),
  ["Synthetic Grant Agreement", "Pages 2, 8, and 14", "Award, travel documentation, certification", "Review original"],
  ["Approved Grant Budget", "Worksheet 1", "Annual category budgets", "Reconciled"],
  ["General Ledger Export", "Transactions PAY-001 through UNM-001", "Mapped actuals and evidence schedule", "UNM-001 open"],
  ["Funder Report Template", "Sections A through F", "Required report structure", "Extracted"],
  ["Program Update Form", "Responses 1 through 5", "Youth served and program facts", "Two responses open"],
  ["Supporting Receipt Schedule", "TRV-001 through TRV-003", "Travel support", "TRV-003 missing"]
];

await writeExcelFile([
  {
    data: transactionEvidenceData,
    sheet: "Transaction Evidence",
    columns: [{ width: 16 }, { width: 14 }, { width: 42 }, { width: 32 }, { width: 14 }, { width: 24 }, { width: 14 }, { width: 54 }, { width: 18 }, { width: 18 }, { width: 18 }],
    stickyRowsCount: 2
  },
  { data: receiptChecklistData, sheet: "Travel Receipt Checklist", columns: [{ width: 18 }, { width: 14 }, { width: 18 }, { width: 22 }, { width: 24 }, { width: 22 }], stickyRowsCount: 2 },
  { data: citationLogData, sheet: "Source Citation Log", columns: [{ width: 34 }, { width: 38 }, { width: 52 }, { width: 24 }], stickyRowsCount: 2 }
]).toFile(path.join(samplesDir, "Transaction_Evidence_Schedule.xlsx"));

const csvHeader = ["Transaction ID", "Date", "Vendor or memo", "GL account", "Amount", "Suggested category", "Confidence", "Evidence", "Review status", "Grant tag", "Receipt status"];
const csvRows = data.transactions.map((transaction) => [
  transaction.id, transaction.date, transaction.vendorMemo, transaction.glAccount, transaction.amount,
  transaction.suggestedCategory ?? "", transaction.confidence, transaction.evidence,
  transaction.reviewStatus, transaction.grantTag, transaction.receiptStatus
]);
const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
const csv = [
  "# SYNTHETIC DEMONSTRATION DATA — DRAFT FOR PROFESSIONAL HUMAN REVIEW",
  csvHeader.map(escapeCsv).join(","),
  ...csvRows.map((row) => row.map(escapeCsv).join(","))
].join("\n");
await fs.writeFile(path.join(samplesDir, "General_Ledger_Export.csv"), `${csv}\n`, "utf8");

console.log("Generated five synthetic sample assets:");
console.log("- public/samples/Synthetic_Grant_Agreement.pdf");
console.log("- public/samples/Approved_Grant_Budget.xlsx");
console.log("- public/samples/General_Ledger_Export.csv");
console.log("- public/samples/Synthetic_Funder_Report_Draft.pdf");
console.log("- public/samples/Transaction_Evidence_Schedule.xlsx");
console.log(`Verified source totals: ${data.transactions.length} transactions; ledger ${money(ledgerTotal)}; mapped ${money(mappedTotal)}.`);
