import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const artifacts = path.join(root, "test-results/grantdesk-regression");
const runtime = process.env.GRANTDESK_PLAYWRIGHT_RUNTIME || path.join(os.tmpdir(), "grantdesk-playwright-runtime");
const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.tmpdir(), "grantdesk-playwright-browsers");
const origin = (process.argv[2] || process.env.GRANTDESK_E2E_ORIGIN || "https://grantdeskhq.com").replace(/\/$/, "");
const playwrightVersion = "1.55.0";
fs.mkdirSync(artifacts, { recursive: true });

const results = [];
const run = (name, command, args, env = {}) => {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"]
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const entry = {
    name,
    status: result.status === 0 ? "PASS" : "FAIL",
    exitCode: result.status ?? 1,
    startedAt,
    finishedAt: new Date().toISOString()
  };
  results.push(entry);
  return entry;
};

const playwrightPackage = path.join(runtime, "node_modules/@playwright/test/package.json");
if (!fs.existsSync(playwrightPackage)) {
  run("playwright runtime", "npm", ["install", "--prefix", runtime, `@playwright/test@${playwrightVersion}`]);
}

const browserMarker = path.join(browsers, "chromium_headless_shell-1187");
if (!fs.existsSync(browserMarker)) {
  run("playwright chromium", "node", [path.join(runtime, "node_modules/playwright/cli.js"), "install", "chromium"], {
    PLAYWRIGHT_BROWSERS_PATH: browsers
  });
}

run("unit and deterministic integration", "npx", [
  "vitest", "run", "--disableConsoleIntercept",
  "--exclude", "src/test/northstarLive.integration.test.ts",
  "--exclude", "src/test/compiler.integration.test.ts",
  "--exclude", "src/test/compiler.accuracy-evaluation.test.ts"
]);
run("live API end-to-end", "npx", ["vitest", "run", "src/test/northstarLive.integration.test.ts", "--disableConsoleIntercept"], {
  RUN_GRANTDESK_LIVE: "1",
  GRANTDESK_E2E_ORIGIN: origin
});
run("real AI compiler smoke", "node", ["scripts/run-ai-smoke.mjs"]);
run("real AI accuracy and obligation-coverage gates", "node", ["scripts/run-ai-accuracy-eval.mjs"]);
run("Playwright UI smoke", "node", ["tests/e2e/northstar-smoke.mjs"], {
  GRANTDESK_PLAYWRIGHT_RUNTIME: runtime,
  PLAYWRIGHT_BROWSERS_PATH: browsers,
  GRANTDESK_E2E_ORIGIN: origin
});

const summary = {
  generatedAt: new Date().toISOString(),
  origin,
  status: results.every((item) => item.status === "PASS") ? "PASS" : "FAIL",
  results
};
fs.writeFileSync(path.join(artifacts, "runner-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.exitCode = summary.status === "PASS" ? 0 : 1;
