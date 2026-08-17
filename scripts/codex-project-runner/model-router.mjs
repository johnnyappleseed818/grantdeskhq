import { readFileSync } from "node:fs";

export const TIER_LABELS = { routine: "ROUTINE", standard: "STANDARD", complex: "COMPLEX", high_risk: "HIGH_RISK" };

export function loadModelPolicy(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function createRoutingUsage() {
  return { started_at: new Date().toISOString(), invocations: 0, runtime_ms: 0, retries: 0, escalations: 0, by_model_reasoning: {}, budget_blocks: 0 };
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

function taskContext(task) {
  // Safety constraints such as \"no production traffic\" describe what a task must not do; they are not evidence that the task itself changes production.
  // Excluding them keeps routine tasks from being routed as high risk solely because the operating policy is strict.
  return [task.id, task.title, task.description, task.category, task.task_type, task.risk_level, ...(task.allowed_actions || []), ...(task.acceptance_criteria || []), ...(task.artifacts_expected || []), ...(task.tests_expected || []), ...(task.resource_paths || []), ...(task.commands || [])].filter(Boolean).join(" ").toLowerCase();
}

function includesAny(text, values) {
  return values.filter((value) => { const needle = value.toLowerCase(); return needle === "prod" || needle === "iam" ? new RegExp("\\b" + needle + "\\b", "i").test(text) : text.includes(needle); });
}

function isNegatedSignal(text, signal) {
  const needle = signal.toLowerCase(); let position = -1; let found = false;
  while ((position = text.indexOf(needle, position + 1)) >= 0) {
    found = true;
    const sentenceStart = Math.max(text.lastIndexOf(".", position), text.lastIndexOf("!", position), text.lastIndexOf("?", position), text.lastIndexOf(";", position)) + 1;
    const clause = text.slice(sentenceStart, position);
    if (!/\b(do not|don.t|never|no|without|forbidden|forbid)\b/i.test(clause)) return false;
  }
  return found;
}

function categoryMatches(category, values) {
  const value = normalize(category);
  if (!value) return false;
  return values.some((item) => value === normalize(item) || value.includes(normalize(item)) || normalize(item).includes(value));
}

function isPublicCopyOrUiWork(task, context) {
  const category = normalize(task.category || task.task_type);
  const publicAudience = /\b(public|customer-facing|website|landing page|help ?center|marketing)\b/.test(context);
  const copyDeliverable = /\b(copy|copywriting|wording|text|content|messaging|ui|user interface|component|page)\b/.test(context);
  return publicAudience && copyDeliverable && /\b(ui|frontend|documentation|content|marketing|seo|gtm)\b/.test(category);
}

function hasProtectedOperation(context) {
  // Public copy can accurately mention billing or retained transactions. Treat
  // those words as high risk only when the task also operates on the protected
  // system, rather than merely describing it.
  const protectedResource = "stripe|billing|checkout|payment|subscription|webhook|secret manager|iam|service account|oauth|credential|customer data|database|cloud run traffic|production|prod";
  const operation = "configure|reconfigur|inspect|audit|migrat|deploy|delete|drop|access|export|query|rotate|validate|traffic";
  const patterns = [
    new RegExp("\\b(?:" + operation + ")\\w*\\b[^.!?;]{0,100}\\b(?:" + protectedResource + ")\\b|\\b(?:" + protectedResource + ")\\b[^.!?;]{0,100}\\b(?:" + operation + ")\\w*\\b", "gi"),
    /\b(?:change|modify)\b[^.!?;]{0,100}\b(?:customer data|database|cloud run traffic)\b|\b(?:customer data|database|cloud run traffic)\b[^.!?;]{0,100}\b(?:change|modify)\b/gi
  ];
  return patterns.flatMap((pattern) => [...context.matchAll(pattern)]).some((match) => {
    const sentenceStart = Math.max(context.lastIndexOf(".", match.index), context.lastIndexOf("!", match.index), context.lastIndexOf("?", match.index), context.lastIndexOf(";", match.index)) + 1;
    return !/\b(do not|don.t|never|no|without|forbidden|forbid)\b/i.test(context.slice(sentenceStart, match.index));
  });
}

export function classifyTask(task, policy) {
  const context = taskContext(task);
  const detectedHighSignals = includesAny(context, policy.classification.high_risk_indicators).filter((signal) => !isNegatedSignal(context, signal));
  const highSignals = isPublicCopyOrUiWork(task, context) && !hasProtectedOperation(context) ? [] : detectedHighSignals;
  const complexSignals = includesAny(context, policy.classification.complex_indicators);
  const explicitRisk = normalize(task.risk_level);
  const protectedAction = (task.allowed_actions || []).some((item) => /production|stripe|iam|secret|credential|customer data|database/i.test(item));
  const authenticationOnlyDebugging = highSignals.length === 1 && highSignals[0] === "authentication" && /debug|failure|persistent|cross-service/i.test(context) && !/production|security|oauth|credential/i.test(context);
  if (explicitRisk === "high" || explicitRisk === "high_risk" || task.high_risk === true || (highSignals.length && !authenticationOnlyDebugging) || protectedAction) {
    return { key: "high_risk", risk_level: "HIGH", why: "High-risk context: " + (highSignals.length ? highSignals.join(", ") : explicitRisk || "protected action") };
  }
  if (explicitRisk === "complex" || explicitRisk === "high" || task.capability_difficulty === true || complexSignals.length) {
    return { key: "complex", risk_level: "COMPLEX", why: "Complex debugging context: " + (complexSignals.length ? complexSignals.join(", ") : explicitRisk || "explicit capability difficulty") };
  }
  if (categoryMatches(task.category || task.task_type, policy.classification.routine_categories) && !/implement|refactor|component|api|backend|frontend|database|analytics/i.test(context)) {
    return { key: "routine", risk_level: "LOW", why: "Routine category with no production, payment, security, or implementation indicators." };
  }
  if (categoryMatches(task.category || task.task_type, policy.classification.standard_categories) || /implement|component|api|backend|frontend|analytics|refactor|bug fix|test/i.test(context)) {
    return { key: "standard", risk_level: "MODERATE", why: "Normal repository implementation or test work with no high-risk indicators." };
  }
  return { key: "routine", risk_level: "LOW", why: "Bounded non-production task with no implementation or high-risk indicators." };
}

function routeForStep(classification, task, policy) {
  const step = Number(task.route_step || 0);
  if (classification.key === "routine") {
    if (step === 0) return { tier: "routine", model: policy.tiers.routine.model, reasoning: "low", route_step: 0, potential_escalation: "Luna medium, then Terra medium only after a genuine capability failure." };
    if (step === 1) return { tier: "routine", model: policy.tiers.routine.model, reasoning: "medium", route_step: 1, potential_escalation: "Terra medium only after the second genuine capability failure." };
    return { tier: "standard", model: policy.tiers.standard.model, reasoning: "medium", route_step: 2, potential_escalation: "Terra high only after standard-work evidence warrants it." };
  }
  if (classification.key === "standard") {
    if (step === 0) return { tier: "standard", model: policy.tiers.standard.model, reasoning: "medium", route_step: 0, potential_escalation: "Terra high only after two capability failures." };
    return { tier: "standard", model: policy.tiers.standard.model, reasoning: "high", route_step: 1, potential_escalation: "Classify as complex before any xhigh escalation." };
  }
  if (classification.key === "complex") {
    if (step === 0) return { tier: "complex", model: policy.tiers.complex.model, reasoning: "high", route_step: 0, potential_escalation: "One Terra xhigh attempt after two genuine high-effort failures." };
    return { tier: "complex", model: policy.tiers.complex.model, reasoning: "xhigh", route_step: 1, potential_escalation: "No automatic Sol escalation." };
  }
  if (step > 0 && task.exceptional_escalation_approved === true && String(task.escalation_reason || "").trim()) {
    return { tier: "high_risk", model: policy.tiers.high_risk.exceptional_model, reasoning: "xhigh", route_step: 1, potential_escalation: "Sol is the configured exceptional terminal escalation." };
  }
  return { tier: "high_risk", model: policy.tiers.high_risk.model, reasoning: "xhigh", route_step: 0, potential_escalation: "Sol requires exceptional_escalation_approved plus a recorded escalation_reason." };
}

function budgetBlock(route, policy, usage) {
  const key = route.model + "/" + route.reasoning;
  const modelCount = usage.by_model_reasoning[key]?.invocations || 0;
  const expensive = route.reasoning === "xhigh" || route.model === policy.models.exceptional;
  const expensiveCount = Object.entries(usage.by_model_reasoning).reduce((total, [name, item]) => total + ((name.endsWith("/xhigh") || name.startsWith(policy.models.exceptional + "/")) ? item.invocations : 0), 0);
  if (route.model === policy.models.exceptional && modelCount >= policy.budgets.max_sol_invocations_per_run) return "Sol invocation budget exhausted for this run.";
  if (route.model === policy.models.standard && route.reasoning === "xhigh" && modelCount >= policy.budgets.max_terra_xhigh_invocations_per_run) return "Terra xhigh invocation budget exhausted for this run.";
  if (expensive && expensiveCount >= policy.budgets.max_expensive_tasks_per_run) return "Expensive-task invocation budget exhausted for this run.";
  return "";
}

export function selectRoute(task, policy, usage = createRoutingUsage()) {
  const classification = classifyTask(task, policy);
  const route = routeForStep(classification, task, policy);
  const block = budgetBlock(route, policy, usage);
  return { ...route, task_type: task.task_type || task.category || "UNCLASSIFIED", risk_level: classification.risk_level, selected_tier: TIER_LABELS[route.tier], selected_model: route.model, reasoning_level: route.reasoning, why_selected: classification.why, allowed: !block, budget_block: block, base_tier: TIER_LABELS[classification.key] };
}

export function recordInvocation(usage, route, runtimeMs = 0) {
  const key = route.selected_model + "/" + route.reasoning_level;
  const entry = usage.by_model_reasoning[key] || { invocations: 0, runtime_ms: 0 };
  entry.invocations += 1;
  entry.runtime_ms += Math.max(0, Number(runtimeMs) || 0);
  usage.by_model_reasoning[key] = entry;
  usage.invocations += 1;
  usage.runtime_ms += Math.max(0, Number(runtimeMs) || 0);
  return usage;
}

export function nextRoutingDecision(task, failure, policy) {
  const classification = classifyTask(task, policy);
  const text = normalize(failure);
  const environmental = includesAny(text, policy.escalation.never_for_failure_categories);
  if (environmental.length) return { action: "RETRY", reason: "No model escalation: environmental or configuration failure (" + environmental.join(", ") + ").", next_step: Number(task.route_step || 0) };
  const step = Number(task.route_step || 0);
  if (classification.key === "routine") {
    if (step < 2) return { action: "ESCALATE", reason: step === 0 ? "First genuine capability failure: raise Luna to medium." : "Second genuine capability failure: evaluate with Terra medium.", next_step: step + 1 };
    return { action: "RETRY", reason: "Routine task has reached the standard evaluation step; no xhigh route is allowed.", next_step: step };
  }
  if (classification.key === "standard") {
    if (step === 0 && Number(task.attempt_count || 0) >= 2) return { action: "ESCALATE", reason: "Two standard capability failures: raise Terra to high.", next_step: 1 };
    return { action: "RETRY", reason: "Keep Terra medium while evidence is still insufficient for an escalation.", next_step: step };
  }
  if (classification.key === "complex") {
    if (step === 0 && Number(task.attempt_count || 0) >= 2) return { action: "ESCALATE", reason: "Two complex high-effort failures: one Terra xhigh escalation is justified.", next_step: 1 };
    return { action: "RETRY", reason: "Keep Terra high until two genuine capability failures are observed.", next_step: step };
  }
  if (task.exceptional_escalation_approved === true && String(task.escalation_reason || "").trim() && step === 0) return { action: "ESCALATE", reason: "Explicit exceptional high-risk escalation approved with a recorded reason.", next_step: 1 };
  return { action: "RETRY", reason: "High-risk work remains Terra xhigh. Sol requires explicit task approval and escalation reason.", next_step: step };
}

export function applyRoute(task, route, policy) {
  const tierConfig = policy.tiers[route.tier];
  task.task_type = route.task_type;
  task.risk_level = route.risk_level;
  task.selected_tier = route.selected_tier;
  task.selected_model = route.selected_model;
  task.reasoning_level = route.reasoning_level;
  task.why_selected = route.why_selected;
  task.route_step = route.route_step;
  task.max_attempts = Math.max(Number(task.max_attempts || 0), Number(tierConfig.max_attempts || 1));
  task.max_escalations = Number(tierConfig.max_escalations || 0);
  task.max_runtime_minutes = Number(tierConfig.max_runtime_minutes || 0);
  return task;
}

export function routingSummary(usage) {
  return { invocations: usage.invocations, runtime_ms: usage.runtime_ms, retries: usage.retries, escalations: usage.escalations, by_model_reasoning: usage.by_model_reasoning, budget_blocks: usage.budget_blocks };
}
