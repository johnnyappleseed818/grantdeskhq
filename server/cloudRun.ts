import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCompilationPreflightRequest, validateCompilationRequest, validateReadinessRequest } from "../src/lib/prototype.ts";
import type { CompilationPreflightRequest, CompilationRequest, ReadinessRequest } from "../src/types/prototype.ts";
import { compileGrantReport } from "./reportCompiler.ts";
import { preflightGrantSetup } from "./preflightCompiler.ts";
import { compileReadinessAudit } from "./readinessCompiler.ts";
import { HttpError, requireGtmAdmin, requireUser } from "./auth.ts";
import { readBillingStatus, readCompilationByRequest, readGtmAwardScan, readGtmDailyScan, listReports, saveBillingEvent, saveCompilation, saveGtmAwardScan, saveGtmDailyScan, saveReview } from "./persistence.ts";
import { runDailySocialScan } from "./gtmDailyScanner.ts";
import { runDailyAwardScan } from "./gtmAwardScanner.ts";
import { requireGtmScheduler } from "./schedulerAuth.ts";
import { BillingError, billingSnapshotFromEvent, createCheckoutSession, isBillingConfigured, validateBillingSelection, verifyStripeSignature, type StripeWebhookEvent } from "./billing.ts";

const port = Number(process.env.PORT || 8080);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const maxBodyBytes = 4_000_000;
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || "https://grantdeskhq.com,https://www.grantdeskhq.com")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    applyCors(request, response);
    if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    if (url.pathname === "/healthz" || url.pathname === "/api/health") {
      return json(response, 200, { status: "ok", service: "grantdeskhq-prototype" });
    }
    if (url.pathname === "/api/config") return handleConfig(request, response);
    if (url.pathname === "/api/billing/checkout") return await handleBillingCheckout(request, response);
    if (url.pathname === "/api/billing/status") return await handleBillingStatus(request, response);
    if (url.pathname === "/api/billing/webhook") return await handleBillingWebhook(request, response);
    if (url.pathname === "/api/reports/preflight") return await handlePreflight(request, response);
    if (url.pathname === "/api/compile-report" || url.pathname === "/api/reports/compile") return await handleCompiler(request, response);
    if (url.pathname === "/api/readiness-assessment") return await handleReadiness(request, response);
    if (url.pathname === "/api/gtm/access") return await handleGtmAccess(request, response);
    if (url.pathname === "/api/gtm/daily-signals") return await handleGtmDailySignals(request, response);
    if (url.pathname === "/api/gtm/award-signals") return await handleGtmAwardSignals(request, response);
    if (url.pathname === "/api/gtm/daily-scan") return await handleGtmDailyScan(request, response);
    if (url.pathname === "/api/reports") return await handleReports(request, response);
    const reviewMatch = url.pathname.match(/^\/api\/reports\/(report_[a-f0-9]{32})\/review$/);
    if (reviewMatch) return await handleReview(request, response, reviewMatch[1]);
    if (request.method !== "GET" && request.method !== "HEAD") return json(response, 405, { error: "Method not allowed." });
    return serveStatic(url.pathname, request.method === "HEAD", response);
  } catch (error) {
    console.error("GrantDeskHQ server error:", error instanceof Error ? error.message : "Unknown error");
    if (error instanceof HttpError) return json(response, error.statusCode, { error: error.message });
    if (error instanceof BillingError) return json(response, error.statusCode, { error: error.message });
    return json(response, 500, { error: "GrantDeskHQ could not complete this request." });
  }
}).listen(port, "0.0.0.0", () => console.log(`GrantDeskHQ prototype listening on ${port}`));

async function handleCompiler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }
  const user = await requireUser(request);
  const input = await readJson(request) as CompilationRequest;
  if (!input || !Array.isArray(input.files)) return json(response, 400, { error: "A source package is required." });
  const errors = validateCompilationRequest(input);
  if (errors.length) return json(response, 400, { error: errors.join(" ") });
  try {
    const existing = await readCompilationByRequest(user, input.requestId);
    if (existing) return json(response, 200, existing);
    const result = await compileGrantReport(input);
    return json(response, 200, await saveCompilation(user, input, result));
  } catch (error) {
    console.error("GrantDeskHQ compiler error:", error instanceof Error ? error.message : "Unknown error");
    const timedOut = isTimeoutFailure(error);
    return json(response, timedOut ? 504 : 502, {
      error: timedOut
        ? "Report generation took longer than expected. Your source files were not changed. Please try again."
        : "Report generation was temporarily interrupted. Your source files were not changed. Please try again."
    });
  }
}

function isTimeoutFailure(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || /aborted due to timeout|time limit|timed out|timeout/i.test(error.message));
}

async function handleBillingCheckout(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  const user = await requireUser(request);
  const selection = validateBillingSelection(await readJson(request));
  return json(response, 200, await createCheckoutSession(user, selection, requestOrigin(request)));
}

async function handleBillingStatus(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  return json(response, 200, { billing: await readBillingStatus(await requireUser(request)) });
}

async function handleBillingWebhook(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  const payload = await readBody(request);
  verifyStripeSignature(payload, request.headers["stripe-signature"] as string | undefined, secret);
  let event: StripeWebhookEvent;
  try { event = JSON.parse(payload.toString("utf8")) as StripeWebhookEvent; }
  catch { throw new BillingError(400, "Stripe webhook body is invalid."); }
  const snapshot = billingSnapshotFromEvent(event);
  if (snapshot) await saveBillingEvent(snapshot);
  return json(response, 200, { received: true });
}

async function handlePreflight(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }
  await requireUser(request);
  const input = await readJson(request) as CompilationPreflightRequest;
  if (!input?.file) return json(response, 400, { error: "An award agreement or Notice of Award is required." });
  const errors = validateCompilationPreflightRequest(input);
  if (errors.length) return json(response, 400, { error: errors.join(" ") });
  try {
    return json(response, 200, await preflightGrantSetup(input));
  } catch (error) {
    console.error("GrantDeskHQ setup preflight error:", error instanceof Error ? error.message : "Unknown error");
    return json(response, 502, { error: "GrantDeskHQ could not verify the award details. Check the document and try again." });
  }
}

async function handleGtmDailySignals(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { scan: await readGtmDailyScan() });
}

async function handleGtmAccess(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { allowed: true });
}

async function handleGtmAwardSignals(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { scan: await readGtmAwardScan() });
}

async function handleGtmDailyScan(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  const [socialResult, awardResult] = await Promise.allSettled([
    runDailySocialScan().then(saveGtmDailyScan),
    runDailyAwardScan().then(saveGtmAwardScan)
  ]);
  if (socialResult.status === "rejected" && awardResult.status === "rejected") throw new Error("Both scheduled GTM scans failed.");
  const errors = [socialResult, awardResult].flatMap((result) => result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : "Unknown scan error"] : []);
  return json(response, 200, {
    status: errors.length ? "partial" : "completed",
    generatedAt: new Date().toISOString(),
    socialItemCount: socialResult.status === "fulfilled" ? socialResult.value.items.length : null,
    awardCandidateCount: awardResult.status === "fulfilled" ? awardResult.value.opportunities.length : null,
    errors
  });
}

async function handleReadiness(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Method not allowed." });
  }
  await requireUser(request);
  const input = await readJson(request) as ReadinessRequest;
  if (!input || !Array.isArray(input.files)) return json(response, 400, { error: "An award agreement is required." });
  const errors = validateReadinessRequest(input);
  if (errors.length) return json(response, 400, { error: errors.join(" ") });
  try {
    return json(response, 200, await compileReadinessAudit(input));
  } catch (error) {
    console.error("GrantDeskHQ readiness compiler error:", error instanceof Error ? error.message : "Unknown error");
    return json(response, 502, { error: "The readiness audit could not be completed. Confirm the test files and try again." });
  }
}

async function handleReports(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  return json(response, 200, { reports: await listReports(await requireUser(request)) });
}

async function handleReview(request: IncomingMessage, response: ServerResponse, reportId: string) {
  if (request.method !== "PATCH") return json(response, 405, { error: "Method not allowed." });
  const user = await requireUser(request);
  const input = await readJson(request) as { itemId?: string; result?: unknown };
  if (!input.itemId || !input.result || typeof input.result !== "object") return json(response, 400, { error: "A reviewed item and report result are required." });
  return json(response, 200, await saveReview(user, reportId, input.result as Awaited<ReturnType<typeof compileGrantReport>>, input.itemId));
}

function handleConfig(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  const apiKey = process.env.FIREBASE_WEB_API_KEY?.trim();
  if (!apiKey) return json(response, 503, { error: "Account service is not configured." });
  return json(response, 200, {
    apiKey,
    authDomain: "grantdeskhq-proto-ek-2026.firebaseapp.com",
    projectId: "grantdeskhq-proto-ek-2026",
    billingConfigured: isBillingConfigured(),
    googleAnalyticsMeasurementId: process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID || undefined,
    clarityProjectId: process.env.CLARITY_PROJECT_ID || undefined
  });
}

async function readJson(request: IncomingMessage) {
  return JSON.parse((await readBody(request)).toString("utf8"));
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > maxBodyBytes) throw new Error("Request body exceeds the current file limit.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function requestOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) return origin;
  const forwardedHost = String(request.headers["x-forwarded-host"] || request.headers.host || "").split(",", 1)[0].trim();
  if (/^[a-z0-9-]+-[a-z0-9-]+-[a-z0-9]+\.a\.run\.app$/i.test(forwardedHost)) return `https://${forwardedHost}`;
  return "https://grantdeskhq.com";
}

async function serveStatic(urlPath: string, headOnly: boolean, response: ServerResponse) {
  const decoded = decodeURIComponent(urlPath);
  const candidate = path.resolve(root, `.${decoded}`);
  const safeCandidate = candidate.startsWith(`${root}${path.sep}`) || candidate === root ? candidate : root;
  let filePath = safeCandidate;
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, "index.html");
    await stat(filePath);
  } catch {
    filePath = path.join(root, "index.html");
  }
  const body = await readFile(filePath);
  response.statusCode = 200;
  response.setHeader("Content-Type", mime(filePath));
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Cache-Control", filePath.endsWith("index.html") ? "no-cache" : "public, max-age=3600");
  response.end(headOnly ? undefined : body);
}

function json(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(body));
}

function applyCors(request: IncomingMessage, response: ServerResponse) {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) return;
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Max-Age", "600");
  response.setHeader("Vary", "Origin");
}

function mime(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".pdf": "application/pdf", ".csv": "text/csv; charset=utf-8", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  } as Record<string, string>)[extension] || "application/octet-stream";
}
