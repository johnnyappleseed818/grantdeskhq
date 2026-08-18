#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { selectExplicitOpportunity, validateSeoEngine } from "./seo-growth-engine.mjs";

const root = resolve(process.cwd());
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const idIndex = args.indexOf("--opportunity");
const opportunityId = idIndex >= 0 ? args[idIndex + 1] : "";
const validation = validateSeoEngine(root);
if (validation.status !== "PASS") throw new Error(`SEO engine validation failed: ${validation.problems.map((problem) => problem.id).join(", ")}`);
if (!opportunityId) {
  console.log(JSON.stringify({ status: "READY", publishing_enabled: false, message: "Validation passed. Supply --opportunity <explicit-id> to prepare exactly one task." }, null, 2));
  process.exit(0);
}
const opportunity = selectExplicitOpportunity(root, opportunityId);
if (!dryRun) throw new Error("Only --dry-run is permitted by the recurring SEO setup runner. It never publishes or invokes content production directly.");
const env = { ...process.env, CODEX_QUEUE_FILE: "ops/seo-content-run-queue.json", CODEX_QUEUE_POLICY: "ops/seo-operating-policy.md", CODEX_QUEUE_BUDGET_POLICY: "ops/seo-budget-policy.json", CODEX_QUEUE_MAX_WORKERS: "1" };
const command = spawnSync(process.execPath, ["scripts/codex-project-runner/queue.mjs", "status"], { cwd: root, env, encoding: "utf8" });
if (command.status !== 0) throw new Error(command.stderr || "Existing governed controller status check failed.");
console.log(JSON.stringify({ status: "PREPARED", dry_run: true, opportunity, controller: "scripts/codex-project-runner/queue.mjs", controller_status: JSON.parse(command.stdout) }, null, 2));
