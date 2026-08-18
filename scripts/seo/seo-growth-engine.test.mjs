import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { scoreOpportunity, selectExplicitOpportunity, validateSeoEngine } from "./seo-growth-engine.mjs";

const root = process.cwd();
test("validates the bounded live SEO inventory, technical prerequisites, and twenty query targets", () => {
  const result = validateSeoEngine(root);
  assert.equal(result.status, "PASS", result.problems.map((problem) => problem.detail).join("\n"));
  assert.equal(result.evaluated_queries, 20);
  assert.equal(result.inventory.length, 6);
  assert.equal(result.publishing_enabled, false);
});
test("scores opportunities deterministically without search-volume data", () => {
  assert.equal(scoreOpportunity({ priority_factors: { intent_fit: 5, product_fit: 5, differentiation: 4, conversion_path: 4, freshness_need: 2 } }), 20);
});
test("requires one explicit eligible opportunity and retains the publication lock", () => {
  assert.throws(() => selectExplicitOpportunity(root), /explicit SEO opportunity ID/);
  const selected = selectExplicitOpportunity(root, "refresh-post-award-reporting-checklist");
  assert.equal(selected.publishing_enabled, false);
  assert.throws(() => selectExplicitOpportunity(root, "brief-supporting-evidence-checklist"), /not eligible/);
});
test("fails deterministically when the schedule stops requiring the official UI", () => {
  const directory = mkdtempSync(join(tmpdir(), "seo-engine-"));
  writeFileSync(join(directory, "queue.json"), JSON.stringify({ publication: { enabled: false }, selection: { require_explicit_ids: true, max_opportunities_per_run: 1 }, opportunities: [] }));
  writeFileSync(join(directory, "evaluation.json"), JSON.stringify({ queries: [] }));
  writeFileSync(join(directory, "schedule.json"), JSON.stringify({ cadence: "weekly", schedule: [], calendar_trigger: { system: "cron", creation: "AUTOMATIC" } }));
  assert.throws(() => validateSeoEngine(directory, { queuePath: "queue.json", evaluationPath: "evaluation.json", schedulePath: "schedule.json" }));
});
