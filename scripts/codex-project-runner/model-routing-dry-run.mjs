#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRoutingUsage, loadModelPolicy, selectRoute } from "./model-router.mjs";

const root = resolve(process.cwd());
const policy = loadModelPolicy(resolve(root, "ops/agent-model-policy.json"));
const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? resolve(process.argv[outputIndex + 1]) : null;
const task = (id, title, category, description) => ({ id, title, category, task_type: category, description, risk_level: "LOW", allowed_actions: [], forbidden_actions: [], acceptance_criteria: [], artifacts_expected: [], tests_expected: [], resource_paths: [], commands: [], attempt_count: 0, route_step: 0 });
const tasks = [
  task("dry-01", "Generate acquisition sprint TXT summary", "DOCUMENTATION", "Summarize existing artifacts."),
  task("dry-02", "Reconcile Control Plane queue", "RECONCILIATION", "Deduplicate existing GTM records."),
  task("dry-03", "Summarize SEO competitors", "RESEARCH", "Process public web research notes."),
  task("dry-04", "Write resource metadata", "SEO", "Prepare deterministic titles and descriptions."),
  task("dry-05", "Format partner review", "REPORTING", "Format a human-review report from approved data."),
  task("dry-06", "Normalize direct prospect data", "DATA_PROCESSING", "Normalize existing queue rows with no enrichment."),
  task("dry-07", "Create status report", "FORMAT", "Create a concise status report."),
  task("dry-08", "Prepare buyer-language summary", "GTM", "Aggregate existing public-signal themes."),
  task("dry-09", "Organize source citations", "RESEARCH", "Organize existing public source URLs."),
  task("dry-10", "Write content outline", "SEO", "Produce an outline using the existing page framework."),
  task("dry-11", "Add GA4 event tracking", "ANALYTICS", "Implement non-sensitive conversion events."),
  task("dry-12", "Build GTM KPI cards", "UI", "Implement React dashboard KPI components."),
  task("dry-13", "Implement queue API", "BACKEND", "Implement normal repository business logic."),
  task("dry-14", "Add Resources component", "FRONTEND", "Implement an ordinary public component."),
  task("dry-15", "Update GTM integration tests", "TESTING", "Add deterministic integration tests."),
  task("dry-16", "Fix ordinary UI bug", "UI", "Fix a normal React interaction bug."),
  task("dry-17", "Refactor route helper", "REPO_CODING", "Perform a bounded moderate refactor."),
  task("dry-18", "Debug persistent cross-service failure", "BACKEND", "Investigate persistent cross-service data consistency failure."),
  task("dry-19", "Debug authentication failure", "BACKEND", "Investigate persistent cross-service authentication failure in local tests."),
  task("dry-20", "Debug concurrency defect", "BACKEND", "Investigate difficult debugging involving concurrency."),
  task("dry-21", "Validate Stripe checkout", "BACKEND", "Inspect Stripe checkout subscription configuration."),
  task("dry-22", "Review IAM permission", "BACKEND", "Inspect least privilege IAM configuration."),
  task("dry-23", "Inspect Secret Manager mapping", "BACKEND", "Inspect Secret Manager secret mapping."),
  task("dry-24", "Prepare Cloud Run traffic change", "BACKEND", "Review Cloud Run traffic transition."),
  task("dry-25", "Audit production security", "BACKEND", "Review production authentication and security configuration.")
];
const usage = createRoutingUsage();
const rows = tasks.map((item) => { const selected = selectRoute(item, policy, usage); return { task: item.title, tier: selected.selected_tier, model: selected.selected_model, reasoning: selected.reasoning_level, risk: selected.risk_level, why: selected.why_selected, potential_escalation: selected.potential_escalation }; });
const routineXhigh = rows.filter((row) => row.tier === "ROUTINE" && row.reasoning === "xhigh").length;
const standardXhigh = rows.filter((row) => row.tier === "STANDARD" && row.reasoning === "xhigh").length;
const sol = rows.filter((row) => row.model === "gpt-5.6-sol").length;
const pass = routineXhigh === 0 && standardXhigh === 0 && sol === 0 && rows.length >= 20;
const report = { dry_run: pass ? "PASS" : "FAIL", number_of_tasks: rows.length, routine_tasks_using_xhigh: routineXhigh, standard_tasks_using_xhigh: standardXhigh, sol_tasks: sol, rows };
const lines = ["GRANTDESKHQ MODEL ROUTING DRY RUN", "", "DRY RUN: " + report.dry_run, "NUMBER OF DRY-RUN TASKS: " + report.number_of_tasks, "ROUTINE TASKS USING XHIGH: " + routineXhigh, "STANDARD TASKS USING XHIGH: " + standardXhigh, "SOL TASKS: " + sol, ""];
for (const row of rows) lines.push("TASK: " + row.task, "TIER: " + row.tier, "MODEL: " + row.model, "REASONING: " + row.reasoning, "RISK: " + row.risk, "WHY: " + row.why, "POTENTIAL ESCALATION: " + row.potential_escalation, "");
if (output) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, lines.join("\n") + "\n"); }
console.log(lines.join("\n"));
if (!pass) process.exitCode = 1;
