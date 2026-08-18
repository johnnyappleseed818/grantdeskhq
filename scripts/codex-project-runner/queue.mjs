#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defaultStateDir, defaultStatusFile, queueSummary, readJson, routingUsagePath, runQueue, validateQueue, writeJson, writeStatus } from "./queue-lib.mjs";
import { loadBudgetPolicy } from "./cost-governor.mjs";
import { createRoutingUsage } from "./model-router.mjs";
const root = resolve(process.cwd()); const queuePath = resolve(root, "ops/codex-work-queue.json"); const modelPolicyPath = resolve(root, "ops/agent-model-policy.json"); const policyPath = resolve(root, "ops/codex-operating-policy.md"); const schemaPath = resolve(root, "ops/codex-task-result.schema.json"); const command = process.argv[2] || "status"; const stateDir = process.env.CODEX_QUEUE_STATE_DIR || defaultStateDir; const statusFile = process.env.CODEX_QUEUE_STATUS_FILE || defaultStatusFile;
const budgetPolicyPath = resolve(root, "ops/agent-budget-policy.json");
const queue = () => validateQueue(readJson(queuePath));
if (command === "status") {
  const value = queue(); const usageFile = routingUsagePath(stateDir); const budgetPolicy = loadBudgetPolicy(budgetPolicyPath);
  const storedUsage = existsSync(usageFile) ? readJson(usageFile) : undefined;
  // Do not compare a legacy run against the new limits. Only a run written by
  // this governor is valid status telemetry; otherwise show a fresh budget.
  const routingUsage = storedUsage?.budget_policy_version === budgetPolicy.version ? storedUsage : createRoutingUsage();
  writeStatus(value, stateDir, statusFile, { routingUsage, budgetPolicy }); console.log(JSON.stringify(queueSummary(value), null, 2));
}
else if (command === "stop") { writeFileSync(resolve(stateDir, "stop.requested"), new Date().toISOString() + "\n"); console.log("Stop requested."); }
else if (command === "blockers") { console.log(queue().tasks.filter((task) => task.status === "BLOCKED").map((task) => task.id + ": " + task.blocker).join("\n") || "NONE"); }
else if (command === "requeue") { const id = process.argv[3]; const value = queue(); const task = value.tasks.find((item) => item.id === id); if (!task || task.status !== "BLOCKED") throw new Error("Only an existing BLOCKED task can be requeued."); task.status = "QUEUED"; task.blocked_by = []; task.blocker = ""; task.updated_at = new Date().toISOString(); writeJson(queuePath, value); console.log("Requeued " + id); }
else if (command === "add") { const input = process.argv[3]; if (!input || !existsSync(input)) throw new Error("add requires a task JSON file."); const value = queue(); const task = JSON.parse(readFileSync(input, "utf8")); if (value.tasks.some((item) => item.id === task.id)) throw new Error("Task id already exists."); value.tasks.push(task); validateQueue(value); writeJson(queuePath, value); console.log("Added " + task.id); }
else if (command === "run") {
  const dryRun = process.argv.includes("--dry-run");
  const allowBudgetOverride = process.env.CODEX_QUEUE_ALLOW_BUDGET_OVERRIDE === "1";
  const allowSolOverride = allowBudgetOverride && process.env.CODEX_QUEUE_ALLOW_SOL === "1";
  const maxHours = process.env.CODEX_QUEUE_MAX_RUNTIME_MINUTES ? Number(process.env.CODEX_QUEUE_MAX_RUNTIME_MINUTES) / 60 : undefined;
  const maxTasks = process.env.CODEX_QUEUE_MAX_WORKERS ? Number(process.env.CODEX_QUEUE_MAX_WORKERS) : undefined;
  const result = await runQueue({ queuePath, policyPath, schemaPath, modelPolicyPath, budgetPolicyPath, root, stateDir, statusFile, maxRuntimeHours: maxHours, maxTasks, dryRun, allowBudgetOverride, allowSolOverride });
  console.log(JSON.stringify(queueSummary(result), null, 2));
}
else throw new Error("Unknown command: " + command);
