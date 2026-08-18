#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { extractCodexTelemetry } from "./queue-lib.mjs";

const root = resolve(process.cwd());
const policy = readFileSync(resolve(root, "ops/codex-operating-policy.md"), "utf8").trim();
const stablePrefix = [
  "GRANTDESKHQ CACHE PROBE (stable prefix)",
  policy,
  "Return exactly CACHE_PROBE_OK. Do not use tools, inspect files, or make changes."
].join("\n");
const runDir = mkdtempSync(join(tmpdir(), "grantdeskhq-codex-cache-"));
const rows = [];
try {
  for (const suffix of ["TASK: routine cache probe one.", "TASK: routine cache probe two."]) {
    const finalFile = join(runDir, "final-" + (rows.length + 1) + ".txt");
    const result = spawnSync("codex", ["exec", "--ephemeral", "--sandbox", "read-only", "--json", "--output-last-message", finalFile, "-m", "gpt-5.6-luna", "-c", "model_reasoning_effort=\"low\"", "-C", root, stablePrefix + "\n" + suffix], { cwd: root, encoding: "utf8", timeout: 120_000 });
    const eventFile = join(runDir, "events-" + (rows.length + 1) + ".jsonl");
    writeFileSync(eventFile, (result.stdout || "") + "\n" + (result.stderr || ""));
    const telemetry = extractCodexTelemetry(eventFile);
    rows.push({ exit_code: result.status, signal: result.signal || null, telemetry, response: result.status === 0 ? "ok" : "failed" });
  }
  const directTelemetry = rows.some((row) => Object.keys(row.telemetry).length > 0);
  const cacheTelemetry = rows.some((row) => typeof row.telemetry.cached_input_tokens === "number");
  const report = {
    native_cache: directTelemetry ? "AVAILABLE" : "UNKNOWN",
    cached_token_telemetry: cacheTelemetry ? "YES" : "NO",
    test_1: rows[0],
    test_2: rows[1],
    cache_utilization: cacheTelemetry ? "GOOD" : "UNKNOWN"
  };
  console.log(JSON.stringify(report, null, 2));
  if (rows.some((row) => row.exit_code !== 0)) process.exitCode = 1;
} finally {
  rmSync(runDir, { recursive: true, force: true });
}
