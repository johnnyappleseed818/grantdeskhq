import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { applyRoute, createRoutingUsage, loadModelPolicy, nextRoutingDecision, recordInvocation, routingSummary, selectRoute } from "./model-router.mjs";

export const STATUSES = new Set(["QUEUED", "CLASSIFYING", "RUNNING", "VALIDATING", "RETRYING", "ESCALATING", "PASS", "PARTIAL", "BLOCKED", "FAILED", "SKIPPED"]);
export const terminal = new Set(["PASS", "PARTIAL", "BLOCKED", "FAILED", "SKIPPED"]);
export const defaultStateDir = join(homedir(), "grantdesk-project-runs", "codex-queue");
export const defaultStatusFile = join(homedir(), "grantdeskhq-codex-run-status.txt");
export const now = () => new Date().toISOString();
export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
export const writeJson = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2) + "\n"); };
export const routingUsagePath = (stateDir) => join(stateDir, "routing-usage.json");

export function validateQueue(queue) {
  if (!queue || !Array.isArray(queue.tasks)) throw new Error("Queue requires a tasks array.");
  const ids = new Set();
  for (const task of queue.tasks) {
    if (!task.id || !task.title || !STATUSES.has(task.status)) throw new Error("Task requires id, title, and a valid status.");
    if (ids.has(task.id)) throw new Error("Task ids must be unique: " + task.id);
    ids.add(task.id);
    if (!Array.isArray(task.dependencies) || !Array.isArray(task.acceptance_criteria) || !Array.isArray(task.artifacts_expected)) throw new Error("Task " + task.id + " has malformed arrays.");
    if (!Number.isInteger(task.priority) || !Number.isInteger(task.max_attempts) || task.max_attempts < 1) throw new Error("Task " + task.id + " has invalid priority or retry limit.");
  }
  for (const task of queue.tasks) for (const dependency of task.dependencies) if (!ids.has(dependency)) throw new Error("Unknown dependency " + dependency + " for " + task.id);
  return queue;
}

export function selectNextTask(queue) {
  validateQueue(queue);
  const byId = new Map(queue.tasks.map((task) => [task.id, task]));
  return queue.tasks.filter((task) => task.status === "QUEUED" && task.dependencies.every((id) => byId.get(id)?.status === "PASS"))
    .sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0] || null;
}

export function queueSummary(queue) {
  const count = Object.fromEntries([...STATUSES].map((status) => [status, 0]));
  for (const task of queue.tasks) count[task.status] += 1;
  return { total: queue.tasks.length, count, remaining: count.QUEUED + count.CLASSIFYING + count.RUNNING + count.VALIDATING + count.RETRYING + count.ESCALATING, next: selectNextTask(queue)?.id || null };
}

export function lockPath(stateDir) { return join(stateDir, "queue.lock.json"); }
export function stopPath(stateDir) { return join(stateDir, "stop.requested"); }
export function lockIsStale(lock, maxAgeMs = 12 * 60 * 60 * 1000) {
  if (!lock || !Number.isInteger(lock.pid)) return true;
  if (Date.now() - Date.parse(lock.startedAt || "") > maxAgeMs) return true;
  try { process.kill(lock.pid, 0); return false; } catch { return true; }
}
export function acquireLock(stateDir, queuePath) {
  mkdirSync(stateDir, { recursive: true }); const file = lockPath(stateDir);
  if (existsSync(file)) { const current = readJson(file); if (!lockIsStale(current)) throw new Error("Queue runner already active (pid " + current.pid + ")."); rmSync(file, { force: true }); }
  const lock = { pid: process.pid, startedAt: now(), queuePath, activeTask: null, childPid: null }; writeJson(file, lock); return lock;
}
export function updateLock(stateDir, patch) { const file = lockPath(stateDir); const next = { ...readJson(file), ...patch }; writeJson(file, next); return next; }
export function releaseLock(stateDir) { rmSync(lockPath(stateDir), { force: true }); }

export function writeStatus(queue, stateDir, statusFile = defaultStatusFile, extra = {}) {
  const summary = queueSummary(queue);
  const current = queue.tasks.find((task) => task.id === extra.currentTask);
  const usage = routingSummary(extra.routingUsage || createRoutingUsage());
  const routine = Object.entries(usage.by_model_reasoning).filter(([key]) => key.startsWith("gpt-5.6-luna/")).reduce((total, [, value]) => total + value.invocations, 0);
  const lines = ["GRANTDESKHQ CODEX QUEUE STATUS", "", "LAST UPDATED: " + now(), "TASKS TOTAL: " + summary.total, "QUEUED: " + summary.count.QUEUED, "CLASSIFYING: " + summary.count.CLASSIFYING, "RUNNING: " + summary.count.RUNNING, "VALIDATING: " + summary.count.VALIDATING, "RETRYING: " + summary.count.RETRYING, "ESCALATING: " + summary.count.ESCALATING, "PASSED: " + summary.count.PASS, "PARTIAL: " + summary.count.PARTIAL, "BLOCKED: " + summary.count.BLOCKED, "FAILED: " + summary.count.FAILED, "REMAINING: " + summary.remaining, "CURRENT TASK: " + (extra.currentTask || "none"), "TIER: " + (current?.selected_tier || "none"), "MODEL: " + (current?.selected_model || "none"), "REASONING: " + (current?.reasoning_level || "none"), "ATTEMPT: " + (current?.attempt_count || 0), "WHY THIS MODEL: " + (current?.why_selected || "none"), "LAST COMPLETED TASK: " + (extra.lastCompleted || "none"), "LAST CHECKPOINT: " + (extra.checkpoint || "none"), "", "MODEL ROUTING RUN TOTALS:", "ROUTINE TASKS: " + routine, "TERRA MEDIUM: " + (usage.by_model_reasoning["gpt-5.6-terra/medium"]?.invocations || 0), "TERRA HIGH: " + (usage.by_model_reasoning["gpt-5.6-terra/high"]?.invocations || 0), "TERRA XHIGH: " + (usage.by_model_reasoning["gpt-5.6-terra/xhigh"]?.invocations || 0), "SOL XHIGH: " + (usage.by_model_reasoning["gpt-5.6-sol/xhigh"]?.invocations || 0), "ESCALATIONS: " + usage.escalations, "RETRIES: " + usage.retries, "BUDGET BLOCKS: " + usage.budget_blocks, "RUNTIME: " + Math.round(usage.runtime_ms / 1000) + " seconds", "", "HUMAN ACTIONS REQUIRED:"];
  const blockers = queue.tasks.filter((task) => task.status === "BLOCKED").map((task) => task.id + ": " + (task.blocker || "not recorded"));
  lines.push(...(blockers.length ? blockers : ["NONE"]));
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(dirname(statusFile), { recursive: true });
  writeFileSync(statusFile, lines.join("\n") + "\n");
  appendFileSync(join(stateDir, "queue.log"), now() + " status updated\n");
}

export function composePrompt(task, policy, root) {
  return ["You are the bounded GrantDeskHQ queue worker. Complete only the selected task below.", "Repository root: " + root, "", "MODEL ROUTING", "Tier: " + task.selected_tier, "Model: " + task.selected_model, "Reasoning: " + task.reasoning_level, "Why selected: " + task.why_selected, "", "PERSISTENT OPERATING POLICY", policy, "", "TASK", JSON.stringify(task, null, 2), "", "Completion contract:", "- Do not start another queue task.", "- Preserve existing validated work and never force-push, expose secrets, send outreach, alter production traffic, make purchases, or create live Stripe charges.", "- Run the listed acceptance checks. Do not weaken tests.", "- Final output must be JSON matching the supplied schema with status PASS, PARTIAL, BLOCKED, or FAILED, tests, artifacts, blocker, and result_summary."].join("\n");
}

export function validateResult(result, task, root) {
  if (!result || !["PASS", "PARTIAL", "BLOCKED", "FAILED"].includes(result.status)) return { status: "FAILED", blocker: "Codex did not return a valid structured result." };
  const missing = task.artifacts_expected.filter((artifact) => !existsSync(resolve(root, artifact)));
  if (result.status === "PASS" && (missing.length || !Array.isArray(result.tests) || result.tests.length === 0 || (result.blocker || "").trim())) return { status: "PARTIAL", blocker: missing.length ? "Missing required artifacts: " + missing.join(", ") : "PASS requires recorded tests and no blocker." };
  return { status: result.status, blocker: result.blocker || "" };
}

export async function invokeCodex({ root, task, policy, schema, stateDir, maxRuntimeMs }) {
  const runDir = join(stateDir, "runs", task.id, now().replace(/[:.]/g, "-")); mkdirSync(runDir, { recursive: true });
  const finalFile = join(runDir, "final.json"); const eventFile = join(runDir, "events.jsonl"); const prompt = composePrompt(task, policy, root);
  const args = ["exec", "--strict-config", "--sandbox", "workspace-write", "--json", "--output-schema", schema, "--output-last-message", finalFile, "-m", task.selected_model, "-c", "model_reasoning_effort=" + JSON.stringify(task.reasoning_level), "-C", root, prompt];
  return await new Promise((resolvePromise) => {
    const child = spawn("codex", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CODEX_QUEUE_NO_PRODUCTION: "1", CODEX_QUEUE_NO_OUTBOUND: "1", CODEX_QUEUE_NO_PURCHASES: "1", CODEX_QUEUE_NO_FORCE_PUSH: "1" } });
    updateLock(stateDir, { activeTask: task.id, childPid: child.pid || null }); writeFileSync(eventFile, ""); const append = (chunk) => appendFileSync(eventFile, chunk); child.stdout.on("data", append); child.stderr.on("data", append);
    const started = Date.now(); const watchdog = setInterval(() => { if (existsSync(stopPath(stateDir)) || Date.now() - started > maxRuntimeMs) child.kill("SIGTERM"); }, 1000);
    child.on("close", (code, signal) => { clearInterval(watchdog); let result = null; try { result = readJson(finalFile); } catch { result = null; } resolvePromise({ code: code ?? 1, signal, result, runDir, eventFile, runtimeMs: Date.now() - started }); });
  });
}

export function writeMorningReport(queue, stateDir, reportFile = join(homedir(), "grantdeskhq-overnight-summary.txt"), runtimeMs = 0, routingUsage = createRoutingUsage()) {
  const summary = queueSummary(queue); const usage = routingSummary(routingUsage);
  const lines = ["GRANTDESKHQ OVERNIGHT REPORT", "", "TOTAL RUNTIME: " + Math.round(runtimeMs / 60000) + " minutes", "TASKS STARTED: " + queue.tasks.filter((task) => task.started_at).length, "TASKS PASSED: " + summary.count.PASS, "TASKS BLOCKED: " + summary.count.BLOCKED, "TASKS FAILED: " + summary.count.FAILED, "TASKS REMAINING: " + summary.remaining, "", "MODEL ROUTING:", "ROUTINE TASKS: " + Object.entries(usage.by_model_reasoning).filter(([key]) => key.startsWith("gpt-5.6-luna/")).reduce((total, [, value]) => total + value.invocations, 0), "TERRA MEDIUM: " + (usage.by_model_reasoning["gpt-5.6-terra/medium"]?.invocations || 0), "TERRA HIGH: " + (usage.by_model_reasoning["gpt-5.6-terra/high"]?.invocations || 0), "TERRA XHIGH: " + (usage.by_model_reasoning["gpt-5.6-terra/xhigh"]?.invocations || 0), "SOL XHIGH: " + (usage.by_model_reasoning["gpt-5.6-sol/xhigh"]?.invocations || 0), "ESCALATIONS: " + usage.escalations, "RETRIES: " + usage.retries, "BUDGET BLOCKS: " + usage.budget_blocks, "", "TASK CHECKPOINTS:"];
  for (const task of queue.tasks) lines.push(task.id + " | " + task.status + " | " + (task.selected_model || "unclassified") + " | " + (task.result_summary || task.blocker || "not started"));
  lines.push("", "PRODUCTION TRAFFIC CHANGED: NO", "OUTBOUND ACTIONS: 0", "PURCHASES: 0", "PAID ENRICHMENT: 0", "HUMAN ACTIONS REQUIRED:");
  const blockers = queue.tasks.filter((task) => task.status === "BLOCKED"); lines.push(...(blockers.length ? blockers.map((task) => task.id + ": " + task.blocker) : ["NONE"]));
  mkdirSync(dirname(reportFile), { recursive: true }); writeFileSync(reportFile, lines.join("\n") + "\n"); appendFileSync(join(stateDir, "queue.log"), now() + " morning report updated\n");
}

export async function runQueue({ queuePath, policyPath, schemaPath, root, stateDir = defaultStateDir, statusFile = defaultStatusFile, maxRuntimeHours = 8, maxTasks = 20, dryRun = false, morningReportFile = process.env.CODEX_QUEUE_MORNING_REPORT || join(homedir(), "grantdeskhq-overnight-summary.txt"), modelPolicyPath = join(dirname(queuePath), "agent-model-policy.json") }) {
  rmSync(stopPath(stateDir), { force: true }); const queue = validateQueue(readJson(queuePath)); const policy = readFileSync(policyPath, "utf8"); const modelPolicy = loadModelPolicy(modelPolicyPath); const effectiveMaxRuntimeHours = Math.min(maxRuntimeHours, Number(modelPolicy.budgets.max_total_runtime_hours || maxRuntimeHours)); const usageFile = routingUsagePath(stateDir); const routingUsage = existsSync(usageFile) ? readJson(usageFile) : createRoutingUsage(); acquireLock(stateDir, queuePath); const started = Date.now(); let lastCompleted = null;
  try {
    for (let processed = 0; processed < maxTasks && Date.now() - started < effectiveMaxRuntimeHours * 3_600_000; processed += 1) {
      if (existsSync(stopPath(stateDir))) break; const task = selectNextTask(queue); if (!task) break;
      task.status = "CLASSIFYING"; task.updated_at = now(); writeJson(queuePath, queue); writeStatus(queue, stateDir, statusFile, { currentTask: task.id, lastCompleted, checkpoint: "task classifying", routingUsage });
      const route = selectRoute(task, modelPolicy, routingUsage);
      if (!route.allowed) { task.status = "BLOCKED"; task.blocker = route.budget_block; task.updated_at = now(); routingUsage.budget_blocks += 1; writeJson(queuePath, queue); writeJson(usageFile, routingUsage); lastCompleted = task.id; writeStatus(queue, stateDir, statusFile, { currentTask: "none", lastCompleted, checkpoint: "budget guard blocked task", routingUsage }); continue; }
      applyRoute(task, route, modelPolicy); task.max_attempts = Math.min(task.max_attempts, 1 + Number(modelPolicy.budgets.max_retries_per_task || task.max_attempts)); task.status = "RUNNING"; task.started_at = task.started_at || now(); task.attempt_count += 1; task.updated_at = now(); writeJson(queuePath, queue); writeJson(usageFile, routingUsage); writeStatus(queue, stateDir, statusFile, { currentTask: task.id, lastCompleted, checkpoint: "task started", routingUsage });
      if (dryRun) { task.status = "PARTIAL"; task.blocker = "DRY_RUN: task classified but Codex was not invoked."; task.completed_at = now(); task.updated_at = now(); task.validation_status = "DRY_RUN"; task.result_summary = "Selected " + task.selected_model + " at " + task.reasoning_level + " reasoning without invoking Codex."; writeJson(queuePath, queue); lastCompleted = task.id; continue; }
      const remainingMs = Math.max(60_000, effectiveMaxRuntimeHours * 3_600_000 - (Date.now() - started)); const taskMaxMs = Math.max(60_000, Number(task.max_runtime_minutes || 1) * 60_000); const execution = await invokeCodex({ root, task, policy, schema: schemaPath, stateDir, maxRuntimeMs: Math.min(remainingMs, taskMaxMs) });
      recordInvocation(routingUsage, route, execution.runtimeMs); const verified = validateResult(execution.result, task, root); task.status = "VALIDATING"; task.updated_at = now(); writeJson(queuePath, queue); task.status = verified.status; task.validation_status = verified.status; task.blocker = verified.blocker; task.completed_at = now(); task.updated_at = now(); task.runtime_ms = execution.runtimeMs; task.result_summary = execution.result?.result_summary || "No structured task summary returned."; task.commit_sha = execution.result?.commit_sha || null; task.run_dir = execution.runDir;
      if (task.status === "FAILED" && task.attempt_count < task.max_attempts) { let decision = nextRoutingDecision(task, task.blocker + " " + task.result_summary, modelPolicy); if (decision.action === "ESCALATE" && Number(task.escalation_count || 0) >= Number(task.max_escalations || 0)) decision = { action: "RETRY", reason: "Escalation limit reached; retry without raising model cost.", next_step: Number(task.route_step || 0) }; if (decision.action === "ESCALATE") { task.escalation_count = Number(task.escalation_count || 0) + 1; routingUsage.escalations += 1; task.status = "ESCALATING"; } else { routingUsage.retries += 1; task.status = "RETRYING"; } task.route_step = decision.next_step; task.fallback_reason = decision.reason; task.blocker = "Retry " + task.attempt_count + " of " + task.max_attempts + ": " + decision.reason; task.completed_at = null; task.updated_at = now(); writeJson(queuePath, queue); writeJson(usageFile, routingUsage); writeStatus(queue, stateDir, statusFile, { currentTask: task.id, lastCompleted, checkpoint: task.status.toLowerCase(), routingUsage }); task.status = "QUEUED"; }
      writeJson(queuePath, queue); writeJson(usageFile, routingUsage); lastCompleted = terminal.has(task.status) ? task.id : lastCompleted; updateLock(stateDir, { activeTask: null, childPid: null }); writeStatus(queue, stateDir, statusFile, { currentTask: "none", lastCompleted, checkpoint: "task checkpointed", routingUsage });
    }
  } finally { updateLock(stateDir, { activeTask: null, childPid: null }); writeJson(usageFile, routingUsage); writeStatus(queue, stateDir, statusFile, { currentTask: "none", lastCompleted, checkpoint: "runner stopped", routingUsage }); writeMorningReport(queue, stateDir, morningReportFile, Date.now() - started, routingUsage); releaseLock(stateDir); }
  return queue;
}
