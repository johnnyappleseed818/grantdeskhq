import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_EVIDENCE_FILE_BYTES, MAX_EVIDENCE_FILES, MAX_EVIDENCE_TOTAL_BYTES, validateCompilationPreflightRequest, validateCompilationRequest, validateReadinessRequest } from "../src/lib/prototype.ts";
import type { CompilationPreflightRequest, CompilationRequest, CompilerFile, ReadinessRequest } from "../src/types/prototype.ts";
import { compileGrantReport } from "./reportCompiler.ts";
import { preflightGrantSetup } from "./preflightCompiler.ts";
import { compileReadinessAudit } from "./readinessCompiler.ts";
import { HttpError, requireGtmAdmin, requireUser } from "./auth.ts";
import { addSupportingEvidence, checkReliabilityDependencies, confirmEvidenceMatch, deleteReport, finalizeCompilationAnalysisCache, readBillingAttribution, readBillingStatus, readCompilationAnalysisCache, readCompilationById, readCompilationByRequest, readGtmAwardScan, readGtmContactSuppression, readGtmControlPlaneReconciliation, readGtmDailyScan, readGtmEnrichmentUsage, readGtmShadowStatus, readSearchConsoleState, readLatestReliabilityCanary, readReliabilityDashboard, listFeedback, listReports, removeSupportingEvidence, saveBillingEvent, saveFeedback, saveLifecycleEvent, saveCompilation, saveGtmAwardScan, saveGtmControlPlaneReconciliation, saveGtmShadowStatus, saveSearchConsoleState, saveReview } from "./persistence.ts";
import { validateFeedbackInput, type FeedbackSubmission } from "../src/lib/feedback.ts";
import { validateFeedbackReviewInput } from "../src/lib/feedback.ts";
import { confirmedHumanOutreach } from "../src/lib/gtmOutreach.ts";
import { reconcileGtmOutreachLedger, updateFeedbackReview } from "./persistence.ts";
import { runDailyAwardScan } from "./gtmAwardScanner.ts";
import { buildShadowStatus, shadowLeadFromOpportunity, suggestedTopicsFromLeads } from "../src/lib/gtmShadow.ts";
import { enrichGtmContactInShadow } from "./contactEnrichment.ts";
import { reconcileStoredContactEnrichmentBatch, runContactEnrichmentBatch, type EnrichmentBatchSegment } from "./contactEnrichmentBatch.ts";
import { reconcileSearchConsole } from "./searchConsole.ts";
import type { EnrichmentTarget } from "../src/lib/contactEnrichment.ts";
import { requireGtmScheduler, requireHealthScheduler } from "./schedulerAuth.ts";
import { BillingError, billingSnapshotFromEvent, changeSubscriptionPlan, createCheckoutSession, createCustomerPortalSession, foundingPricingActive, isBillingConfigured, validateBillingSelection, verifyStripeSignature, type StripeWebhookEvent } from "./billing.ts";
import { normalizeCompilationSources } from "./sourceNormalization.ts";
import { initialOpportunities } from "../src/data/gtmData.ts";
import { reconcileControlPlaneQueue } from "../src/lib/gtmControlPlaneQueue.ts";
import { buildGtmOverview } from "../src/lib/gtmOverview.ts";
import { readCanonicalGtmModel } from "./gtmCanonical.ts";
import type { GtmOpportunity } from "../src/lib/gtm.ts";
import { runNorthstarReliabilityCanary } from "./northstarCanary.ts";
import { applicationEnvironment, applicationRevision, deploymentRevision } from "./analysisVersions.ts";

const port = Number(process.env.PORT || 8080);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const maxBodyBytes = configuredPositiveInteger("MAX_REQUEST_BODY_BYTES", 24_000_000);
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || "https://grantdeskhq.com,https://www.grantdeskhq.com")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const feedbackAttempts = new Map<string, number[]>();
// These React routes require the client bundle after a direct load, but do not
// need separate crawlable HTML. Keep this allowlist narrow so unknown URLs
// remain real 404s.
const clientApplicationRoutes = new Set([
  "/account",
  "/compile",
  "/gtm",
  "/gtm/feedback",
  "/internal/reliability",
  "/login",
  "/pilot",
  "/privacy",
  "/readiness",
  "/sample-report",
  "/workspace"
]);
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' https://www.googletagmanager.com https://www.clarity.ms",
  "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://www.clarity.ms https://*.clarity.ms https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com https://firestore.googleapis.com https://storage.googleapis.com",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:"
].join("; ");

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    applySecurityHeaders(response);
    applyCors(request, response);
    if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    if (url.pathname === "/healthz" || url.pathname === "/api/health") {
      return json(response, 200, { status: "ok", service: "grantdeskhq-prototype", environment: applicationEnvironment(), applicationRevision: applicationRevision(), deploymentRevision: deploymentRevision() });
    }
    if (url.pathname === "/api/config") return handleConfig(request, response);
    if (url.pathname === "/api/billing/checkout") return await handleBillingCheckout(request, response);
    if (url.pathname === "/api/billing/change-plan") return await handleBillingPlanChange(request, response);
    if (url.pathname === "/api/billing/status") return await handleBillingStatus(request, response);
    if (url.pathname === "/api/billing/portal") return await handleBillingPortal(request, response);
    if (url.pathname === "/api/billing/webhook") return await handleBillingWebhook(request, response);
    if (url.pathname === "/api/lifecycle/account-created") return await handleLifecycleEvent(request, response, "account_created");
    if (url.pathname === "/api/lifecycle/first-report-started") return await handleLifecycleEvent(request, response, "first_report_started");
    if (url.pathname === "/api/lifecycle/checkout-started") return await handleLifecycleEvent(request, response, "checkout_started");
    if (url.pathname === "/api/reports/preflight") return await handlePreflight(request, response);
    if (url.pathname === "/api/compile-report" || url.pathname === "/api/reports/compile") return await handleCompiler(request, response);
    if (url.pathname === "/api/gtm/outreach") return await handleGtmOutreach(request, response);
    if (url.pathname === "/api/readiness-assessment") return await handleReadiness(request, response);
    if (url.pathname === "/api/feedback") return await handleFeedback(request, response);
    if (url.pathname === "/api/gtm/feedback") return await handleGtmFeedback(request, response);
    if (url.pathname === "/api/gtm/access") return await handleGtmAccess(request, response);
    if (url.pathname === "/api/gtm/opportunities") return await handleGtmOpportunities(request, response);
    if (url.pathname === "/api/gtm/daily-signals") return await handleGtmDailySignals(request, response);
    if (url.pathname === "/api/gtm/award-signals") return await handleGtmAwardSignals(request, response);
    if (url.pathname === "/api/gtm/control-plane-queue") return await handleGtmControlPlaneQueue(request, response);
    if (url.pathname === "/api/gtm/overview") return await handleGtmOverview(request, response);
    if (url.pathname === "/api/gtm/canonical") return await handleGtmCanonical(request, response);
    if (url.pathname === "/api/gtm/shadow-status") return await handleGtmShadowStatus(request, response);
    if (url.pathname === "/api/gtm/contact-enrichment") return await handleGtmContactEnrichment(request, response);
    if (url.pathname === "/api/gtm/contact-enrichment/batch") return await handleGtmContactEnrichmentBatch(request, response);
    if (url.pathname === "/api/gtm/contact-enrichment/reconcile") return await handleStoredContactEnrichmentReconcile(request, response);
    if (url.pathname === "/api/gtm/partner-reconciliation") return await handleScheduledPartnerHunterReconciliation(request, response);
    if (url.pathname === "/api/gtm/search-console/reconcile" || url.pathname === "/api/gtm/seo-reconciliation") return await handleSearchConsoleReconcile(request, response);
    if (url.pathname === "/api/gtm/search-console") return await handleSearchConsoleState(request, response);
    if (url.pathname === "/api/gtm/daily-scan") return await handleGtmDailyScan(request, response);
    if (url.pathname === "/api/internal/reliability/access") return await handleReliabilityAccess(request, response);
    if (url.pathname === "/api/internal/reliability/summary") return await handleReliabilitySummary(request, response);
    if (url.pathname === "/api/internal/reliability/dependencies") return await handleReliabilityDependencies(request, response);
    if (url.pathname === "/api/internal/reliability/canary/latest") return await handleLatestReliabilityCanary(request, response);
    if (url.pathname === "/api/internal/reliability/canary") return await handleReliabilityCanary(request, response);
    if (url.pathname === "/api/reports") return await handleReports(request, response);
    const savedReportMatch = url.pathname.match(/^\/api\/reports\/(report_[a-f0-9]{32})$/);
    if (savedReportMatch) return await handleSavedReport(request, response, savedReportMatch[1]);
    const reviewMatch = url.pathname.match(/^\/api\/reports\/(report_[a-f0-9]{32})\/review$/);
    if (reviewMatch) return await handleReview(request, response, reviewMatch[1]);
    const evidenceCollectionMatch = url.pathname.match(/^\/api\/reports\/(report_[a-f0-9]{32})\/evidence$/);
    if (evidenceCollectionMatch) return await handleEvidenceCollection(request, response, evidenceCollectionMatch[1]);
    const evidenceItemMatch = url.pathname.match(/^\/api\/reports\/(report_[a-f0-9]{32})\/evidence\/(evidence_[a-zA-Z0-9_-]{8,80})$/);
    if (evidenceItemMatch) return await handleEvidenceItem(request, response, evidenceItemMatch[1], evidenceItemMatch[2]);
    const evidenceMatchReview = url.pathname.match(/^\/api\/reports\/(report_[a-f0-9]{32})\/evidence\/(evidence_[a-zA-Z0-9_-]{8,80})\/matches$/);
    if (evidenceMatchReview) return await handleEvidenceMatchReview(request, response, evidenceMatchReview[1], evidenceMatchReview[2]);
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
  const errors = validateCompilationRequest(input, {
    maxEvidenceFiles: configuredPositiveInteger("EVIDENCE_MAX_FILES", MAX_EVIDENCE_FILES),
    maxEvidenceFileBytes: configuredPositiveInteger("EVIDENCE_MAX_FILE_BYTES", MAX_EVIDENCE_FILE_BYTES),
    maxEvidenceTotalBytes: configuredPositiveInteger("EVIDENCE_MAX_TOTAL_BYTES", MAX_EVIDENCE_TOTAL_BYTES)
  });
  if (errors.length) return json(response, 400, { error: errors.join(" ") });
  try {
    const existing = await readCompilationByRequest(user, input.requestId);
    if (existing) return json(response, 200, existing);
    const normalized = await normalizeCompilationSources(input);
    const cached = await readCompilationAnalysisCache(normalized.request);
    const result = cached || await finalizeCompilationAnalysisCache(
      normalized.request,
      await compileGrantReport(normalized.request, normalized.ledgerRows)
    );
    return json(response, 200, await saveCompilation(user, normalized.request, result));
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
  return json(response, 200, await createCheckoutSession(user, selection, requestOrigin(request), await readBillingAttribution(user)));
}

async function handleBillingPlanChange(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  const user = await requireUser(request);
  const selection = validateBillingSelection(await readJson(request));
  const billing = await readBillingStatus(user);
  if (!billing?.entitlementActive || !billing.stripeSubscriptionId) throw new BillingError(409, "An active subscription is required before changing plans.");
  if (billing.planKey === selection.plan) return json(response, 200, { billing });
  return json(response, 200, { billing: await changeSubscriptionPlan(billing.stripeSubscriptionId, selection, billing.foundingPricingApplied) });
}

async function handleBillingStatus(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  return json(response, 200, { billing: await readBillingStatus(await requireUser(request)) });
}

async function handleBillingPortal(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  const billing = await readBillingStatus(await requireUser(request));
  return json(response, 200, await createCustomerPortalSession(billing?.stripeCustomerId || "", requestOrigin(request)));
}

async function handleLifecycleEvent(request: IncomingMessage, response: ServerResponse, event: "account_created" | "first_report_started" | "checkout_started") {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  const input = await readJson(request) as { attribution?: unknown };
  await saveLifecycleEvent(await requireUser(request), event, input?.attribution);
  return json(response, 202, { recorded: true });
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

async function handleFeedback(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  const source = request.headers["x-forwarded-for"]?.toString().split(",", 1)[0].trim() || request.socket.remoteAddress || "unknown";
  if (!allowFeedbackAttempt(source)) return json(response, 429, { error: "Too many feedback submissions. Please try again later." });
  const input = validateFeedbackInput(await readJson(request));
  if (input.errors.length) return json(response, 400, { error: input.errors.join(" ") });
  if (input.value.website) return json(response, 202, { submitted: true, notificationStatus: "NOT_CONFIGURED" });
  const user = request.headers.authorization ? await requireUser(request) : null;
  const submission: FeedbackSubmission = { id: `feedback_${randomUUID().replaceAll("-", "")}`, createdAt: new Date().toISOString(), userId: user?.uid || null, name: user?.name.trim() || input.value.name, email: user?.email.trim().toLowerCase() || input.value.email, organization: input.value.organization, category: input.value.category, message: input.value.message, sourcePage: input.value.sourcePage, status: "NEW", adminNotes: "", linkedCustomerId: null, notificationStatus: "NOT_CONFIGURED" };
  await saveFeedback(submission);
  return json(response, 201, { submitted: true, notificationStatus: submission.notificationStatus });
}

async function handleGtmFeedback(request: IncomingMessage, response: ServerResponse) {
  requireGtmAdmin(await requireUser(request));
  if (request.method === "GET") return json(response, 200, { feedback: await listFeedback() });
  if (request.method !== "PATCH") return json(response, 405, { error: "Method not allowed." });
  const body = await readJson(request) as { id?: unknown; status?: unknown; adminNotes?: unknown };
  const review = validateFeedbackReviewInput(body);
  if (review.errors.length) return json(response, 400, { error: review.errors.join(" ") });
  return json(response, 200, { feedback: await updateFeedbackReview(String(body.id || ""), review.value) });
}

async function handleGtmOutreach(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  try { return json(response, 200, { outreach: await reconcileGtmOutreachLedger(confirmedHumanOutreach), durable: true }); }
  catch { return json(response, 200, { outreach: confirmedHumanOutreach, durable: false }); }
}

function allowFeedbackAttempt(source: string) {
  const now = Date.now(); const attempts = (feedbackAttempts.get(source) || []).filter((at) => at >= now - 60 * 60 * 1000);
  if (attempts.length >= 5) return false;
  attempts.push(now); feedbackAttempts.set(source, attempts); return true;
}

async function handleGtmOpportunities(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { opportunities: initialOpportunities });
}

async function handleGtmAwardSignals(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { scan: await readGtmAwardScan() });
}

async function handleGtmControlPlaneQueue(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { reconciliation: await readGtmControlPlaneReconciliation() });
}

async function handleGtmOverview(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  const [reconciliation, shadowStatus, usage] = await Promise.all([readGtmControlPlaneReconciliation(), readGtmShadowStatus(), readGtmEnrichmentUsage()]);
  return json(response, 200, { overview: buildGtmOverview({ reconciliation, shadowStatus, usage, hunterLookupLimit: configuredPositiveInteger("HUNTER_MAX_LOOKUPS_PER_RUN", 2) }) });
}

async function handleGtmCanonical(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { model: await readCanonicalGtmModel() });
}

async function handleGtmShadowStatus(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { status: await readGtmShadowStatus() });
}

async function handleGtmContactEnrichment(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  const target = await readJson(request) as EnrichmentTarget;
  const errors = validateContactEnrichmentTarget(target);
  if (errors.length) return json(response, 400, { error: errors.join(" ") });
  return json(response, 200, { record: await enrichGtmContactInShadow(target) });
}

async function handleGtmContactEnrichmentBatch(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  const input = await readJson(request) as { segment?: unknown; limit?: unknown; dryRun?: unknown };
  if (input.segment !== "partner" && input.segment !== "direct") return json(response, 400, { error: "segment must be partner or direct." });
  const limit = Number(input.limit || 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) return json(response, 400, { error: "limit must be an integer from 1 through 20." });
  return json(response, 200, { batch: await runContactEnrichmentBatch({ segment: input.segment as EnrichmentBatchSegment, limit, dryRun: input.dryRun === true }) });
}

async function handleStoredContactEnrichmentReconcile(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  const input = await readJson(request) as { segment?: unknown; limit?: unknown };
  if (input.segment !== "partner" && input.segment !== "direct") return json(response, 400, { error: "segment must be partner or direct." });
  const limit = Number(input.limit || 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) return json(response, 400, { error: "limit must be an integer from 1 through 20." });
  const reconciliation = await reconcileStoredContactEnrichmentBatch({ segment: input.segment as EnrichmentBatchSegment, limit });
  console.info("GTM_HUNTER_STORED_RECONCILE " + JSON.stringify({ segment: reconciliation.segment, reconciled: reconciliation.reconciled, ready: reconciliation.ready, needsVerification: reconciliation.needsVerification, alreadyContacted: reconciliation.alreadyContacted, verified: reconciliation.verified, acceptAll: reconciliation.acceptAll, risky: reconciliation.risky, invalid: reconciliation.invalid, resultMissing: reconciliation.resultMissing }));
  return json(response, 200, { reconciliation });
}

async function handleScheduledPartnerHunterReconciliation(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  const partner = await runContactEnrichmentBatch({ segment: "partner", limit: 20 });
  console.info("GTM_HUNTER_BATCH " + JSON.stringify({ segment: partner.segment, attempted: partner.attempted, contactsResolved: partner.contactsResolved, verifiedEmails: partner.verifiedEmails, ready: partner.ready, needsVerification: partner.needsVerification, alreadyContacted: partner.alreadyContacted, duplicates: partner.duplicates, failures: partner.failures, providerUsage: partner.providerUsage }));
  return json(response, 200, { partner });
}

async function handleSearchConsoleReconcile(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  const state = await saveSearchConsoleState(await reconcileSearchConsole());
  console.info("SEARCH_CONSOLE_RECONCILE " + JSON.stringify({ analyticsStatus: state.analyticsStatus, pages: state.ranges.last28Days?.pages.length || 0, queries: state.ranges.last28Days?.queries.length || 0, sitemap: state.sitemap.result, dataThrough: state.dataThrough, errors: state.errors }));
  return json(response, 200, { state });
}

async function handleSearchConsoleState(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { state: await readSearchConsoleState() });
}

export function validateContactEnrichmentTarget(target: Partial<EnrichmentTarget> | null | undefined) {
  const errors: string[] = [];
  if (!target || !target.organization?.trim()) errors.push("An organization is required.");
  if (!target?.organizationDomain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(target.organizationDomain.trim())) errors.push("A verified organization domain is required.");
  if (!target?.domainSourceUrl || !/^https:\/\//.test(target.domainSourceUrl)) errors.push("A verified organization-domain source URL is required.");
  const person = target?.person;
  if (!person?.firstName?.trim() || !person.lastName?.trim() || !person.fullName?.trim()) errors.push("A named current contact is required.");
  if (!person?.currentTitle?.trim() || !person.titleSourceUrl || !/^https:\/\//.test(person.titleSourceUrl)) errors.push("A current contact title and authoritative source URL are required.");
  return errors;
}

async function handleGtmDailyScan(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  const errors: string[] = [];
  let awardScan;
  try { awardScan = await runDailyAwardScan().then(saveGtmAwardScan); }
  catch (error) { errors.push(error instanceof Error ? error.message : "Award scan failed."); }
  const opportunities = awardScan?.opportunities || [];
  let reconciliation;
  if (awardScan) {
    try { reconciliation = await reconcileAndSaveControlPlane([...initialOpportunities, ...opportunities]); }
    catch (error) { errors.push(error instanceof Error ? error.message : "GTM Control Plane reconciliation could not be saved."); }
  }
  let shadowStatus;
  try { shadowStatus = await saveGtmShadowStatus(buildShadowStatus(opportunities.map(shadowLeadFromOpportunity), suggestedTopicsFromLeads(opportunities.map(shadowLeadFromOpportunity)))); }
  catch (error) { errors.push(error instanceof Error ? error.message : "GTM shadow status could not be saved."); }
  // Reuse the established daily GTM runtime for bounded Direct replenishment.
  // The batch suppresses contacted organizations before a provider call and
  // never discovers a new cohort or sends a message.
  let directReplenishment;
  try {
    const canonical = await readCanonicalGtmModel();
    if (canonical.metrics.directReady < 15) {
      directReplenishment = await runContactEnrichmentBatch({ segment: "direct", limit: 20 });
      console.info("GTM_HUNTER_DIRECT_REPLENISHMENT " + JSON.stringify({ attempted: directReplenishment.attempted, ready: directReplenishment.ready, needsVerification: directReplenishment.needsVerification, alreadyContacted: directReplenishment.alreadyContacted, providerUsage: directReplenishment.providerUsage }));
    }
  } catch (error) { errors.push(error instanceof Error ? error.message : "Direct replenishment could not be completed."); }
  return json(response, 200, {
    status: errors.length ? "partial" : "completed",
    generatedAt: new Date().toISOString(),
    socialItemCount: null,
    socialResearchMode: "MANUAL_REVIEW_ONLY",
    awardCandidateCount: awardScan?.opportunities.length || null,
    controlPlaneCardCount: reconciliation?.cards.length || null,
    controlPlaneUniqueOrganizationCount: reconciliation?.uniqueOrganizations || null,
    shadowMode: "SHADOW",
    shadowStatus: shadowStatus || null,
    directReplenishment: directReplenishment || null,
    errors
  });
}

async function reconcileAndSaveControlPlane(opportunities: GtmOpportunity[]) {
  const directEmails = [...new Set(opportunities.flatMap((opportunity) => opportunity.primaryContact?.emailKind === "direct" ? [opportunity.primaryContact.email.toLowerCase()] : []))];
  const checks = await Promise.all(directEmails.map(async (email) => [email, await readGtmContactSuppression(email)] as const));
  const suppressionByEmail = Object.fromEntries(checks.map(([email, check]) => [email, check.status]));
  const reconciliation = reconcileControlPlaneQueue({
    cards: opportunities,
    suppressionByEmail,
    alreadyContactedOrganizations: confirmedHumanOutreach.map((record) => record.organization),
    alreadyContactedEmails: confirmedHumanOutreach.flatMap((record) => record.email ? [record.email] : []),
    draftOrganizations: opportunities.filter((opportunity) => opportunity.emailSubject.trim() && opportunity.draftMessage.trim()).map((opportunity) => opportunity.organization)
  });
  return saveGtmControlPlaneReconciliation(reconciliation);
}

async function handleReliabilityAccess(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { allowed: true });
}

async function handleReliabilitySummary(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { reliability: await readReliabilityDashboard() });
}

async function handleReliabilityDependencies(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  const dependencies = await checkReliabilityDependencies();
  return json(response, dependencies.status === "healthy" ? 200 : 503, { dependencies });
}

async function handleLatestReliabilityCanary(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { canary: await readLatestReliabilityCanary() });
}

async function handleReliabilityCanary(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  if (request.headers["x-cloudscheduler"] || request.headers["x-grantdesk-health-scheduler"]) await requireHealthScheduler(request);
  else requireGtmAdmin(await requireUser(request));
  const input = await readJson(request).catch(() => ({})) as { trigger?: "daily" | "post_deploy" | "manual"; browserApiConsistency?: "pass" | "fail" | "not_evaluated" };
  const result = await runNorthstarReliabilityCanary({
    origin: process.env.RELIABILITY_CANARY_ORIGIN?.trim() || requestOrigin(request),
    trigger: input.trigger || (request.headers["x-cloudscheduler"] ? "daily" : "manual"),
    firebaseReferer: process.env.RELIABILITY_FIREBASE_REFERER || "https://grantdeskhq.com",
    browserApiConsistency: input.browserApiConsistency || "not_evaluated"
  });
  return json(response, result.status === "healthy" ? 200 : 503, { canary: result });
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

async function handleSavedReport(request: IncomingMessage, response: ServerResponse, reportId: string) {
  if (!['GET', 'DELETE'].includes(request.method || "")) return json(response, 405, { error: "Method not allowed." });
  const user = await requireUser(request);
  if (request.method === "DELETE") return json(response, 200, await deleteReport(user, reportId));
  const saved = await readCompilationById(user, reportId);
  return saved ? json(response, 200, saved) : json(response, 404, { error: "Saved report was not found." });
}

async function handleReview(request: IncomingMessage, response: ServerResponse, reportId: string) {
  if (request.method !== "PATCH") return json(response, 405, { error: "Method not allowed." });
  const user = await requireUser(request);
  const input = await readJson(request) as { itemId?: string; resolution?: "resolved" | "not_applicable" };
  if (!input.itemId || (input.resolution && !["resolved", "not_applicable"].includes(input.resolution))) return json(response, 400, { error: "A valid reviewed item is required." });
  return json(response, 200, await saveReview(user, reportId, input.itemId, input.resolution || "resolved"));
}

async function handleEvidenceCollection(request: IncomingMessage, response: ServerResponse, reportId: string) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  const user = await requireUser(request);
  const input = await readJson(request) as { files?: CompilerFile[]; replaceEvidenceId?: string };
  const files = input.files || [];
  if (!files.length || files.length > MAX_EVIDENCE_FILES || files.some((file) => file.role !== "supportingEvidence")) return json(response, 400, { error: "Add one or more valid supporting evidence files." });
  if (files.some((file) => file.size > configuredPositiveInteger("EVIDENCE_MAX_FILE_BYTES", MAX_EVIDENCE_FILE_BYTES))) return json(response, 400, { error: "One or more supporting evidence files exceed the configured file limit." });
  return json(response, 200, await addSupportingEvidence(user, reportId, files, input.replaceEvidenceId));
}

async function handleEvidenceItem(request: IncomingMessage, response: ServerResponse, reportId: string, evidenceId: string) {
  if (request.method !== "DELETE") return json(response, 405, { error: "Method not allowed." });
  return json(response, 200, await removeSupportingEvidence(await requireUser(request), reportId, evidenceId));
}

async function handleEvidenceMatchReview(request: IncomingMessage, response: ServerResponse, reportId: string, evidenceId: string) {
  if (request.method !== "PATCH") return json(response, 405, { error: "Method not allowed." });
  const input = await readJson(request) as { targetId?: string };
  if (!input.targetId?.trim()) return json(response, 400, { error: "Choose the suggested evidence match to confirm." });
  return json(response, 200, await confirmEvidenceMatch(await requireUser(request), reportId, evidenceId, input.targetId));
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
    foundingPricingActive: foundingPricingActive(),
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
  const normalizedRoute = decoded.replace(/\/+$/, "") || "/";
  const candidate = path.resolve(root, `.${decoded}`);
  const safeCandidate = candidate.startsWith(`${root}${path.sep}`) || candidate === root ? candidate : root;
  let filePath = safeCandidate;
  let statusCode = 200;
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, "index.html");
    await stat(filePath);
  } catch {
    if (clientApplicationRoutes.has(normalizedRoute)) {
      filePath = path.join(root, "index.html");
    } else {
      filePath = path.join(root, "404.html");
      statusCode = 404;
    }
  }
  const body = await readFile(filePath);
  response.statusCode = statusCode;
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
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Max-Age", "600");
  response.setHeader("Vary", "Origin");
}

function applySecurityHeaders(response: ServerResponse) {
  response.setHeader("Content-Security-Policy", contentSecurityPolicy);
}

function mime(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".pdf": "application/pdf", ".csv": "text/csv; charset=utf-8", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  } as Record<string, string>)[extension] || "application/octet-stream";
}

function configuredPositiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
