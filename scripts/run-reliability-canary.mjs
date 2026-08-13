import fs from "node:fs";
import path from "node:path";

const origin = String(process.argv[2] || process.env.GRANTDESK_CANARY_ORIGIN || "").replace(/\/$/, "");
const trigger = process.argv[3] || process.env.GRANTDESK_CANARY_TRIGGER || "manual";
const token = process.env.GRANTDESK_HEALTH_ID_TOKEN || "";
const browserApiConsistency = process.env.GRANTDESK_BROWSER_API_CONSISTENCY || "not_evaluated";
if (!origin) throw new Error("Provide the deployed application origin as the first argument or GRANTDESK_CANARY_ORIGIN.");
if (!token) throw new Error("GRANTDESK_HEALTH_ID_TOKEN is required. Use a Google OIDC identity token for the configured health scheduler service account.");

const response = await fetch(`${origin}/api/internal/reliability/canary`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-grantdesk-health-scheduler": "1"
  },
  body: JSON.stringify({ trigger, browserApiConsistency }),
  signal: AbortSignal.timeout(1_800_000)
});
const text = await response.text();
let body;
try { body = JSON.parse(text); } catch { throw new Error(`Canary returned ${response.status}: ${text.slice(0, 500)}`); }
const directory = path.resolve(process.env.GRANTDESK_CANARY_ARTIFACT_DIR || "test-results/reliability-canary");
fs.mkdirSync(directory, { recursive: true });
const canary = body?.canary || body?.reliability;
const file = path.join(directory, `${canary?.runId || `failed-${Date.now()}`}.json`);
fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
console.log(JSON.stringify({ httpStatus: response.status, artifact: file, canary: canary || null }, null, 2));
if (!response.ok || canary?.status !== "healthy") process.exitCode = 1;
