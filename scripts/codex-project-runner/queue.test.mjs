import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acquireLock, lockIsStale, queueSummary, runQueue, selectNextTask, validateQueue, validateResult, writeJson } from "./queue-lib.mjs";

const stamp = "2026-08-17T00:00:00.000Z";
const task = (id, priority, status = "QUEUED", dependencies = []) => ({ id, title: id, category: "QA", priority, status, created_at: stamp, updated_at: stamp, description: "test", acceptance_criteria: ["done"], dependencies, blocked_by: [], attempt_count: 0, max_attempts: 2, estimated_scope: "small", allowed_actions: [], forbidden_actions: [], artifacts_expected: [], tests_expected: [], branch: null, commit_sha: null, started_at: null, completed_at: null, blocker: "", result_summary: "" });
function fixture() { const dir = mkdtempSync(join(tmpdir(), "grantdesk-queue-")); const queuePath = join(dir, "queue.json"); const policyPath = join(dir, "policy.md"); const schemaPath = join(dir, "schema.json"); const modelPolicyPath = join(dir, "agent-model-policy.json"); writeFileSync(policyPath, "No production. No outbound."); writeFileSync(schemaPath, "{}"); writeFileSync(modelPolicyPath, readFileSync(new URL("../../ops/agent-model-policy.json", import.meta.url))); return { dir, queuePath, policyPath, schemaPath, modelPolicyPath }; }

test("selects the highest-priority unblocked queued task and skips blockers", () => {
  const queue = { tasks: [task("blocked", 1, "BLOCKED"), task("dependent", 2, "QUEUED", ["blocked"]), task("next", 3)] };
  assert.equal(selectNextTask(queue).id, "next");
  assert.equal(queueSummary(queue).count.QUEUED, 2); assert.equal(queueSummary(queue).count.BLOCKED, 1); assert.equal(queueSummary(queue).count.CLASSIFYING, 0);
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
  const { dir, queuePath, policyPath, schemaPath, modelPolicyPath } = fixture(); const queue = { tasks: [task("first", 1), task("blocked", 2, "BLOCKED")] }; writeJson(queuePath, queue); const statusFile = join(dir, "status.txt"); const result = await runQueue({ queuePath, policyPath, schemaPath, modelPolicyPath, root: dir, stateDir: join(dir, "state"), statusFile, morningReportFile: join(dir, "morning.txt"), dryRun: true, maxTasks: 1, maxRuntimeHours: 1 }); assert.equal(result.tasks[0].status, "PARTIAL"); assert.equal(result.tasks[1].status, "BLOCKED"); assert.match(readFileSync(statusFile, "utf8"), /LAST COMPLETED TASK: first/); assert.match(readFileSync(join(dir, "morning.txt"), "utf8"), /TASKS REMAINING/);
});

test("the legacy bounded runner validates the actual result path", () => {
  const source = readFileSync(new URL("./run-project.sh", import.meta.url), "utf8"); assert.match(source, /valid_result "\$result"/); assert.doesNotMatch(source, /valid_result ""/);
});

test("queue retry routing retains worker error evidence", () => {
  const source = readFileSync(new URL("./queue-lib.mjs", import.meta.url), "utf8");
  assert.match(source, /eventDetails = existsSync\(execution\.eventFile\)/);
  assert.match(source, /eventDetails/);
});

test("model-aware queue invocation preserves safety gates and no approval bypass", () => {
  const source = readFileSync(new URL("./queue-lib.mjs", import.meta.url), "utf8"); assert.match(source, /CODEX_QUEUE_NO_PRODUCTION: "1"/); assert.match(source, /CODEX_QUEUE_NO_OUTBOUND: "1"/); assert.match(source, /CODEX_QUEUE_NO_PURCHASES: "1"/); assert.match(source, /CODEX_QUEUE_NO_FORCE_PUSH: "1"/); assert.match(source, /"-m", task\.selected_model/); assert.match(source, /model_reasoning_effort=/); assert.doesNotMatch(source, /"--approve-for-me"/);
});
