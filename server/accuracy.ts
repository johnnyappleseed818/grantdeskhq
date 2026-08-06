import type { CompilationRequest, CompilationResult, ValidationFinding } from "../src/types/prototype.ts";

interface LedgerRow { id: string; date: string; description: string; amount: number }

export function applyDeterministicAccuracyChecks(request: CompilationRequest, result: CompilationResult): CompilationResult {
  const ledger = parseLedger(request);
  const deterministicFindings: ValidationFinding[] = [];
  const seen = new Set<string>();
  const mappings = result.mappings.map((mapping) => {
    const row = ledger.find((candidate) => candidate.id === mapping.transactionId);
    if (!row || seen.has(mapping.transactionId)) {
      deterministicFindings.push(finding(mapping.transactionId, "blocked", row ? "Duplicate transaction mapping detected." : "Transaction ID does not exist in the uploaded ledger."));
      return { ...mapping, confidence: 0, status: "blocked" as const };
    }
    seen.add(mapping.transactionId);
    const amountMatches = Math.abs(mapping.amount - row.amount) < 0.005;
    if (!amountMatches) deterministicFindings.push(finding(mapping.transactionId, "blocked", `AI amount ${mapping.amount} did not match ledger amount ${row.amount}. The ledger value replaced it.`));
    return {
      ...mapping,
      date: row.date,
      description: row.description,
      amount: row.amount,
      status: amountMatches ? mapping.status : "blocked" as const,
      rationale: `${mapping.rationale} Ledger ID, date, description and amount were checked deterministically.`
    };
  });

  const sourceNames = new Set(request.files.map((file) => file.name));
  for (const item of [...result.requirements, ...result.narrative]) {
    if (!sourceNames.has(item.source.sourceName) || !item.source.locator.trim() || !item.source.excerpt.trim()) {
      deterministicFindings.push(finding(item.id, "blocked", "The citation does not contain a complete reference to an uploaded source."));
    }
  }

  const exactLedgerCoverage = ledger.length > 0 && ledger.length === seen.size && deterministicFindings.every((item) => !item.itemId.startsWith("ledger-") || item.verdict !== "blocked");
  const qualityChecks = [
    ...result.qualityChecks.filter((check) => check.id !== "deterministic-ledger"),
    {
      id: "deterministic-ledger",
      label: "Every AI transaction matches the uploaded ledger",
      detail: exactLedgerCoverage ? `${ledger.length} ledger rows matched by ID and amount.` : `${ledger.length} ledger rows were parsed; ${seen.size} unique mappings matched. Review blocked or missing rows.`,
      required: true,
      status: exactLedgerCoverage ? "passed" as const : "blocked" as const
    }
  ];
  const findings = dedupeFindings([...result.validation.findings, ...deterministicFindings]);
  const sourceMatchedItems = findings.filter((item) => item.verdict === "source_matched").length;
  const itemsNeedingReview = findings.filter((item) => item.verdict === "review").length;
  const blockedItems = findings.filter((item) => item.verdict === "blocked").length;
  return {
    ...result,
    mappings,
    qualityChecks,
    validation: {
      ...result.validation,
      findings,
      sourceMatchedItems,
      itemsNeedingReview,
      blockedItems,
      evidenceCoveragePercent: findings.length ? Math.round((sourceMatchedItems / findings.length) * 100) : 0,
      method: `${result.validation.method} Deterministic code separately checks ledger IDs, dates, descriptions, amounts, duplicates, mapping coverage and citation completeness.`
    },
    warnings: [...new Set([...result.warnings, "Ledger amounts shown in the draft come from deterministic source matching, not model-generated arithmetic."])]
  };
}

export function parseLedger(request: CompilationRequest): LedgerRow[] {
  const file = request.files.find((item) => item.role === "ledgerExport" && (item.mimeType.includes("csv") || item.name.toLowerCase().endsWith(".csv")));
  if (!file) return [];
  const encoded = file.data.split(",", 2)[1];
  if (!encoded) return [];
  const lines = Buffer.from(encoded, "base64").toString("utf8").split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#"));
  if (lines.length < 2) return [];
  const header = csvRow(lines[0]).map((value) => value.toLowerCase());
  const column = (name: string) => header.indexOf(name);
  return lines.slice(1).map(csvRow).map((row) => ({
    id: row[column("transaction id")]?.trim() || "",
    date: row[column("date")]?.trim() || "",
    description: row[column("vendor or memo")]?.trim() || "",
    amount: Number(row[column("amount")] || NaN)
  })).filter((row) => row.id && Number.isFinite(row.amount));
}

function csvRow(line: string) {
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

function finding(itemId: string, verdict: "review" | "blocked", reason: string): ValidationFinding {
  return { id: `det-${itemId}-${verdict}`, itemId, verdict, reason, source: { sourceName: "Deterministic source check", locator: itemId, excerpt: reason } };
}

function dedupeFindings(findings: ValidationFinding[]) {
  const map = new Map<string, ValidationFinding>();
  for (const item of findings) map.set(item.id, item);
  return [...map.values()];
}
