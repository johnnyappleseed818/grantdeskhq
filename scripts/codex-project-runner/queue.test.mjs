import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acquireLock, composePrompt, invokeCodex, lockIsStale, queueSummary, runQueue, selectNextTask, validateQueue, validateResult, writeJson } from "./queue-lib.mjs";

const stamp = "2026-08-17T00:00:00.000Z";
const task = (id, priority, status = "QUEUED", dependencies = []) => ({ id, title: id, category: "QA", priority, status, created_at: stamp, updated_at: stamp, description: "test", acceptance_criteria: ["done"], dependencies, blocked_by: [], attempt_count: 0, max_attempts: 2, estimated_scope: "small", allowed_actions: [], forbidden_actions: [], artifacts_expected: [], tests_expected: [], branch: null, commit_sha: null, started_at: null, completed_at: null, blocker: "", result_summary: "" });
function fixture() { const dir = mkdtempSync(join(tmpdir(), "grantdesk-queue-")); const queuePath = join(dir, "queue.json"); const policyPath = join(dir, "policy.md"); const schemaPath = join(dir, "schema.json"); const modelPolicyPath = join(dir, "agent-model-policy.json"); const budgetPolicyPath = join(dir, "agent-budget-policy.json"); writeFileSync(policyPath, "No production. No outbound."); writeFileSync(schemaPath, "{}"); writeFileSync(modelPolicyPath, readFileSync(new URL("../../ops/agent-model-policy.json", import.meta.url))); writeFileSync(budgetPolicyPath, readFileSync(new URL("../../ops/agent-budget-policy.json", import.meta.url))); return { dir, queuePath, policyPath, schemaPath, modelPolicyPath, budgetPolicyPath }; }

test("selects the highest-priority unblocked queued task and skips blockers", () => {
  const queue = { tasks: [task("blocked", 1, "BLOCKED"), task("dependent", 2, "QUEUED", ["blocked"]), task("next", 3)] };
  assert.equal(selectNextTask(queue).id, "next");
  assert.equal(queueSummary(queue).count.QUEUED, 2); assert.equal(queueSummary(queue).count.BLOCKED, 1); assert.equal(queueSummary(queue).count.CLASSIFYING, 0);
});

test("explicit business value and estimated cost break priority ties", () => {
  const cheapHighValue = { ...task("cheap", 5), business_value: "HIGH", urgency: "HIGH", estimated_cost_class: "LOW" };
  const expensiveHighValue = { ...task("expensive", 1), business_value: "HIGH", urgency: "HIGH", estimated_cost_class: "HIGH" };
  const lowValue = { ...task("low", 1), business_value: "LOW", urgency: "LOW", estimated_cost_class: "LOW" };
  assert.equal(selectNextTask({ tasks: [lowValue, expensiveHighValue, cheapHighValue] }).id, "cheap");
});

test("rejects malformed queues and duplicate task ids", () => {
  assert.throws(() => validateQueue({ tasks: [task("same", 1), task("same", 2)] }), /unique/);
  assert.throws(() => validateQueue({ tasks: [{ id: "bad" }] }), /requires/);
});

test("uses a stale lock safely and rejects a live lock", () => {
  const { dir, queuePath } = fixture(); const old = { pid: 999999, startedAt: stamp }; assert.equal(lockIsStale(old), true); const lock = acquireLock(dir, queuePath); assert.equal(lock.pid, process.pid); assert.throws(() => acquireLock(dir, queuePath), /already active/);
});

test("PASS requires recorded tests, no blocker, and every expected artifact", () => {
  const { dir } = fixture(); const input = task("artifact", 1); input.artifacts_expected = ["evidence.txt"]; assert.equal(validateResult({ status: "PASS", tests: ["test"], blocker: "", result_summary: "ok" }, input, dir).status, "PARTIAL"); writeFileSync(join(dir, "evidence.txt"), "ok"); assert.equal(validateResult({ status: "PASS", tests: ["test"], blocker: "", result_summary: "ok" }, input, dir).status, "PASS");
});

test("dry run checkpoints a selected task without invoking Codex", async () => {
  const { dir, queuePath, policyPath, schemaPath, modelPolicyPath } = fixture(); const queue = { tasks: [task("first", 1), task("blocked", 2, "BLOCKED")] }; writeJson(queuePath, queue); const statusFile = join(dir, "status.txt"); const result = await runQueue({ queuePath, policyPath, schemaPath, modelPolicyPath, root: dir, stateDir: join(dir, "state"), statusFile, morningReportFile: join(dir, "morning.txt"), dryRun: true, maxTasks: 1, maxRuntimeHours: 1 }); assert.equal(result.tasks[0].status, "PARTIAL"); assert.equal(result.tasks[1].status, "BLOCKED"); const status = readFileSync(statusFile, "utf8"); assert.match(status, /RUN STARTED:/); assert.match(status, /ELAPSED:/); assert.match(status, /TASK STARTED:/); assert.match(status, /HEARTBEAT:/); assert.match(status, /TASKS TOTAL:/); assert.match(status, /REMAINING:/); assert.match(status, /RUN BUDGET/); assert.match(status, /TOKEN \/ CACHE/); assert.match(status, /LAST COMMIT:/); assert.match(status, /NEXT TASK:/); assert.match(status, /LAST COMPLETED TASK: first/); assert.match(readFileSync(join(dir, "morning.txt"), "utf8"), /TASKS REMAINING/);
});

test("child supervision emits a five-minute heartbeat and terminates a twenty-minute no-progress worker", async () => {
  const { dir, queuePath } = fixture(); const stateDir = join(dir, "state"); acquireLock(stateDir, queuePath);
  let clock = 0; const timers = []; const heartbeats = []; const child = new EventEmitter(); child.pid = 42; child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kills = []; child.kill = (signal) => child.kills.push(signal);
  const pending = invokeCodex({ root: dir, task: { ...task("supervised", 1), selected_tier: "STANDARD", selected_model: "gpt-5.6-terra", reasoning_level: "medium", why_selected: "test" }, policy: "No production.", schema: join(dir, "schema.json"), stateDir, maxRuntimeMs: 30 * 60 * 1000, heartbeatIntervalMs: 5 * 60 * 1000, noProgressMs: 20 * 60 * 1000, watchdogTickMs: 1000, nowFn: () => clock, spawnChild: () => child, setIntervalFn: (callback, delay) => { timers.push({ callback, delay }); return delay; }, clearIntervalFn: () => {}, onHeartbeat: (value) => heartbeats.push(value) });
  clock = 5 * 60 * 1000; timers.find((timer) => timer.delay === 5 * 60 * 1000).callback(); assert.equal(heartbeats.length, 1);
  clock = 20 * 60 * 1000; timers.find((timer) => timer.delay === 1000).callback(); assert.deepEqual(child.kills, ["SIGTERM"]); child.emit("close", null, "SIGTERM"); const result = await pending;
  assert.equal(result.noProgressWatchdog, true); assert.equal(result.runtimeMs, 20 * 60 * 1000);
});

test("watchdog gets one scoped retry then checkpoints a continuable partial task", async () => {
  const { dir, queuePath, policyPath, schemaPath, modelPolicyPath } = fixture(); writeJson(queuePath, { tasks: [task("stalled", 1)] }); let invocations = 0;
  const invokeCodexFn = async ({ stateDir, task: active }) => { invocations += 1; const runDir = join(stateDir, "run-" + invocations); return { runtimeMs: 20 * 60 * 1000, noProgressWatchdog: true, runDir, eventFile: join(runDir, "events.jsonl"), result: null, task: active }; };
  const result = await runQueue({ queuePath, policyPath, schemaPath, modelPolicyPath, root: dir, stateDir: join(dir, "state"), statusFile: join(dir, "status.txt"), morningReportFile: join(dir, "morning.txt"), maxTasks: 3, maxRuntimeHours: 1, invokeCodexFn });
  assert.equal(invocations, 2); assert.equal(result.tasks[0].status, "PARTIAL"); assert.equal(result.tasks[0].watchdog_retry_count, 1); assert.match(result.tasks[0].blocker, /continuable/);
});

test("the legacy bounded runner validates the actual result path", () => {
  const source = readFileSync(new URL("./run-project.sh", import.meta.url), "utf8"); assert.match(source, /valid_result "\$result"/); assert.doesNotMatch(source, /valid_result ""/);
});

test("queue retry routing retains worker error evidence", () => {
  const source = readFileSync(new URL("./queue-lib.mjs", import.meta.url), "utf8");
  assert.match(source, /rawEvents = existsSync\(execution\.eventFile\)/);
  assert.match(source, /eventDetails/);
});

test("model-aware queue invocation preserves safety gates and no approval bypass", () => {
  const source = readFileSync(new URL("./queue-lib.mjs", import.meta.url), "utf8"); assert.match(source, /CODEX_QUEUE_NO_PRODUCTION: "1"/); assert.match(source, /CODEX_QUEUE_NO_OUTBOUND: "1"/); assert.match(source, /CODEX_QUEUE_NO_PURCHASES: "1"/); assert.match(source, /CODEX_QUEUE_NO_FORCE_PUSH: "1"/); assert.match(source, /"-m", task\.selected_model/); assert.match(source, /model_reasoning_effort=/); assert.doesNotMatch(source, /"--approve-for-me"/);
});

test("worker prompt has a stable policy prefix and excludes volatile full task state", () => {
  const input = { ...task("prompt", 1), selected_tier: "ROUTINE", selected_model: "gpt-5.6-luna", reasoning_level: "low", why_selected: "bounded", started_at: "volatile-time", run_dir: "volatile-path", checkpoint_summary: "compact checkpoint" };
  const prompt = composePrompt(input, "Stable policy.", "/repo");
  assert.ok(prompt.indexOf("Stable policy.") < prompt.indexOf("TASK-SCOPED CONTEXT"));
  assert.match(prompt, /EXPECTED_SCOPE/);
  assert.match(prompt, /compact checkpoint/);
  assert.doesNotMatch(prompt, /volatile-time|volatile-path/);
});
