// @vitest-environment node
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import readExcelFile from "read-excel-file/node";
import { describe, expect, it } from "vitest";

const samples = path.resolve("public", "samples");

describe("generated synthetic documents", () => {
  it("generates the expected 14-page agreement and 7-page report PDFs", async () => {
    const agreement = await PDFDocument.load(await fs.readFile(path.join(samples, "Synthetic_Grant_Agreement.pdf")));
    const report = await PDFDocument.load(await fs.readFile(path.join(samples, "Synthetic_Funder_Report_Draft.pdf")));
    expect(agreement.getPageCount()).toBe(14);
    expect(report.getPageCount()).toBe(7);
  });

  it("writes exact budget and BVA totals into the workbook", async () => {
    const sheets = await readExcelFile(path.join(samples, "Approved_Grant_Budget.xlsx"));
    expect(sheets.map((sheet) => sheet.sheet)).toEqual(["Approved Budget", "Six-Month BVA", "Reporting Rules"]);

    const budgetSheet = sheets.find((sheet) => sheet.sheet === "Approved Budget")!.data;
    expect(budgetSheet[6][1]).toBe(150000);

    const bvaSheet = sheets.find((sheet) => sheet.sheet === "Six-Month BVA")!.data;
    expect(bvaSheet[6][1]).toBe(150000);
    expect(bvaSheet[6][3]).toBe(74150);
    expect(bvaSheet[6][4]).toBe(75850);
  });

  it("writes exactly 20 evidence rows totaling $75,400", async () => {
    const sheets = await readExcelFile(path.join(samples, "Transaction_Evidence_Schedule.xlsx"));
    const evidence = sheets.find((sheet) => sheet.sheet === "Transaction Evidence")!.data;
    const transactionRows = evidence.slice(2, 22);
    expect(transactionRows).toHaveLength(20);
    expect(transactionRows.reduce((sum, row) => sum + Number(row[4]), 0)).toBe(75400);
    expect(transactionRows.filter((row) => row[5] === "Unmapped")).toHaveLength(1);
  });

  it("writes a CSV disclosure, header, and exactly 20 transaction rows", async () => {
    const csv = await fs.readFile(path.join(samples, "General_Ledger_Export.csv"), "utf8");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("SYNTHETIC DEMONSTRATION DATA");
    expect(lines).toHaveLength(22);
    expect(lines.at(-1)).toContain("UNM-001");
  });
});
