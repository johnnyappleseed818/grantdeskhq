import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { applyRoute, createRoutingUsage, loadModelPolicy, nextRoutingDecision, routingSummary, selectRoute } from "./model-router.mjs";
import { dispatchDecision, economics, failureCategory, loadBudgetPolicy, recordDispatchRuntime, reserveDispatch } from "./cost-governor.mjs";

export const STATUSES = new Set(["QUEUED", "CLASSIFYING", "RUNNING", "VALIDATING", "RETRYING", "ESCALATING", "PASS", "PARTIAL", "BLOCKED", "FAILED", "SKIPPED"]);
export const terminal = new Set(["PASS", "PARTIAL", "BLOCKED", "FAILED", "SKIPPED"]);
export const defaultStateDir = join(homedir(), "grantdesk-project-runs", "codex-queue");
export const defaultStatusFile = join(homedir(), "grantdeskhq-codex-run-status.txt");
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
export const NO_PROGRESS_WATCHDOG_MS = 20 * 60 * 1000;
export const now = () => new Date().toISOString();
export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
export const writeJson = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2) + "\n"); };
export const routingUsagePath = (stateDir) => join(stateDir, "routing-usage.json");
export const checkpointPath = (stateDir, taskId) => join(stateDir, "checkpoints", taskId + ".json");

function valueOrUnavailable(value) {
  return typeof value === "number" ? String(value) : "unavailable";
}

function cacheHitRatio(telemetry) {
  const input = Number(telemetry?.input_tokens);
  const cached = Number(telemetry?.cached_input_tokens);
  return Number.isFinite(input) && input > 0 && Number.isFinite(cached) ? (cached / input).toFixed(3) : "unavailable";
}

export function writeCheckpoint(stateDir, task, result = {}) {
  writeJson(checkpointPath(stateDir, task.id), {
    task: task.id,
    status: task.status,
    sha: task.commit_sha || null,
    changed_files: Array.isArray(result.artifacts) ? result.artifacts : [],
    validation: Array.isArray(result.tests) ? result.tests : [],
    blocker: task.blocker || "",
    next_action: task.next_action || (task.status === "PASS" ? "Continue to the next explicit queued task." : "Resolve the recorded blocker before requeueing."),
    updated_at: now()
  });
}

export function extractCodexTelemetry(eventFile) {
  // Codex CLI JSON has no stable documented token/credit schema in the local
  // help output. Only record explicit numeric usage fields when they are
  // present; otherwise keep telemetry unavailable rather than estimating.
  if (!existsSync(eventFile)) return {};
  const keys = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_tokens", "credits"];
  const found = {};
  for (const line of readFileSync(eventFile, "utf8").split("\n")) {
    try {
      const record = JSON.parse(line);
      const candidates = [record, record.usage, record.response?.usage, record.item?.usage].filter(Boolean);
      for (const candidate of candidates) for (const key of keys) if (typeof candidate[key] === "number") found[key] = candidate[key];
    } catch { /* stdout/stderr and non-JSON lines are intentionally ignored. */ }
  }
  return found;
}

function mergeTelemetry(usage, telemetry) {
  usage.telemetry ||= {};
  for (const [key, value] of Object.entries(telemetry || {})) if (typeof value === "number") usage.telemetry[key] = value;
  return usage;
}

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

function valueRank(value) { return ({ HIGH: 3, MEDIUM: 2, LOW: 1 })[String(value || "").toUpperCase()] || 0; }
function costRank(value) { return ({ LOW: 1, MEDIUM: 2, HIGH: 3 })[String(value || "").toUpperCase()] || 2; }

export function selectNextTask(queue) {
  validateQueue(queue);
  const byId = new Map(queue.tasks.map((task) => [task.id, task]));
  return queue.tasks.filter((task) => task.status === "QUEUED" && task.dependencies.every((id) => byId.get(id)?.status === "PASS"))
    .sort((a, b) => valueRank(b.business_value) - valueRank(a.business_value)
      || valueRank(b.urgency) - valueRank(a.urgency)
      || costRank(a.estimated_cost_class) - costRank(b.estimated_cost_class)
      || a.priority - b.priority || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0] || null;
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
  const budget = extra.budgetPolicy?.budget || {};
  const runnerStartedAt = extra.runnerStartedAt || "none";
  const elapsedMs = Number(extra.elapsedMs ?? (runnerStartedAt === "none" ? 0 : Math.max(0, Date.now() - Date.parse(runnerStartedAt))));
  const lines = [
    "GRANTDESKHQ CODEX QUEUE STATUS", "", "LAST UPDATED: " + now(), "RUN STARTED: " + runnerStartedAt,
    "ELAPSED: " + Math.floor(elapsedMs / 1000) + " seconds", "TASK STARTED: " + (extra.taskStartedAt || current?.started_at || "none"),
    "HEARTBEAT: " + (extra.heartbeatAt || "none"), "TASKS TOTAL: " + summary.total, "QUEUED: " + summary.count.QUEUED,
    "PASSED: " + summary.count.PASS, "PARTIAL: " + summary.count.PARTIAL, "BLOCKED: " + summary.count.BLOCKED,
    "FAILED: " + summary.count.FAILED, "REMAINING: " + summary.remaining, "", "RUN BUDGET",
    "WORKER INVOCATIONS: " + usage.invocations + " / " + (budget.max_worker_invocations_per_run ?? "unavailable"),
    "TASK ATTEMPTS: " + usage.task_attempts + " / " + (budget.max_total_task_attempts_per_run ?? "unavailable"),
    "TERRA MEDIUM/HIGH: " + ((usage.by_model_reasoning["gpt-5.6-terra/medium"]?.invocations || 0) + (usage.by_model_reasoning["gpt-5.6-terra/high"]?.invocations || 0)) + " / " + (budget.max_terra_medium_high_invocations_per_run ?? "unavailable"),
    "TERRA XHIGH: " + (usage.by_model_reasoning["gpt-5.6-terra/xhigh"]?.invocations || 0) + " / " + (budget.max_terra_xhigh_invocations_per_run ?? "unavailable"),
    "SOL: " + (usage.by_model_reasoning["gpt-5.6-sol/xhigh"]?.invocations || 0) + " / " + (budget.max_sol_invocations_per_run ?? "unavailable"),
    "FULL REGRESSIONS: " + usage.full_regressions + " / " + (budget.max_full_regression_runs ?? "unavailable"),
    "RUNTIME: " + Math.round(usage.runtime_ms / 60000) + " / " + (budget.max_total_runtime_minutes ?? "unavailable") + " minutes", "", "TOKEN / CACHE",
    "INPUT TOKENS: " + valueOrUnavailable(usage.telemetry?.input_tokens), "CACHED INPUT TOKENS: " + valueOrUnavailable(usage.telemetry?.cached_input_tokens),
    "CACHE HIT RATIO: " + cacheHitRatio(usage.telemetry), "OUTPUT TOKENS: " + valueOrUnavailable(usage.telemetry?.output_tokens),
    "CREDITS USED: " + valueOrUnavailable(usage.telemetry?.credits), "", "TASK",
    "CURRENT TASK: " + (extra.currentTask || "none"), "TIER: " + (current?.selected_tier || "none"),
    "MODEL: " + (current?.selected_model || "none"), "REASONING: " + (current?.reasoning_level || "none"),
    "ATTEMPT: " + (current?.attempt_count || 0), "BUSINESS VALUE: " + (current?.business_value || "none"),
    "ESTIMATED COST: " + (current?.estimated_cost_class || "none"), "STATUS: " + (current?.status || "none"),
    "WHY THIS MODEL: " + (current?.why_selected || "none"), "WHY XHIGH: " + (current?.why_xhigh || "N/A"),
    "NEXT TASK: " + (summary.next || "none"), "DEFERRED TASKS: " + (extra.deferredTasks?.join(", ") || "none"),
    "LAST COMPLETED TASK: " + (extra.lastCompleted || "none"), "LAST COMMIT: " + (extra.lastCommit || current?.commit_sha || "none"),
    "LAST CHECKPOINT: " + (extra.checkpoint || "none"), "BUDGET STOP: " + (usage.budget_stop_reason || "none"), "", "HUMAN ACTIONS REQUIRED:"
  ];
  const blockers = queue.tasks.filter((task) => task.status === "BLOCKED").map((task) => task.id + ": " + (task.blocker || "not recorded"));
  lines.push(...(blockers.length ? blockers : ["NONE"]));
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(dirname(statusFile), { recursive: true });
  writeFileSync(statusFile, lines.join("\n") + "\n");
  appendFileSync(join(stateDir, "queue.log"), now() + " status updated\n");
}

export function composePrompt(task, policy, root) {
  // Keep this exact stable prefix first. Task-specific data is intentionally
  // last so sequential Codex invocations can reuse a native prompt prefix.
  const taskContext = {
    id: task.id,
    title: task.title,
    objective: task.description,
    expected_scope: task.expected_scope || task.resource_paths || [],
    acceptance_criteria: task.acceptance_criteria || [],
    artifacts_expected: task.artifacts_expected || [],
    tests_expected: task.tests_expected || [],
    allowed_actions: task.allowed_actions || [],
    forbidden_actions: task.forbidden_actions || [],
    checkpoint: task.checkpoint_summary || "No prior checkpoint."
  };
  return [
    "GRANTDESKHQ BOUNDED WORKER POLICY (stable prefix)",
    policy.trim(),
    "",
    "STABLE EXECUTION CONTRACT",
    "- Complete only the selected explicit task. Do not create bonus work or start another queue task.",
    "- Stay inside EXPECTED_SCOPE unless a recorded SCOPE_EXPANSION is required for correctness.",
    "- Prefer targeted reads and targeted tests. Do not scan the whole repository or replay full transcripts.",
    "- Preserve validated work. Never force-push, expose secrets, send outreach, make purchases, or create live Stripe charges. Change production traffic only when this task explicitly authorizes it and every stated gate has passed.",
    "- Return only JSON matching the supplied schema: status, tests, artifacts, blocker, result_summary, commit_sha.",
    "",
    "TASK-SCOPED CONTEXT (variable suffix)",
    "Repository root: " + root,
    "Model routing: " + task.selected_tier + " | " + task.selected_model + " | " + task.reasoning_level,
    "Why selected: " + task.why_selected,
    JSON.stringify(taskContext, null, 2)
  ].join("\n");
}

export function validateResult(result, task, root) {
  if (!result || !["PASS", "PARTIAL", "BLOCKED", "FAILED"].includes(result.status)) return { status: "FAILED", blocker: "Codex did not return a valid structured result." };
  const missing = task.artifacts_expected.filter((artifact) => !existsSync(resolve(root, artifact)));
  if (result.status === "PASS" && (missing.length || !Array.isArray(result.tests) || result.tests.length === 0 || (result.blocker || "").trim())) return { status: "PARTIAL", blocker: missing.length ? "Missing required artifacts: " + missing.join(", ") : "PASS requires recorded tests and no blocker." };
  return { status: result.status, blocker: result.blocker || "" };
}

export async function invokeCodex({ root, task, policy, schema, stateDir, maxRuntimeMs, heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS, noProgressMs = NO_PROGRESS_WATCHDOG_MS, watchdogTickMs = 1000, spawnChild = spawn, nowFn = Date.now, setIntervalFn = setInterval, clearIntervalFn = clearInterval, onHeartbeat = () => {} }) {
  const runDir = join(stateDir, "runs", task.id, now().replace(/[:.]/g, "-")); mkdirSync(runDir, { recursive: true });
  const finalFile = join(runDir, "final.json"); const eventFile = join(runDir, "events.jsonl"); const prompt = composePrompt(task, policy, root);
  const args = ["exec", "--strict-config", "--sandbox", "workspace-write", "--json", "--output-schema", schema, "--output-last-message", finalFile, "-m", task.selected_model, "-c", "model_reasoning_effort=" + JSON.stringify(task.reasoning_level), "-C", root, prompt];
  return await new Promise((resolvePromise) => {
    const child = spawnChild("codex", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CODEX_QUEUE_NO_PRODUCTION: "1", CODEX_QUEUE_NO_OUTBOUND: "1", CODEX_QUEUE_NO_PURCHASES: "1", CODEX_QUEUE_NO_FORCE_PUSH: "1" } });
    updateLock(stateDir, { activeTask: task.id, childPid: child.pid || null }); writeFileSync(eventFile, "");
    const started = nowFn(); let lastProgressAt = started; let noProgressWatchdog = false;
    const recordProgress = (chunk) => { lastProgressAt = nowFn(); appendFileSync(eventFile, chunk); };
    child.stdout.on("data", recordProgress); child.stderr.on("data", recordProgress);
    const heartbeat = setIntervalFn(() => onHeartbeat({ heartbeatAt: new Date(nowFn()).toISOString(), lastProgressAt: new Date(lastProgressAt).toISOString() }), heartbeatIntervalMs);
    const watchdog = setIntervalFn(() => {
      const elapsed = nowFn() - started;
      if (existsSync(stopPath(stateDir)) || elapsed > maxRuntimeMs) { child.kill("SIGTERM"); return; }
      if (!noProgressWatchdog && nowFn() - lastProgressAt >= noProgressMs) { noProgressWatchdog = true; appendFileSync(eventFile, now() + " no-progress watchdog triggered\n"); child.kill("SIGTERM"); }
    }, watchdogTickMs);
    child.on("close", (code, signal) => { clearIntervalFn(heartbeat); clearIntervalFn(watchdog); let result = null; try { result = readJson(finalFile); } catch { result = null; } resolvePromise({ code: code ?? 1, signal, result, runDir, eventFile, runtimeMs: nowFn() - started, noProgressWatchdog }); });
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

export async function runQueue({ queuePath, policyPath, schemaPath, root, stateDir = defaultStateDir, statusFile = defaultStatusFile, maxRuntimeHours, maxTasks, dryRun = false, morningReportFile = process.env.CODEX_QUEUE_MORNING_REPORT || join(homedir(), "grantdeskhq-overnight-summary.txt"), modelPolicyPath = join(dirname(queuePath), "agent-model-policy.json"), budgetPolicyPath = join(dirname(queuePath), "agent-budget-policy.json"), invokeCodexFn = invokeCodex, supervisor = {}, allowBudgetOverride = false, allowSolOverride = false }) {
  rmSync(stopPath(stateDir), { force: true });
  const queue = validateQueue(readJson(queuePath));
  const policy = readFileSync(policyPath, "utf8");
  const modelPolicy = loadModelPolicy(modelPolicyPath);
  const budgetPolicy = loadBudgetPolicy(budgetPolicyPath);
  const configuredRuntimeMinutes = Number(budgetPolicy.budget.max_total_runtime_minutes);
  const requestedRuntimeMinutes = Number.isFinite(Number(maxRuntimeHours)) ? Number(maxRuntimeHours) * 60 : configuredRuntimeMinutes;
  const effectiveMaxRuntimeMs = (allowBudgetOverride ? requestedRuntimeMinutes : Math.min(requestedRuntimeMinutes, configuredRuntimeMinutes)) * 60_000;
  const configuredWorkerLimit = Number(budgetPolicy.budget.max_worker_invocations_per_run);
  const maxQueueSteps = allowBudgetOverride && Number.isFinite(Number(maxTasks)) ? Number(maxTasks) : Math.min(Number.isFinite(Number(maxTasks)) ? Number(maxTasks) : configuredWorkerLimit, configuredWorkerLimit);
  const usageFile = routingUsagePath(stateDir);
  // A run budget is intentionally fresh per invocation. Historical usage must
  // never silently consume the allowance of the next focused run.
  const routingUsage = createRoutingUsage();
  routingUsage.budget_policy_version = budgetPolicy.version;
  const deferredTasks = [];
  acquireLock(stateDir, queuePath); const started = Date.now(); const runnerStartedAt = new Date(started).toISOString(); let lastCompleted = null; let lastCommit = null;
  const status = (extra) => writeStatus(queue, stateDir, statusFile, { runnerStartedAt, elapsedMs: Date.now() - started, lastCommit, budgetPolicy, deferredTasks, ...extra });
  try {
    for (let processed = 0; processed < maxQueueSteps && Date.now() - started < effectiveMaxRuntimeMs; processed += 1) {
      if (existsSync(stopPath(stateDir))) break; const task = selectNextTask(queue); if (!task) break;
      task.status = "CLASSIFYING"; task.updated_at = now(); writeJson(queuePath, queue); status({ currentTask: task.id, lastCompleted, checkpoint: "task classifying", routingUsage });
      const route = selectRoute(task, modelPolicy, routingUsage);
      if (!route.allowed) { task.status = "BLOCKED"; task.blocker = route.budget_block; task.updated_at = now(); routingUsage.budget_blocks += 1; writeJson(queuePath, queue); writeJson(usageFile, routingUsage); writeCheckpoint(stateDir, task); lastCompleted = task.id; status({ currentTask: "none", lastCompleted, checkpoint: "router blocked task", routingUsage }); continue; }
      applyRoute(task, route, modelPolicy);
      Object.assign(task, economics(task, route));
      task.max_attempts = Math.min(task.max_attempts, 1 + Number(budgetPolicy.retries[route.tier] || 0));
      const budgetDecision = dispatchDecision({ task, route, usage: routingUsage, budgetPolicy, elapsedMs: Date.now() - started, allowBudgetOverride, allowSolOverride });
      if (!budgetDecision.allowed) {
        routingUsage.budget_blocks += 1;
        if (budgetDecision.action === "STOP") { routingUsage.budget_stop_reason = budgetDecision.reason; task.status = "QUEUED"; task.updated_at = now(); writeJson(queuePath, queue); writeJson(usageFile, routingUsage); status({ currentTask: "none", lastCompleted, checkpoint: "hard budget stop", routingUsage }); break; }
        task.status = budgetDecision.action === "BLOCK" ? "BLOCKED" : "PARTIAL";
        task.blocker = budgetDecision.reason; task.validation_status = budgetDecision.action === "BLOCK" ? "BLOCKED" : "DEFERRED"; task.updated_at = now(); task.completed_at = now();
        if (budgetDecision.action === "DEFER") deferredTasks.push(task.id);
        writeJson(queuePath, queue); writeJson(usageFile, routingUsage); writeCheckpoint(stateDir, task); lastCompleted = task.id;
        status({ currentTask: "none", lastCompleted, checkpoint: "hard budget " + budgetDecision.action.toLowerCase(), routingUsage }); continue;
      }
      task.status = "RUNNING"; task.started_at = task.started_at || now(); task.attempt_count += 1; task.updated_at = now(); reserveDispatch(routingUsage, route, task); writeJson(queuePath, queue); writeJson(usageFile, routingUsage); status({ currentTask: task.id, lastCompleted, checkpoint: "task started", routingUsage });
      if (dryRun) { task.status = "PARTIAL"; task.blocker = "DRY_RUN: task classified but Codex was not invoked."; task.completed_at = now(); task.updated_at = now(); task.validation_status = "DRY_RUN"; task.result_summary = "Selected " + task.selected_model + " at " + task.reasoning_level + " reasoning without invoking Codex."; writeJson(queuePath, queue); writeCheckpoint(stateDir, task); lastCompleted = task.id; continue; }
      const remainingMs = Math.max(60_000, effectiveMaxRuntimeMs - (Date.now() - started)); const taskMaxMs = Math.max(60_000, Math.min(Number(task.max_runtime_minutes || 1), Number(budgetPolicy.budget.max_runtime_per_task_minutes)) * 60_000); const execution = await invokeCodexFn({ root, task, policy, schema: schemaPath, stateDir, maxRuntimeMs: Math.min(remainingMs, taskMaxMs), ...supervisor, onHeartbeat: ({ heartbeatAt }) => status({ currentTask: task.id, lastCompleted, checkpoint: "active-task heartbeat", routingUsage, taskStartedAt: task.started_at, heartbeatAt }) });
      recordDispatchRuntime(routingUsage, route, execution.runtimeMs); mergeTelemetry(routingUsage, extractCodexTelemetry(execution.eventFile));
      if (execution.noProgressWatchdog) {
        const watchdogRetries = Number(task.watchdog_retry_count || 0);
        if (watchdogRetries < Number(budgetPolicy.budget.max_consecutive_no_progress_attempts || 2) - 1 && task.attempt_count < task.max_attempts) {
          task.watchdog_retry_count = 1; task.status = "RETRYING"; task.validation_status = "WATCHDOG_RETRY"; task.blocker = "No-progress watchdog reached 20 minutes; running one scoped retry."; task.completed_at = null; task.updated_at = now(); routingUsage.retries += 1; writeJson(queuePath, queue); writeJson(usageFile, routingUsage); status({ currentTask: task.id, lastCompleted, checkpoint: "no-progress watchdog retry", routingUsage }); task.status = "QUEUED"; writeJson(queuePath, queue); updateLock(stateDir, { activeTask: null, childPid: null }); continue;
        }
        task.status = "PARTIAL"; task.validation_status = "WATCHDOG_PARTIAL"; task.blocker = "No-progress watchdog reached 20 minutes after its scoped retry; task remains continuable."; task.completed_at = now(); task.updated_at = now(); task.runtime_ms = execution.runtimeMs; task.result_summary = "Worker made no observable progress before the bounded watchdog stopped it."; task.run_dir = execution.runDir; writeJson(queuePath, queue); writeJson(usageFile, routingUsage); writeCheckpoint(stateDir, task); lastCompleted = task.id; updateLock(stateDir, { activeTask: null, childPid: null }); status({ currentTask: "none", lastCompleted, checkpoint: "no-progress watchdog partial", routingUsage }); continue;
      }
      const verified = validateResult(execution.result, task, root); task.status = "VALIDATING"; task.updated_at = now(); writeJson(queuePath, queue); task.status = verified.status; task.validation_status = verified.status; task.blocker = verified.blocker; task.completed_at = now(); task.updated_at = now(); task.runtime_ms = execution.runtimeMs; task.result_summary = execution.result?.result_summary || "No structured task summary returned."; task.commit_sha = execution.result?.commit_sha || null; lastCommit = task.commit_sha || lastCommit; task.run_dir = execution.runDir;
      if (task.status === "FAILED" && task.attempt_count < task.max_attempts) {
        const rawEvents = existsSync(execution.eventFile) ? readFileSync(execution.eventFile, "utf8") : "";
        const eventDetails = rawEvents.slice(-Number(budgetPolicy.context.max_failure_log_characters || 4000));
        let decision = nextRoutingDecision(task, task.blocker + " " + task.result_summary + " " + eventDetails, modelPolicy);
        if (decision.action === "ESCALATE" && Number(task.escalation_count || 0) >= Number(task.max_escalations || 0)) decision = { action: "RETRY", reason: "Escalation limit reached; retry without raising model cost.", next_step: Number(task.route_step || 0) };
        task.failure_category = decision.failure_category || failureCategory(task.blocker + " " + task.result_summary);
        if (decision.action === "BLOCK") {
          task.status = "BLOCKED"; task.validation_status = "BLOCKED"; task.blocker = decision.reason;
        } else {
          if (decision.action === "ESCALATE") { task.escalation_count = Number(task.escalation_count || 0) + 1; routingUsage.escalations += 1; task.status = "ESCALATING"; if (decision.next_step > 0 && /xhigh/i.test(decision.reason)) task.why_xhigh = decision.reason; } else { routingUsage.retries += 1; task.status = "RETRYING"; }
          task.route_step = decision.next_step; task.fallback_reason = decision.reason; task.blocker = "Retry " + task.attempt_count + " of " + task.max_attempts + ": " + decision.reason; task.completed_at = null; task.updated_at = now();
          writeJson(queuePath, queue); writeJson(usageFile, routingUsage); status({ currentTask: task.id, lastCompleted, checkpoint: task.status.toLowerCase(), routingUsage }); task.status = "QUEUED";
        }
      }
      writeJson(queuePath, queue); writeJson(usageFile, routingUsage); if (terminal.has(task.status)) { writeCheckpoint(stateDir, task, execution.result); lastCompleted = task.id; } updateLock(stateDir, { activeTask: null, childPid: null }); status({ currentTask: "none", lastCompleted, checkpoint: "task checkpointed", routingUsage });
    }
  } finally { updateLock(stateDir, { activeTask: null, childPid: null }); writeJson(usageFile, routingUsage); status({ currentTask: "none", lastCompleted, checkpoint: "runner stopped", routingUsage }); writeMorningReport(queue, stateDir, morningReportFile, Date.now() - started, routingUsage); releaseLock(stateDir); }
  return queue;
}
