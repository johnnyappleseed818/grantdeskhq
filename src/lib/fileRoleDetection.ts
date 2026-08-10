import type { SourceRole } from "../types/prototype";

export interface FileRoleSuggestion {
  assignedRole: SourceRole;
  suggestedRole: SourceRole;
  fileName: string;
  fileSize: number;
  lastModified: number;
  reason: string;
  key: string;
}

const filenamePatterns: Array<[SourceRole, RegExp]> = [
  ["ledgerExport", /(?:^|[\s_.-])(?:general[\s_.-]*ledger|ledger|gl)(?:[\s_.-]|$)|transactions?/i],
  ["approvedBudget", /approved[\s_.-]*budget|grant[\s_.-]*budget|budget/i],
  ["awardAgreement", /award|notice[\s_.-]*of[\s_.-]*award|grant[\s_.-]*agreement|agreement/i],
  ["programUpdate", /program[\s_.-]*(?:update|report)|outcomes?|kpi/i],
  ["funderTemplate", /funder[\s_.-]*(?:form|template)|report[\s_.-]*template|blank[\s_.-]*report/i],
  ["supportingEvidence", /support|evidence|receipt|invoice|documentation/i]
];

export function sourceRoleSuggestionFromName(fileName: string): SourceRole | null {
  return filenamePatterns.find(([, pattern]) => pattern.test(fileName))?.[0] || null;
}

export async function inspectFileRole(file: File, assignedRole: SourceRole): Promise<FileRoleSuggestion | null> {
  const namedRole = sourceRoleSuggestionFromName(file.name);
  if (namedRole && namedRole !== assignedRole) return suggestion(file, assignedRole, namedRole, fileRoleReason(namedRole, "filename"));
  const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  let headers: string[] = [];
  try {
    if (extension === ".csv") {
      headers = csvHeaders(await file.text());
    } else if (extension === ".xlsx") {
      const { readSheet } = await import("read-excel-file/browser");
      const rows = await readSheet(file, 1);
      headers = rows.slice(0, 5).flat().map((value) => String(value || "").trim()).filter(Boolean);
    }
  } catch {
    return null;
  }
  const detected = detectRoleFromHeaders(headers);
  return detected && detected !== assignedRole ? suggestion(file, assignedRole, detected, fileRoleReason(detected, "contents")) : null;
}

export function detectRoleFromHeaders(values: string[]): SourceRole | null {
  const normalized = values.join(" | ").toLowerCase();
  if (!normalized) return null;
  const ledgerSignals = ["transaction id", "transaction date", "vendor", "payee", "memo", "account code", "gl account", "department", "class", "debit", "credit"]
    .filter((value) => normalized.includes(value)).length;
  const hasDate = /\bdate\b/.test(normalized);
  const hasAmount = /\bamount\b|\bdebit\b|\bcredit\b/.test(normalized);
  if (ledgerSignals >= 2 && hasDate && hasAmount) return "ledgerExport";
  const budgetSignals = ["approved budget", "budget category", "budget line", "approved amount", "allocation", "budgeted amount"]
    .filter((value) => normalized.includes(value)).length;
  if (budgetSignals >= 2 && !hasDate) return "approvedBudget";
  return null;
}

export function fileRoleSuggestionKey(role: SourceRole, file: Pick<File, "name" | "size" | "lastModified">) {
  return `${role}:${file.name}:${file.size}:${file.lastModified}`;
}

function suggestion(file: File, assignedRole: SourceRole, suggestedRole: SourceRole, reason: string): FileRoleSuggestion {
  return { assignedRole, suggestedRole, fileName: file.name, fileSize: file.size, lastModified: file.lastModified, reason, key: fileRoleSuggestionKey(assignedRole, file) };
}

function csvHeaders(value: string) {
  return value.split(/\r?\n/).slice(0, 5).flatMap((row) => row.split(",")).map((cell) => cell.replace(/^\s*["']|["']\s*$/g, "").trim()).filter(Boolean);
}

function fileRoleReason(role: SourceRole, signal: "filename" | "contents") {
  if (role === "ledgerExport") return `The ${signal === "filename" ? "filename" : "worksheet columns"} looks like transaction-level accounting data, not an approved budget.`;
  if (role === "approvedBudget") return `The ${signal === "filename" ? "filename" : "worksheet columns"} looks like an approved budget rather than transaction-level accounting data.`;
  return `The ${signal === "filename" ? "filename" : "file contents"} appears to belong in a different source field.`;
}
