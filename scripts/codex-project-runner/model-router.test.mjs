import assert from "node:assert/strict";
import test from "node:test";
import { createRoutingUsage, loadModelPolicy, nextRoutingDecision, recordInvocation, selectRoute } from "./model-router.mjs";

const policy = loadModelPolicy(new URL("../../ops/agent-model-policy.json", import.meta.url));
const base = (overrides = {}) => ({ id: "task", title: "Routine task", category: "DOCUMENTATION", task_type: "DOCUMENTATION", description: "Write a bounded internal note.", risk_level: "LOW", allowed_actions: [], forbidden_actions: [], acceptance_criteria: [], artifacts_expected: [], tests_expected: [], resource_paths: [], commands: [], attempt_count: 0, route_step: 0, ...overrides });
const route = (overrides = {}, usage = createRoutingUsage()) => selectRoute(base(overrides), policy, usage);

const scenarios = [
  ["routine documentation", { title: "Document queue status", category: "DOCUMENTATION" }, "gpt-5.6-luna", "low", "ROUTINE"],
  ["GTM queue reconciliation", { title: "Reconcile Control Plane queue", category: "RECONCILIATION" }, "gpt-5.6-luna", "low", "ROUTINE"],
  ["SEO research", { title: "Summarize public SEO research", category: "RESEARCH" }, "gpt-5.6-luna", "low", "ROUTINE"],
  ["standard repo coding", { title: "Implement normal repository feature", category: "REPO_CODING", description: "Implement a bounded application workflow." }, "gpt-5.6-terra", "medium", "STANDARD"],
  ["GA implementation", { title: "Add GA4 event tracking", category: "ANALYTICS", description: "Implement non-sensitive analytics event tracking." }, "gpt-5.6-terra", "medium", "STANDARD"],
  ["normal UI feature", { title: "Build GTM KPI cards", category: "UI", description: "Implement React dashboard components." }, "gpt-5.6-terra", "medium", "STANDARD"],
  ["normal backend feature", { title: "Implement normal API endpoint", category: "BACKEND", description: "Implement ordinary backend business logic." }, "gpt-5.6-terra", "medium", "STANDARD"],
  ["moderately difficult bug", { title: "Fix React state bug", category: "UI", description: "Fix a moderate client state bug." }, "gpt-5.6-terra", "medium", "STANDARD"],
  ["persistent complex bug", { title: "Investigate persistent cross-service state failure", category: "BACKEND", description: "Find the root cause of a persistent cross-service issue." }, "gpt-5.6-terra", "high", "COMPLEX"],
  ["authentication debugging", { title: "Debug persistent cross-service authentication failure", category: "BACKEND", description: "Find the root cause in a local test environment." }, "gpt-5.6-terra", "high", "COMPLEX"],
  ["Stripe", { title: "Validate Stripe checkout configuration", category: "BACKEND", description: "Inspect live Stripe checkout configuration." }, "gpt-5.6-terra", "xhigh", "HIGH_RISK"],
  ["IAM", { title: "Inspect IAM access", category: "BACKEND", description: "Review least privilege IAM permission." }, "gpt-5.6-terra", "xhigh", "HIGH_RISK"],
  ["Secret Manager", { title: "Review Secret Manager mapping", category: "BACKEND", description: "Inspect secret manager configuration." }, "gpt-5.6-terra", "xhigh", "HIGH_RISK"],
  ["production deployment", { title: "Prepare production deployment", category: "BACKEND", description: "Review production deployment safety." }, "gpt-5.6-terra", "xhigh", "HIGH_RISK"],
  ["Cloud Run traffic", { title: "Inspect Cloud Run traffic", category: "BACKEND", description: "Review cloud run traffic split." }, "gpt-5.6-terra", "xhigh", "HIGH_RISK"],
  ["security", { title: "Review security configuration", category: "BACKEND", description: "Audit production security configuration." }, "gpt-5.6-terra", "xhigh", "HIGH_RISK"],
  ["ambiguous bounded task", { title: "Update an internal status note", category: "", task_type: "", description: "Use a small task-scoped prompt." }, "gpt-5.6-luna", "low", "ROUTINE"]
];

for (const [name, input, model, reasoning, tier] of scenarios) test(name + " routes deterministically", () => {
  const selected = route(input); assert.equal(selected.selected_model, model); assert.equal(selected.reasoning_level, reasoning); assert.equal(selected.selected_tier, tier); assert.equal(selected.allowed, true);
});

test("routine escalation remains inexpensive before Terra", () => {
  assert.equal(route({ route_step: 1 }).selected_model, "gpt-5.6-luna"); assert.equal(route({ route_step: 1 }).reasoning_level, "medium"); assert.equal(route({ route_step: 2 }).selected_model, "gpt-5.6-terra"); assert.equal(route({ route_step: 2 }).reasoning_level, "medium");
});

test("standard and complex escalation paths are bounded", () => {
  const standard = base({ category: "BACKEND", task_type: "BACKEND", description: "Implement normal API.", attempt_count: 2 }); const complex = base({ category: "BACKEND", task_type: "BACKEND", description: "Persistent cross-service data consistency failure.", attempt_count: 2 });
  assert.deepEqual(nextRoutingDecision(standard, "actual coding failure", policy), { action: "ESCALATE", reason: "Two standard capability failures: raise Terra to high.", next_step: 1 }); assert.equal(route({ ...complex, route_step: 1 }).reasoning_level, "xhigh");
});

test("environment, permissions, dependencies, and fixtures never trigger model escalation", () => {
  const task = base({ category: "BACKEND", task_type: "BACKEND", description: "Implement normal API.", attempt_count: 2 });
  for (const failure of ["IAM permission denied", "missing dependency", "malformed fixture", "rate limit", "service unavailable", "configuration missing"]) assert.equal(nextRoutingDecision(task, failure, policy).action, "RETRY");
});

test("negated billing and checkout constraints remain standard repository work", () => {
  const selected = route({ title: "Build contact feedback form", category: "FRONTEND", description: "Implement a public contact form. Do not change billing, checkout, or any paid-plan flow." });
  assert.equal(selected.selected_tier, "STANDARD");
  assert.equal(selected.reasoning_level, "medium");
});

test("forbidden safety constraints do not inflate a routine task to high risk", () => {
  const selected = route({ title: "Reconcile outreach ledger", category: "RECONCILIATION", forbidden_actions: ["production traffic", "live Stripe charges", "outbound"] });
  assert.equal(selected.selected_tier, "ROUTINE");
  assert.equal(selected.selected_model, "gpt-5.6-luna");
});

test("Sol is an explicit exceptional high-risk escalation only", () => {
  const normal = route({ title: "Stripe webhook", description: "Stripe webhook handling." }); assert.equal(normal.selected_model, "gpt-5.6-terra");
  const exceptional = route({ title: "Stripe webhook", description: "Stripe webhook handling.", route_step: 1, exceptional_escalation_approved: true, escalation_reason: "Terra xhigh failed with reproducible high-risk defect." }); assert.equal(exceptional.selected_model, "gpt-5.6-sol"); assert.equal(exceptional.reasoning_level, "xhigh");
});

test("budget guards block expensive routes while telemetry remains truthful", () => {
  const usage = createRoutingUsage(); usage.by_model_reasoning["gpt-5.6-terra/xhigh"] = { invocations: 4, runtime_ms: 1 };
  const selected = route({ title: "Stripe checkout", description: "Stripe checkout validation." }, usage); assert.equal(selected.allowed, false); assert.match(selected.budget_block, /Terra xhigh/);
  const clean = createRoutingUsage(); recordInvocation(clean, route({ title: "Write report", category: "REPORTING" }), 42); assert.equal(clean.invocations, 1); assert.equal(clean.runtime_ms, 42); assert.equal(clean.by_model_reasoning["gpt-5.6-luna/low"].invocations, 1);
});
