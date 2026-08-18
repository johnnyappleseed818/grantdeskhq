import { readFileSync } from "node:fs";

export function loadBudgetPolicy(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function failureCategory(value) {
  const text = String(value || "").toLowerCase();
  if (/permission|iam|access denied|forbidden/.test(text)) return "PERMISSION";
  if (/credential|secret|api key|oauth|authentication required/.test(text)) return "MISSING_CREDENTIAL";
  if (/rate limit|quota|too many requests/.test(text)) return "RATE_LIMIT";
  if (/unavailable|timeout|network|external service|dns/.test(text)) return "EXTERNAL_SERVICE";
  if (/missing dependency|module not found|package not found/.test(text)) return "DEPENDENCY";
  if (/fixture|mock|test data/.test(text)) return "TEST_FIXTURE";
  if (/environment|configuration|config/.test(text)) return "ENVIRONMENT";
  if (/reasoning|logic|algorithm|implementation|root cause|state bug/.test(text)) return "CODE_REASONING";
  return "UNKNOWN";
}

export function isFullRegressionTask(task) {
  return task.validation_level === "FULL_REGRESSION" || task.full_regression === true || (task.tests_expected || []).some((value) => /grantdesk-regression|full regression|full suite/i.test(String(value)));
}

function modelCount(usage, model, reasoning) {
  return usage.by_model_reasoning?.[`${model}/${reasoning}`]?.invocations || 0;
}

function terraMediumHighCount(usage) {
  return ["medium", "high"].reduce((total, reasoning) => total + modelCount(usage, "gpt-5.6-terra", reasoning), 0);
}

export function isFinalizationTask(task) {
  return task.finalization_task === true || /\b(finalize|finalization|checkpoint|commit|push|final report)\b/i.test(`${task.id || ""} ${task.title || ""} ${task.category || ""}`);
}

export function validXhighReason(task) {
  const reason = String(task.why_xhigh || "").trim();
  if (!reason) return false;
  return !/(permission|credential|secret|rate limit|unavailable|dependency|fixture|environment|configuration)/i.test(reason);
}

export function dispatchDecision({ task, route, usage, budgetPolicy, elapsedMs = 0, allowBudgetOverride = false, allowSolOverride = false }) {
  const budget = budgetPolicy.budget;
  const limit = (name) => allowBudgetOverride ? Number.POSITIVE_INFINITY : Number(budget[name]);
  if (elapsedMs >= limit("max_total_runtime_minutes") * 60_000) return { allowed: false, action: "STOP", reason: "MAX_TOTAL_RUNTIME_MINUTES reached." };
  if (usage.invocations >= limit("max_worker_invocations_per_run")) return { allowed: false, action: "STOP", reason: "MAX_WORKER_INVOCATIONS_PER_RUN reached." };
  if (usage.task_attempts >= limit("max_total_task_attempts_per_run")) return { allowed: false, action: "STOP", reason: "MAX_TOTAL_TASK_ATTEMPTS_PER_RUN reached." };
  if (!isFinalizationTask(task) && usage.invocations >= Math.max(0, limit("max_worker_invocations_per_run") - Number(budget.finalization_reserve_invocations || 0))) return { allowed: false, action: "STOP", reason: "FINALIZATION_RESERVE reached; remaining worker capacity is reserved for checkpoint, validation, commit, push, and report tasks." };
  if (isFullRegressionTask(task) && usage.full_regressions >= limit("max_full_regression_runs")) return { allowed: false, action: "DEFER", reason: "MAX_FULL_REGRESSION_RUNS reached." };
  if (route.selected_model === "gpt-5.6-sol" && !allowSolOverride) return { allowed: false, action: "BLOCK", reason: "Sol is disabled by default. Explicit human override CODEX_QUEUE_ALLOW_SOL=1 is required." };
  if (route.selected_model === "gpt-5.6-sol" && modelCount(usage, "gpt-5.6-sol", "xhigh") >= limit("max_sol_invocations_per_run")) return { allowed: false, action: "DEFER", reason: "MAX_SOL_INVOCATIONS_PER_RUN reached." };
  if (route.selected_model === "gpt-5.6-terra" && ["medium", "high"].includes(route.reasoning_level) && terraMediumHighCount(usage) >= limit("max_terra_medium_high_invocations_per_run")) return { allowed: false, action: "DEFER", reason: "MAX_TERRA_MEDIUM_HIGH_INVOCATIONS_PER_RUN reached." };
  if (route.selected_model === "gpt-5.6-terra" && route.reasoning_level === "xhigh") {
    if (route.selected_tier !== "HIGH_RISK" && !validXhighReason(task)) return { allowed: false, action: "BLOCK", reason: "Terra xhigh requires a recorded WHY_XHIGH grounded in reasoning or coding difficulty." };
    if (modelCount(usage, "gpt-5.6-terra", "xhigh") >= limit("max_terra_xhigh_invocations_per_run")) return { allowed: false, action: "DEFER", reason: "MAX_TERRA_XHIGH_INVOCATIONS_PER_RUN reached." };
  }
  return { allowed: true, action: "DISPATCH", reason: "Within hard run budget." };
}

export function reserveDispatch(usage, route, task) {
  usage.task_attempts = Number(usage.task_attempts || 0) + 1;
  if (isFullRegressionTask(task)) usage.full_regressions = Number(usage.full_regressions || 0) + 1;
  const key = `${route.selected_model}/${route.reasoning_level}`;
  const entry = usage.by_model_reasoning[key] || { invocations: 0, runtime_ms: 0 };
  entry.invocations += 1;
  usage.by_model_reasoning[key] = entry;
  usage.invocations = Number(usage.invocations || 0) + 1;
  return usage;
}

export function recordDispatchRuntime(usage, route, runtimeMs = 0) {
  const amount = Math.max(0, Number(runtimeMs) || 0);
  const key = `${route.selected_model}/${route.reasoning_level}`;
  const entry = usage.by_model_reasoning[key] || { invocations: 0, runtime_ms: 0 };
  entry.runtime_ms = Number(entry.runtime_ms || 0) + amount;
  usage.by_model_reasoning[key] = entry;
  usage.runtime_ms = Number(usage.runtime_ms || 0) + amount;
  return usage;
}

export function economics(task, route) {
  const businessValue = String(task.business_value || (Number(task.priority) <= 2 ? "HIGH" : "MEDIUM")).toUpperCase();
  const urgency = String(task.urgency || (Number(task.priority) <= 2 ? "HIGH" : "MEDIUM")).toUpperCase();
  const estimatedCost = String(task.estimated_cost_class || (route.reasoning_level === "xhigh" || route.selected_tier === "HIGH_RISK" ? "HIGH" : route.selected_tier === "ROUTINE" ? "LOW" : "MEDIUM")).toUpperCase();
  return { business_value: businessValue, urgency, estimated_cost_class: estimatedCost };
}
