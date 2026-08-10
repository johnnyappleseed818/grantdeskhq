import { readSheet } from "read-excel-file/node";
import { detectRoleFromHeaders } from "../src/lib/fileRoleDetection.ts";
import type { CompilationRequest, CompilerFile } from "../src/types/prototype.ts";
import type { FinancialLedgerRow } from "./financialControls.ts";

type Cell = string | number | boolean | Date | null;

export interface NormalizedCompilationSources {
  request: CompilationRequest;
  ledgerRows: FinancialLedgerRow[];
  correctedLedgerRole: boolean;
}

export async function normalizeCompilationSources(request: CompilationRequest): Promise<NormalizedCompilationSources> {
  let correctedLedgerRole = false;
  let files = request.files.map((file) => ({ ...file }));
  if (!files.some((file) => file.role === "ledgerExport")) {
    for (const file of files.filter((item) => item.role === "approvedBudget" && isTabular(item))) {
      const rows = await tabularRows(file);
      if (detectTabularRole(rows) !== "ledgerExport") continue;
      files = files.map((item) => item === file || (item.name === file.name && item.role === file.role) ? { ...item, role: "ledgerExport" as const } : item);
      correctedLedgerRole = true;
      break;
    }
  }
  const normalizedRequest = { ...request, files };
  const ledgerFile = files.find((file) => file.role === "ledgerExport" && isTabular(file));
  return {
    request: normalizedRequest,
    ledgerRows: ledgerFile ? ledgerRows(await tabularRows(ledgerFile)) : [],
    correctedLedgerRole
  };
}

function isTabular(file: CompilerFile) {
  const name = file.name.toLowerCase();
  return name.endsWith(".csv") || name.endsWith(".xlsx") || file.mimeType.includes("csv") || file.mimeType.includes("spreadsheetml");
}

async function tabularRows(file: CompilerFile): Promise<Cell[][]> {
  const encoded = file.data.split(",", 2)[1];
  if (!encoded) return [];
  const buffer = Buffer.from(encoded, "base64");
  if (file.name.toLowerCase().endsWith(".xlsx") || file.mimeType.includes("spreadsheetml")) {
    try { return await readSheet(buffer, 1) as Cell[][]; }
    catch { return []; }
  }
  return buffer.toString("utf8").split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#")).map(csvRow);
}

function detectTabularRole(rows: Cell[][]) {
  for (const row of rows.slice(0, 12)) {
    const detected = detectRoleFromHeaders(row.map(cellText));
    if (detected) return detected;
  }
  return detectRoleFromHeaders(rows.slice(0, 5).flat().map(cellText));
}

function ledgerRows(rows: Cell[][]): FinancialLedgerRow[] {
  const headerIndex = rows.slice(0, 12).findIndex((row) => detectRoleFromHeaders(row.map(cellText)) === "ledgerExport");
  if (headerIndex < 0) return [];
  const header = rows[headerIndex].map((value) => cellText(value).toLowerCase());
  const column = (...names: string[]) => header.findIndex((value) => names.includes(value));
  return rows.slice(headerIndex + 1).map((row) => ({
    id: cellText(row[column("transaction id", "transaction id #", "transaction number", "id")]).trim(),
    date: dateText(row[column("date", "transaction date")]),
    description: cellText(row[column("vendor or memo", "description", "memo", "vendor/payee")]).trim(),
    amount: amountValue(row[column("amount", "transaction amount")]),
    account: cellText(row[column("gl account", "account", "account name", "general ledger account")]).trim(),
    vendor: cellText(row[column("vendor/payee", "vendor", "payee", "vendor or memo")]).trim()
  })).filter((row) => row.id && Number.isFinite(row.amount));
}

function cellText(value: Cell | undefined) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value === null || value === undefined ? "" : String(value);
}

function dateText(value: Cell | undefined) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return cellText(value).trim();
}

function amountValue(value: Cell | undefined) {
  if (typeof value === "number") return value;
  const normalized = cellText(value).trim().replaceAll(",", "").replace(/^\((.+)\)$/, "-$1").replace(/[$\s]/g, "");
  return normalized ? Number(normalized) : Number.NaN;
}

function csvRow(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { values.push(value); value = ""; }
    else value += character;
  }
  values.push(value);
  return values;
}
