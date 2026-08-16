import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ownFile = "scripts/audit-stripe-pci.mjs";
const roots = ["server", "src", "scripts", "tests", ".github"];
const sourceExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".yml", ".yaml"]);
const patterns = [
  { label: "raw card-number parameter", pattern: /\bcard_number\b|\bcard\[number\]\b|\bcard\s*:\s*\{[^}]*\bnumber\b/i },
  { label: "raw card security-code parameter", pattern: /\b(?:cvc|cvv)\b/i },
  { label: "raw card expiry parameter", pattern: /\b(?:exp_month|exp_year)\b/i },
  { label: "Stripe payment_method_data payload", pattern: /\bpayment_method_data\b/i },
  { label: "probable raw payment-account number literal", pattern: /(?:^|[^0-9-])(?:[0-9][ -]?){12,18}[0-9](?:$|[^0-9-])/ }
];

async function sourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
    if (entry.isDirectory()) files.push(...await sourceFiles(absolute));
    if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name)) || relative === ownFile) continue;
    files.push(absolute);
  }
  return files;
}

const files = (await Promise.all(roots.map((directory) => sourceFiles(path.join(root, directory))))).flat();
const violations = [];
for (const file of files) {
  const relative = path.relative(root, file).replaceAll(path.sep, "/");
  const source = await fs.readFile(file, "utf8");
  for (const { label, pattern } of patterns) if (pattern.test(source)) violations.push({ file: relative, label });
}

console.log(JSON.stringify({ event: "stripe_pci_static_audit", filesScanned: files.length, violations }));
if (violations.length) process.exitCode = 1;
