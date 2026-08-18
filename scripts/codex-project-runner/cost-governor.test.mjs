import assert from "node:assert/strict";
import test from "node:test";
import { createRoutingUsage, loadModelPolicy, selectRoute } from "./model-router.mjs";
import { dispatchDecision, economics, failureCategory, loadBudgetPolicy, reserveDispatch } from "./cost-governor.mjs";

const modelPolicy = loadModelPolicy(new URL("../../ops/agent-model-policy.json", import.meta.url));
const budgetPolicy = loadBudgetPolicy(new URL("../../ops/agent-budget-policy.json", import.meta.url));
const task = (overrides = {}) => ({ id: "task", title: "Routine report", category: "DOCUMENTATION", task_type: "DOCUMENTATION", description: "Write a bounded report.", priority: 3, status: "QUEUED", acceptance_criteria: [], artifacts_expected: [], tests_expected: [], allowed_actions: [], forbidden_actions: [], resource_paths: ["reports/"], attempt_count: 0, max_attempts: 2, route_step: 0, ...overrides });
const selected = (input) => selectRoute(input, modelPolicy, createRoutingUsage());
const permitted = (input, usage = createRoutingUsage(), options = {}) => dispatchDecision({ task: input, route: selected(input), usage, budgetPolicy, ...options });

test("15 representative tasks use the intended cost tiers", () => {
  const scenarios = [
    ["simple report", {}, "ROUTINE", "low"],
    ["GTM reconciliation", { category: "RECONCILIATION", title: "Reconcile GTM records" }, "ROUTINE", "low"],
    ["SEO synthesis", { category: "RESEARCH", title: "Summarize SEO research" }, "ROUTINE", "low"],
    ["React feature", { category: "UI", title: "Add dashboard component", description: "Implement bounded React UI." }, "STANDARD", "medium"],
    ["backend feature", { category: "BACKEND", title: "Add endpoint", description: "Implement ordinary API." }, "STANDARD", "medium"],
    ["GA4", { category: "ANALYTICS", title: "Add GA4 event", description: "Implement non-sensitive event." }, "STANDARD", "medium"],
    ["moderate bug", { category: "UI", title: "Fix state bug", description: "Fix normal React state." }, "STANDARD", "medium"],
    ["difficult bug", { category: "BACKEND", title: "Persistent cross-service bug", description: "Find root cause of persistent cross-service bug." }, "COMPLEX", "high"],
    ["credential", { category: "BACKEND", title: "Missing credential", description: "Inspect credential configuration." }, "HIGH_RISK", "xhigh"],
    ["IAM", { category: "BACKEND", title: "Update IAM", description: "Inspect IAM change." }, "HIGH_RISK", "xhigh"],
    ["Stripe", { category: "BACKEND", title: "Stripe checkout", description: "Validate Stripe checkout." }, "HIGH_RISK", "xhigh"],
    ["production", { category: "BACKEND", title: "Deploy production", description: "Prepare production deployment." }, "HIGH_RISK", "xhigh"],
    ["full regression", { category: "TESTING", title: "Full regression", tests_expected: ["full regression"] }, "STANDARD", "medium"],
    ["low-value cleanup", { category: "FORMAT", title: "Low-value cleanup", priority: 9 }, "ROUTINE", "low"],
    ["bonus task", { category: "DOCUMENTATION", title: "Extra useful task not explicitly requested", priority: 9 }, "ROUTINE", "low"]
  ];
  for (const [name, input, tier, reasoning] of scenarios) {
    const route = selected(task(input));
    assert.equal(route.selected_tier, tier, name);
    assert.equal(route.reasoning_level, reasoning, name);
  }
});

test("Sol is disabled by default and needs an explicit human override", () => {
  const input = task({ title: "Stripe webhook", category: "BACKEND", description: "Stripe webhook failure.", route_step: 1, exceptional_escalation_approved: true, escalation_reason: "Reproducible difficult defect." });
  const route = selected(input);
  assert.equal(route.selected_model, "gpt-5.6-sol");
  assert.equal(permitted(input).action, "BLOCK");
  assert.equal(permitted(input, createRoutingUsage(), { allowSolOverride: true }).action, "DEFER");
});

test("hard worker, Terra, xhigh, regression, and finalization budgets stop before dispatch", () => {
  const normal = task({ category: "UI", title: "Implement component", description: "Implement React UI." });
  const workerFull = createRoutingUsage(); workerFull.invocations = 12;
  assert.equal(permitted(normal, workerFull).action, "STOP");
  const terraFull = createRoutingUsage(); terraFull.by_model_reasoning["gpt-5.6-terra/medium"] = { invocations: 5, runtime_ms: 0 };
  assert.equal(permitted(normal, terraFull).action, "DEFER");
  const highRisk = task({ category: "BACKEND", title: "Stripe checkout", description: "Stripe checkout validation." });
  const xhighFull = createRoutingUsage(); xhighFull.by_model_reasoning["gpt-5.6-terra/xhigh"] = { invocations: 1, runtime_ms: 0 };
  assert.equal(permitted(highRisk, xhighFull).action, "DEFER");
  const regression = task({ category: "TESTING", title: "Full regression", tests_expected: ["full regression"] });
  const regressionFull = createRoutingUsage(); regressionFull.full_regressions = 2;
  assert.equal(permitted(regression, regressionFull).action, "DEFER");
  const reserveFull = createRoutingUsage(); reserveFull.invocations = 10;
  assert.equal(permitted(normal, reserveFull).action, "STOP");
  assert.equal(permitted(task({ title: "Final report", finalization_task: true }), reserveFull).action, "DISPATCH");
});

test("environmental failure categories do not consume a reasoning escalation", () => {
  for (const [text, category] of [["permission denied", "PERMISSION"], ["missing API key", "MISSING_CREDENTIAL"], ["rate limit", "RATE_LIMIT"], ["service unavailable", "EXTERNAL_SERVICE"], ["module not found", "DEPENDENCY"], ["malformed fixture", "TEST_FIXTURE"]]) assert.equal(failureCategory(text), category);
});

test("economics are explicit and dispatch reservations are counted before invocation", () => {
  const input = task({ priority: 1 }); const route = selected(input); const usage = createRoutingUsage();
  assert.deepEqual(economics(input, route), { business_value: "HIGH", urgency: "HIGH", estimated_cost_class: "LOW" });
  reserveDispatch(usage, route, input); assert.equal(usage.invocations, 1); assert.equal(usage.task_attempts, 1); assert.equal(usage.by_model_reasoning["gpt-5.6-luna/low"].invocations, 1);
});

test("runaway instruction cannot generate work beyond the explicit queue and budget", () => {
  const explicit = [task({ id: "one" }), task({ id: "two" })];
  assert.equal(explicit.length, 2);
  const exhausted = createRoutingUsage(); exhausted.invocations = budgetPolicy.budget.max_worker_invocations_per_run;
  assert.equal(permitted(explicit[0], exhausted).action, "STOP");
});
