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
import { addSupportingEvidence, checkReliabilityDependencies, confirmEvidenceMatch, deleteReport, finalizeCompilationAnalysisCache, readBillingAttribution, readBillingStatus, readCompilationAnalysisCache, readCompilationById, readCompilationByRequest, readGtmAwardScan, readGtmContactSuppression, readGtmContentEngineState, readGtmControlPlaneReconciliation, readGtmDailyScan, readGtmDirectDiscoveryScan, readGtmEnrichmentUsage, readGtmInventoryAutopilot, readGtmPartnerDiscoveryScan, readGtmShadowStatus, readInstantlyRecords, readInstantlyStatus, readSearchConsoleState, readLatestReliabilityCanary, readReliabilityDashboard, listFeedback, listReports, recordGtmContactSuppression, removeSupportingEvidence, saveBillingEvent, saveFeedback, saveGtmContentEngineState, saveGtmDailyScan, saveGtmDirectDiscoveryScan, saveGtmInventoryAutopilot, saveGtmPartnerDiscoveryScan, saveInstantlyRecord, saveInstantlyStatus, saveInstantlyWebhookEvent, saveLifecycleEvent, saveCompilation, saveGtmAwardScan, saveGtmControlPlaneReconciliation, saveGtmShadowStatus, saveSearchConsoleState, saveReview, updateGtmDailySocialItem } from "./persistence.ts";
import { validateFeedbackInput, type FeedbackSubmission } from "../src/lib/feedback.ts";
import { validateFeedbackReviewInput } from "../src/lib/feedback.ts";
import { confirmedHumanOutreach, summarizeOutreach } from "../src/lib/gtmOutreach.ts";
import { reconcileGtmOutreachLedger, updateFeedbackReview } from "./persistence.ts";
import { runDailyAwardScan } from "./gtmAwardScanner.ts";
import { runDailySocialScan } from "./gtmDailyScanner.ts";
import { runPartnerPublicDiscovery } from "./gtmPartnerDiscovery.ts";
import { runDirectPublicDiscovery } from "./gtmDirectDiscovery.ts";
import { resolveDirectRecipients } from "./gtmDirectRecipientResolution.ts";
import { buildShadowStatus, shadowLeadFromOpportunity, suggestedTopicsFromLeads } from "../src/lib/gtmShadow.ts";
import { editContentDraft, reconcileContentEngine, reconcileContentInventory, updateContentEngineState } from "../src/lib/gtmContentEngine.ts";
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
import { canonicalOrganizationId } from "../src/lib/gtmCanonical.ts";
import { boundedEnrichmentLimit, GTM_INVENTORY_POLICY, inventoryDecision, socialDiscoveryBreadth, type InventoryAutopilotSnapshot } from "../src/lib/gtmInventoryPolicy.ts";
import { runNorthstarReliabilityCanary } from "./northstarCanary.ts";
import { applicationEnvironment, applicationRevision, deploymentRevision } from "./analysisVersions.ts";
import { applyInstantlyEvent, campaignSenderAddresses, campaignUsesOnlySender, controlledCampaignSafetySummary, InstantlyClient, instantlyConfig, instantlyHealth, instantlyItems, instantSafeSummary, instantlyLeadCampaignId, instantlyPreviewRecord, normalizeInstantlyWebhook, reconcileInstantlyLead, stagingEligibility, verifyInstantlyWebhookSignature, verifyInstantlyWebhookToken } from "./instantly.ts";

const port = Number(process.env.PORT || 8080);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const maxBodyBytes = configuredPositiveInteger("MAX_REQUEST_BODY_BYTES", 24_000_000);

function domainFromUrl(value: string) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}
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
  "/gtm/seo/content",
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
    // One canonical public URL per page: preserve the root slash, redirect all
    // non-API trailing-slash variants before the React application is served.
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.length > 1 && url.pathname.endsWith("/") && !url.pathname.startsWith("/api/")) {
      response.statusCode = 301;
      response.setHeader("Location", url.pathname.slice(0, -1) + url.search);
      response.end();
      return;
    }
    if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    if (url.pathname === "/healthz" || url.pathname === "/api/health") {
      return json(response, 200, {
        status: "ok",
        service: "grantdeskhq-prototype",
        environment: applicationEnvironment(),
        applicationRevision: applicationRevision(),
        deploymentRevision: deploymentRevision(),
        buildSourceRef: process.env.BUILD_SOURCE_REF?.trim() || "unknown",
        buildTimestampUtc: process.env.BUILD_TIMESTAMP_UTC?.trim() || "unknown"
      });
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
    if (url.pathname === "/api/gtm/outreach/reconcile") return await handleGtmOutreachReconcile(request, response);
    if (url.pathname === "/api/readiness-assessment") return await handleReadiness(request, response);
    if (url.pathname === "/api/feedback") return await handleFeedback(request, response);
    if (url.pathname === "/api/gtm/feedback") return await handleGtmFeedback(request, response);
    if (url.pathname === "/api/gtm/access") return await handleGtmAccess(request, response);
    if (url.pathname === "/api/gtm/opportunities") return await handleGtmOpportunities(request, response);
    if (url.pathname === "/api/gtm/daily-signals") return await handleGtmDailySignals(request, response);
    if (url.pathname === "/api/gtm/social") return await handleGtmSocial(request, response);
    if (url.pathname === "/api/gtm/award-signals") return await handleGtmAwardSignals(request, response);
    if (url.pathname === "/api/gtm/direct-discovery") return await handleGtmDirectDiscovery(request, response);
    if (url.pathname === "/api/gtm/direct-recipient-resolution") return await handleGtmDirectRecipientResolution(request, response);
    if (url.pathname === "/api/gtm/social-discovery/reconcile") return await handleGtmSocialDiscoveryReconcile(request, response);
    if (url.pathname === "/api/gtm/control-plane-queue") return await handleGtmControlPlaneQueue(request, response);
    if (url.pathname === "/api/gtm/overview") return await handleGtmOverview(request, response);
    if (url.pathname === "/api/gtm/canonical") return await handleGtmCanonical(request, response);
    if (url.pathname === "/api/gtm/instantly") return await handleGtmInstantly(request, response);
    if (url.pathname === "/api/gtm/instantly/stage") return await handleGtmInstantlyStage(request, response);
    if (url.pathname === "/api/gtm/instantly/controlled-batch") return await handleControlledInstantlyBatch(request, response);
    if (url.pathname === "/api/gtm/instantly/reconcile") return await handleInstantlyReconcile(request, response);
    if (url.pathname === "/api/gtm/instantly/ensure-lists") return await handleInstantlyEnsureLists(request, response);
    if (url.pathname === "/api/gtm/instantly/webhook") return await handleInstantlyWebhook(request, response);
    if (url.pathname === "/api/gtm/shadow-status") return await handleGtmShadowStatus(request, response);
    if (url.pathname === "/api/gtm/content-engine") return await handleGtmContentEngine(request, response);
    if (url.pathname === "/api/gtm/contact-enrichment") return await handleGtmContactEnrichment(request, response);
    if (url.pathname === "/api/gtm/contact-enrichment/batch") return await handleGtmContactEnrichmentBatch(request, response);
    if (url.pathname === "/api/gtm/contact-enrichment/reconcile") return await handleStoredContactEnrichmentReconcile(request, response);
    if (url.pathname === "/api/gtm/direct-sourcing-reconcile") return await handleStoredDirectDiscoveryReconcile(request, response);
    if (url.pathname === "/api/gtm/partner-reconciliation") return await handleScheduledPartnerHunterReconciliation(request, response);
    if (url.pathname === "/api/gtm/search-console/reconcile" || url.pathname === "/api/gtm/seo-reconciliation") return await handleSearchConsoleReconcile(request, response);
    if (url.pathname === "/api/gtm/search-console") return await handleSearchConsoleState(request, response);
    if (url.pathname === "/api/gtm/daily-scan") return await handleGtmDailyScan(request, response);
    if (url.pathname === "/api/gtm/sourcing-status") return await handleGtmSourcingStatus(request, response);
    if (url.pathname === "/api/gtm/inventory-autopilot/reconcile") return await handleGtmInventoryAutopilotReconcile(request, response);
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

async function handleGtmSocial(request: IncomingMessage, response: ServerResponse) {
  requireGtmAdmin(await requireUser(request));
  if (request.method !== "PATCH") return json(response, 405, { error: "Method not allowed." });
  const body = await readJson(request) as { id?: unknown; status?: unknown };
  const id = String(body.id || "");
  const status = String(body.status || "");
  if (!/^[a-z0-9_-]{3,160}$/i.test(id) || (status !== "RESPONDED" && status !== "SKIPPED")) return json(response, 400, { error: "A valid Social item and review status are required." });
  return json(response, 200, { scan: await updateGtmDailySocialItem(id, status) });
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

/** Scheduler-protected, human-confirmed ledger reconciliation. It sends no email. */
async function handleGtmOutreachReconcile(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  const outreach = await reconcileGtmOutreachLedger(confirmedHumanOutreach);
  const model = await readCanonicalGtmModel();
  return json(response, 200, {
    durable: true,
    outreach: summarizeOutreach(outreach),
    canonical: {
      directReady: model.metrics.directReady,
      partnerReady: model.metrics.partnerReady,
      awaitingReply: model.metrics.awaitingReply,
      followUpsDue: model.metrics.followUpsDue
    }
  });
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

async function handleGtmDirectDiscovery(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { scan: await readGtmDirectDiscoveryScan() });
}

/** Existing-inventory recipient resolution. This path is bounded and never discovers organizations. */
async function handleGtmDirectRecipientResolution(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  const scan = await readGtmDirectDiscoveryScan();
  if (!scan) return json(response, 200, { status: "no_existing_inventory", recipients: null, enrichment: null });
  const canonicalBefore = await readCanonicalGtmModel();
  const blocked = new Set(canonicalBefore.records.filter((record) => record.priorContact || record.suppressionStatus === "BLOCKED").map((record) => record.organizationId));
  const eligible = scan.opportunities.filter((opportunity) => !blocked.has(canonicalOrganizationId(opportunity.organization, domainFromUrl(opportunity.organizationUrl))));
  const resolved = await resolveDirectRecipients({ opportunities: eligible });
  const resolvedById = new Map(resolved.opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const merged = scan.opportunities.map((opportunity) => resolvedById.get(opportunity.id) || opportunity);
  const recipientsFound = resolved.resolutions.filter((item) => item.recipientFound).length;
  const officialPublishedEmails = resolved.resolutions.filter((item) => item.contactSource === "OFFICIAL_PUBLISHED").length;
  const executiveFallbackReview = resolved.resolutions.filter((item) => item.contactSource === "EXECUTIVE_FALLBACK_REVIEW").length;
  let saved = await saveGtmDirectDiscoveryScan({ ...scan, generatedAt: resolved.generatedAt, opportunities: merged, recipientResolutions: resolved.resolutions, telemetry: { ...scan.telemetry, lastScan: resolved.generatedAt, recipientsFound, officialPublishedEmails, executiveFallbackReview, mainBottleneck: recipientsFound ? "Authoritative recipient evidence was found; only verified finance or grants owners may proceed." : "No appropriate finance or grants operating owner was found in the existing qualified inventory." } });
  const enrichment = await runContactEnrichmentBatch({ segment: "direct", limit: 10, discoveredDirect: saved.opportunities, directOnly: true });
  const canonicalAfter = await readCanonicalGtmModel();
  const readyCreated = canonicalAfter.records.filter((record) => record.segment === "DIRECT" && record.state === "READY_TO_SEND" && saved.opportunities.some((opportunity) => opportunity.id === record.id)).length;
  const hunterByOrganization = new Map(enrichment.records.map((record) => [record.organization.toLowerCase(), record.hunterUsed]));
  saved = await saveGtmDirectDiscoveryScan({ ...saved, recipientResolutions: saved.recipientResolutions?.map((resolution) => ({ ...resolution, hunterUsed: hunterByOrganization.get(resolution.organization.toLowerCase()) || false })), telemetry: { ...saved.telemetry, hunterFinderCalls: enrichment.providerUsage.hunterLookups, hunterVerifierCalls: enrichment.providerUsage.hunterVerifications, verified: enrichment.verifiedEmails, readyCreated, mainBottleneck: readyCreated ? "Qualified Direct recipients passed the canonical readiness gates." : saved.telemetry.mainBottleneck } });
  return json(response, 200, { status: resolved.errors.length ? "partial" : "completed", recipients: resolved, enrichment, scan: saved });
}

/** Bounded Social-only scan for immediate validation without re-running Direct discovery. */
async function handleGtmSocialDiscoveryReconcile(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  const scan = await runDailySocialScan().then(saveGtmDailyScan);
  return json(response, 200, {
    status: scan.errors.length ? "partial" : "completed",
    scan,
    actionable: scan.items.filter((item) => item.status === "ACTIONABLE")
  });
}

async function handleGtmControlPlaneQueue(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { reconciliation: await readGtmControlPlaneReconciliation() });
}

async function handleGtmOverview(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  const [reconciliation, shadowStatus, usage, inventory] = await Promise.all([readGtmControlPlaneReconciliation(), readGtmShadowStatus(), readGtmEnrichmentUsage(), readGtmInventoryAutopilot()]);
  return json(response, 200, { overview: buildGtmOverview({ reconciliation, shadowStatus, usage, hunterLookupLimit: configuredPositiveInteger("HUNTER_MAX_LOOKUPS_PER_RUN", 2) }), inventory });
}

async function handleGtmCanonical(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { model: await readCanonicalGtmModel() });
}

/** Founder-safe status; it intentionally excludes API keys and raw payloads. */
async function handleGtmInstantly(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  const [records, persisted] = await Promise.all([readInstantlyRecords(), readInstantlyStatus()]);
  return json(response, 200, { health: instantlyHealth(), records, persisted });
}

/** Staging defaults to preview-only and cannot create a campaign membership. */
async function handleGtmInstantlyStage(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  const config = instantlyConfig();
  const model = await readCanonicalGtmModel();
  const outreach = await reconcileGtmOutreachLedger(confirmedHumanOutreach);
  const eligible = model.records.filter((record) => stagingEligibility(record, outreach, config).eligible);
  // Never write to Instantly while there is no verified API credential. The
  // returned preview is enough for founder review and produces no side effect.
  if (!config.apiKeyConfigured) return json(response, 200, { mode: "PREVIEW_ONLY", reason: "API_KEY_NOT_CONFIGURED", eligible: eligible.map((record) => ({ id: record.id, organization: record.organization, segment: record.segment })) });
  const staged = await Promise.all(eligible.map(async (record) => {
    const listId = record.segment === "DIRECT" ? config.directListId : config.partnerListId;
    if (!listId) throw new HttpError(409, `No ${record.segment.toLowerCase()} Instantly list mapping is configured.`);
    const [firstName, ...rest] = (record.contact || "").split(/\s+/);
    const result = await new InstantlyClient(config).createLeadInList({
      email: record.email || "", firstName: firstName || "", lastName: rest.join(" "), companyName: record.organization, listId,
      customVariables: { canonical_organization_id: record.organizationId, canonical_contact_id: `${record.organizationId}:${record.email}`, segment: record.segment, source: record.sourceUrl, why_now_or_fit: record.whyNow, message_version: "benefit-led-v1" }
    }) as { id?: string; lead_id?: string };
    const preview = instantlyPreviewRecord(record);
    const persisted = { ...preview, instantlyListId: listId, instantlyLeadId: String(result.id || result.lead_id || ""), instantlySyncStatus: "STAGED" as const, failureReason: "", updatedAt: new Date().toISOString() };
    await saveInstantlyRecord(persisted);
    return persisted;
  }));
  return json(response, 200, { mode: "STAGED_PENDING_APPROVAL", staged: staged.length, records: staged });
}

/** Founder-authorized, exact-cohort route. It is scheduler-authenticated, capped
 * at five contacts per segment, and does not share ordinary auto-handoff paths. */
async function handleControlledInstantlyBatch(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  const input = await readJson(request) as { batchId?: string; execute?: boolean; repairOpeningLines?: boolean; repairPartnerFirstTouches?: boolean };
  const batchId = String(input.batchId || "");
  if (!/^gdh-controlled-batch-\d{8}-\d{2}$/.test(batchId)) return json(response, 400, { error: "A valid controlled batch ID is required." });
  const config = instantlyConfig();
  const [model, outreach, existingRecords] = await Promise.all([readCanonicalGtmModel(), reconcileGtmOutreachLedger(confirmedHumanOutreach), readInstantlyRecords()]);
  const existingEmails = new Set(existingRecords.map((record) => record.email.toLowerCase()).filter(Boolean));
  const eligible = model.records.filter((record) => {
    const gate = record.state === "READY_TO_SEND" && Boolean(record.email && record.contact) && !record.priorContact && record.suppressionStatus === "CLEAR" && !existingEmails.has(String(record.email).toLowerCase());
    if (!gate) return false;
    return stagingEligibility(record, outreach, { ...config, directEnabled: true, partnerEnabled: true }).eligible;
  });
  const direct = eligible.filter((record) => record.segment === "DIRECT").slice(0, 5);
  const partner = eligible.filter((record) => record.segment === "PARTNER").slice(0, 5);
  const cohort = [...direct, ...partner];
  const client = config.apiKeyConfigured && config.integrationEnabled ? new InstantlyClient(config) : null;
  const campaignDetails = client ? await Promise.all([config.directCampaignId ? client.getCampaign(config.directCampaignId) : null, config.partnerCampaignId ? client.getCampaign(config.partnerCampaignId) : null]) : [null, null];
  const [leadInventory, approvedAccount] = client ? await Promise.all([client.listRecentLeads(200), client.getAccount("eli.katz@grantdeskhq.com")]) : [{ items: [], truncated: false }, null] as const;
  const campaignLeadCount = new Map<string, number>();
  for (const lead of leadInventory.items) {
    const id = instantlyLeadCampaignId(lead);
    if (id) campaignLeadCount.set(id, (campaignLeadCount.get(id) || 0) + 1);
  }
  const approvedSender = "eli.katz@grantdeskhq.com";
  const mailboxReady = Boolean(approvedAccount && Number(approvedAccount.status) === 1 && Number(approvedAccount.warmup_status) === 1 && approvedAccount.setup_pending !== true && !String(approvedAccount.e_message || "").trim());
  const selectedCampaigns = campaignDetails.filter((campaign, index): campaign is Record<string, unknown> => Boolean(campaign && (index === 0 ? direct.length > 0 : partner.length > 0)));
  const campaignConfigurationAllowed = selectedCampaigns.every((campaign) => Number(campaign.status) === 0 && campaignSenderAddresses(campaign).every((sender) => sender === approvedSender));
  const senderReady = Boolean(client && config.integrationEnabled && config.apiKeyConfigured && mailboxReady && selectedCampaigns.length > 0 && selectedCampaigns.every((campaign) => controlledCampaignReady(campaign, approvedSender)));
  const summary = (record: Awaited<typeof model>["records"][number]) => ({ organization: record.organization, person: record.contact, title: record.title, email: record.email, verification: record.verificationStatus, whyNowOrFit: record.whyNow, campaign: record.segment === "DIRECT" ? config.directCampaignId : config.partnerCampaignId, subject: controlledSubject(record), emailBody: controlledEmail(record) });
  if (input.repairOpeningLines === true) {
    if (!client || !config.controlledBatchEnabled || config.controlledBatchId !== batchId) return json(response, 409, { error: "This exact controlled batch is not enabled for copy repair." });
    const byId = new Map(model.records.map((record) => [record.organizationId, record]));
    const batchRecords = existingRecords.filter((record) => record.controlledBatchId === batchId && record.instantlyLeadId && (record.segment === "DIRECT" || record.segment === "PARTNER"));
    if (!batchRecords.length || batchRecords.length > 10) return json(response, 409, { error: "The exact controlled cohort could not be proven for copy repair." });
    const repaired = await Promise.all(batchRecords.map(async (record) => {
      const canonical = byId.get(record.canonicalOrganizationId);
      if (!canonical || canonical.email?.toLowerCase() !== record.email.toLowerCase() || canonical.priorContact || canonical.suppressionStatus !== "CLEAR") throw new HttpError(409, "A controlled cohort member no longer satisfies canonical safety checks.");
      await client.patchControlledLeadVariables(record.instantlyLeadId, { openingLine: controlledOpening(canonical) }, batchId);
      return { organization: record.organization, instantlyLeadId: record.instantlyLeadId };
    }));
    return json(response, 200, { mode: "CONTROLLED_COPY_REPAIRED", batchId, repaired });
  }
  if (input.repairPartnerFirstTouches === true) {
    if (!client || !config.controlledBatchEnabled || config.controlledBatchId !== batchId) return json(response, 409, { error: "This exact controlled batch is not enabled for Partner copy repair." });
    const partnerCampaignId = config.partnerCampaignId;
    const partnerCampaign = campaignDetails[1];
    if (!partnerCampaign || !partnerCampaignId || !campaignUsesOnlySender(partnerCampaign, approvedSender)) return json(response, 409, { error: "The mapped Partner campaign is not safe for this copy repair." });
    const byId = new Map(model.records.map((record) => [record.organizationId, record]));
    const partnerRecords = existingRecords.filter((record) => record.controlledBatchId === batchId && record.segment === "PARTNER" && record.instantlyLeadId && record.instantlyCampaignId === partnerCampaignId);
    if (partnerRecords.length !== 5) return json(response, 409, { error: "The exact five-member Partner cohort could not be proven." });
    const providerLeads = new Map(leadInventory.items.map((lead) => [String(lead.id || ""), lead]));
    const unsent = partnerRecords.filter((record) => !providerFirstCampaignStep(providerLeads.get(record.instantlyLeadId)));
    const alreadySent = partnerRecords.filter((record) => !unsent.includes(record));
    if (!unsent.length) return json(response, 200, { mode: "PARTNER_COPY_UNCHANGED_ALREADY_SENT", batchId, alreadySent: alreadySent.map((record) => ({ organization: record.organization, instantlyLeadId: record.instantlyLeadId })) });
    for (const record of unsent) {
      const canonical = byId.get(record.canonicalOrganizationId);
      if (!canonical || canonical.email?.toLowerCase() !== record.email.toLowerCase() || canonical.priorContact || canonical.suppressionStatus !== "CLEAR") throw new HttpError(409, "A Partner cohort member no longer satisfies canonical safety checks.");
      if (canonical.segment !== "PARTNER") throw new HttpError(409, "A non-Partner record cannot enter the Partner-only copy repair.");
    }
    await client.pauseControlledCampaign(partnerCampaignId, batchId);
    const paused = await client.getCampaign(partnerCampaignId);
    if (Number(paused.status) !== 2) return json(response, 409, { error: "The Partner campaign could not be paused for pre-send repair." });
    await client.configureControlledCampaign(partnerCampaignId, controlledCampaignPatch("PARTNER", 5, approvedSender), batchId);
    const configured = await client.getCampaign(partnerCampaignId);
    if (!controlledCampaignReady(configured, approvedSender, [2])) return json(response, 409, { error: "Partner campaign read-back did not satisfy sender, reply-stop, tracking, CTA, and safety requirements." });
    const repaired = await Promise.all(unsent.map(async (record) => {
      const canonical = byId.get(record.canonicalOrganizationId)!;
      const subjectLine = controlledSubject(canonical);
      const openingLine = controlledOpening(canonical);
      await client.patchControlledLeadVariables(record.instantlyLeadId, { openingLine, subjectLine }, batchId);
      const providerLead = await client.getLead(record.instantlyLeadId);
      const payload = providerLead.payload && typeof providerLead.payload === "object" && !Array.isArray(providerLead.payload) ? providerLead.payload as Record<string, unknown> : {};
      if (String(payload.openingLine || "") !== openingLine || String(payload.subjectLine || "") !== subjectLine) throw new HttpError(409, "Partner lead read-back did not preserve the personalized first-touch copy.");
      return { organization: record.organization, instantlyLeadId: record.instantlyLeadId, subjectLine, emailBody: controlledEmail(canonical) };
    }));
    await client.activateControlledCampaign(partnerCampaignId, batchId);
    const resumed = await client.getCampaign(partnerCampaignId);
    const resumedSummary = controlledCampaignSafetySummary(resumed);
    if (Number(resumed.status) !== 1 || !campaignUsesOnlySender(resumed, approvedSender) || !resumedSummary.stopOnReply || !resumedSummary.bounceProtectionEnabled || resumedSummary.openTracking || resumedSummary.linkTracking || Number(resumedSummary.dailyMaxLeads) !== 5) throw new HttpError(409, "Partner campaign did not resume with required safety controls.");
    return json(response, 200, { mode: "PARTNER_COPY_REPAIRED_BEFORE_SEND", batchId, repaired, alreadySent: alreadySent.map((record) => ({ organization: record.organization, instantlyLeadId: record.instantlyLeadId })), campaign: resumedSummary });
  }
  if (!input.execute) return json(response, 200, { mode: "PREFLIGHT", batchId, senderReady, campaignConfigurationAllowed, approvedSender, mailbox: approvedAccount ? { email: approvedAccount.email, status: approvedAccount.status, warmupStatus: approvedAccount.warmup_status, setupPending: approvedAccount.setup_pending === true, hasError: Boolean(String(approvedAccount.e_message || "").trim()), dailyLimit: approvedAccount.daily_limit ?? approvedAccount.warmup_limit ?? null } : null, flags: { integrationEnabled: config.integrationEnabled, outboundEnabled: config.outboundEnabled, autoHandoffEnabled: config.autoHandoffEnabled, directEnabled: config.directEnabled, partnerEnabled: config.partnerEnabled, controlledBatchEnabled: config.controlledBatchEnabled }, campaigns: campaignDetails.map((campaign) => campaign ? controlledCampaignSafetySummary(campaign) : null), proposedConfiguration: { direct: controlledCampaignPatch("DIRECT", 5, approvedSender), partner: controlledCampaignPatch("PARTNER", 5, approvedSender) }, campaignLeadCount: Object.fromEntries(campaignLeadCount), direct: direct.map(summary), partner: partner.map(summary), exclusions: { priorContact: model.records.filter((record) => record.priorContact).length, suppressed: model.records.filter((record) => record.suppressionStatus !== "CLEAR").length, existingInstantly: existingEmails.size } });
  if (!mailboxReady || !client || !campaignConfigurationAllowed) return json(response, 409, { error: "Approved mailbox or mapped inactive campaigns are not safe for a controlled batch." });
  if (!config.controlledBatchEnabled || config.controlledBatchId !== batchId) return json(response, 409, { error: "This exact controlled batch is not enabled." });
  if ((direct.length > 0 && campaignLeadCount.get(config.directCampaignId)) || (partner.length > 0 && campaignLeadCount.get(config.partnerCampaignId))) return json(response, 409, { error: "The selected campaign already contains leads; refusing to risk an outside-batch send." });
  const selectedCampaignConfigurations = await Promise.all([
    ...(direct.length > 0 ? [client.configureControlledCampaign(config.directCampaignId, controlledCampaignPatch("DIRECT", 5, approvedSender), batchId)] : []),
    ...(partner.length > 0 ? [client.configureControlledCampaign(config.partnerCampaignId, controlledCampaignPatch("PARTNER", 5, approvedSender), batchId)] : [])
  ]);
  void selectedCampaignConfigurations;
  const configuredCampaigns = await Promise.all([
    ...(direct.length > 0 ? [client.getCampaign(config.directCampaignId)] : []),
    ...(partner.length > 0 ? [client.getCampaign(config.partnerCampaignId)] : [])
  ]);
  if (!configuredCampaigns.every((campaign) => controlledCampaignReady(campaign, approvedSender))) return json(response, 409, { error: "Selected campaign read-back did not satisfy sender, reply-stop, tracking, CTA, and safety requirements." });
  const created = await Promise.all(cohort.map(async (record) => {
    const [firstName, ...rest] = String(record.contact || "").split(/\s+/);
    const campaignId = record.segment === "DIRECT" ? config.directCampaignId : config.partnerCampaignId;
    const provider = await client.createLeadInControlledCampaign({ email: record.email || "", firstName, lastName: rest.join(" "), companyName: record.organization, jobTitle: record.title || "", campaignId, personalization: controlledEmail(record), customVariables: { batch_id: batchId, canonical_organization_id: record.organizationId, canonical_contact_id: `${record.organizationId}:${record.email}`, segment: record.segment, source: record.sourceUrl, why_now_or_fit: record.whyNow, openingLine: controlledOpening(record), message_version: "controlled-benefit-led-v1" } }, batchId);
    const preview = instantlyPreviewRecord(record);
    const persisted = { ...preview, instantlyCampaignId: campaignId, instantlyLeadId: String(provider.id || provider.lead_id || ""), instantlySyncStatus: "IN_CAMPAIGN" as const, messageVersion: "controlled-benefit-led-v1", controlledBatchId: batchId, failureReason: "", updatedAt: new Date().toISOString() };
    await saveInstantlyRecord(persisted);
    return persisted;
  }));
  await Promise.all([...new Set(created.map((record) => record.instantlyCampaignId))].map((campaignId) => client.activateControlledCampaign(campaignId, batchId)));
  return json(response, 200, { mode: "HANDOFF_COMPLETE_AWAITING_PROVIDER_SEND", batchId, created: created.map((record) => ({ organization: record.organization, email: record.email, segment: record.segment, campaign: record.instantlyCampaignId, state: record.instantlySyncStatus })) });
}

function controlledSubject(record: Awaited<ReturnType<typeof readCanonicalGtmModel>>["records"][number]) {
  if (record.segment === "DIRECT") return "Less time preparing grant reports";
  return partnerFirstTouchCopy(record).subject;
}

function controlledEmail(record: Awaited<ReturnType<typeof readCanonicalGtmModel>>["records"][number]) {
  const first = String(record.contact || "there").split(/\s+/)[0];
  const context = controlledOpening(record);
  const value = record.segment === "DIRECT" ? "Preparing a funder report can mean pulling together award terms, accounting data, program updates, and supporting evidence from several places." : "GrantDeskHQ helps nonprofit teams pull the grant agreement, accounting data, program updates, and supporting evidence into a source-linked first draft of a funder report. Their team still reviews and submits it.";
  const partnerBridge = record.segment === "PARTNER" ? "\n\nThat can mean less repetitive report-prep work for the nonprofit clients you already support." : "";
  const close = record.segment === "DIRECT" ? "You can try it with one real award for free here: https://grantdeskhq.com/assessment" : "You can try it with one client award for free here: https://grantdeskhq.com/assessment";
  const product = record.segment === "DIRECT" ? "\n\nGrantDeskHQ turns those inputs into a source-linked first draft for human review. People remain responsible for the final review and submission." : "";
  return `Hi ${first},\n\n${context}\n\n${value}${partnerBridge}${product}\n\n${close}\n\nBest,\nEli`;
}

function controlledOpening(record: Awaited<ReturnType<typeof readCanonicalGtmModel>>["records"][number]) {
  return record.segment === "DIRECT"
    ? `I came across ${record.organization} and noticed this: ${lowercaseInitial(record.whyNow)} I thought this might be relevant.`
    : partnerFirstTouchCopy(record).opening;
}

function partnerFirstTouchCopy(record: Awaited<ReturnType<typeof readCanonicalGtmModel>>["records"][number]) {
  const copy: Record<string, { subject: string; opening: string }> = {
    "CFO for Good": { subject: "Less manual grant-report prep for clients", opening: "CFO for Good's outsourced finance work with nonprofits caught my attention. I thought GrantDeskHQ might be useful when one of the organizations you support is pulling a funder report together." },
    "Integrant Advisory": { subject: "For your nonprofit CFO clients", opening: "I was looking at Integrant's nonprofit CFO work, especially the finance and compliance side. I thought this might be relevant for a client with grant reporting on the horizon." },
    "Noble Accounting LLC": { subject: "A simpler grant-report workflow for clients", opening: "Noble's mix of nonprofit accounting, fractional CFO work, and audit readiness made me think of the grant-reporting work that can land on a client's finance team." },
    "Beancount.co": { subject: "Less manual work on client grant reports", opening: "I saw that Beancount supports nonprofit and social-sector teams with accounting and CFO work. I thought you might be interested in a lighter way to help a client assemble a grant report." },
    "Future Focused Solutions": { subject: "For nonprofits you support on grants", opening: "Future Focused Solutions' work across nonprofit accounting, fractional CFO support, and grants is close to the teams we built GrantDeskHQ for." }
  };
  return copy[record.organization] || { subject: "A simpler grant-report workflow for nonprofit clients", opening: `I was looking at ${record.organization}'s nonprofit finance work and thought this might be relevant.` };
}

function providerFirstCampaignStep(lead: Record<string, unknown> | undefined) {
  if (!lead) return "";
  const summary = lead.status_summary && typeof lead.status_summary === "object" ? lead.status_summary as Record<string, unknown> : {};
  const lastStep = summary.lastStep && typeof summary.lastStep === "object" ? summary.lastStep as Record<string, unknown> : {};
  const from = String(lead.last_step_from || lastStep.from || "").toLowerCase();
  const at = String(lead.last_step_timestamp_executed || lastStep.timestamp_executed || "");
  return from === "campaign" && at ? at : "";
}

function lowercaseInitial(value: string) { return value ? `${value.slice(0, 1).toLowerCase()}${value.slice(1)}` : "a relevant current signal."; }

function controlledCampaignPatch(segment: "DIRECT" | "PARTNER", maximum: number, sender: string) {
  const direct = segment === "DIRECT";
  const initialBody = direct
    ? "<div>Hi {{firstName}},</div><div><br /></div><div>{{openingLine}}</div><div><br /></div><div>Preparing a funder report can mean pulling together award terms, accounting data, program updates, and supporting evidence from several places.</div><div><br /></div><div>GrantDeskHQ turns those inputs into a source-linked first draft for human review. People remain responsible for the final review and submission.</div><div><br /></div><div>You can try it with one real award for free here: https://grantdeskhq.com/assessment</div><div><br /></div><div>Best,</div><div>Eli</div>"
    : "<div>Hi {{firstName}},</div><div><br /></div><div>{{openingLine}}</div><div><br /></div><div>GrantDeskHQ helps nonprofit teams pull the grant agreement, accounting data, program updates, and supporting evidence into a source-linked first draft of a funder report. Their team still reviews and submits it.</div><div><br /></div><div>That can mean less repetitive report-prep work for the nonprofit clients you already support.</div><div><br /></div><div>You can try it with one client award for free here: https://grantdeskhq.com/assessment</div><div><br /></div><div>Best,</div><div>Eli</div>";
  return {
    email_list: [sender], stop_on_reply: true, stop_on_auto_reply: true, disable_bounce_protect: false,
    open_tracking: false, link_tracking: false, daily_limit: maximum, daily_max_leads: maximum,
    sequences: [{ steps: [{ type: "email", delay: 0, delay_unit: "days", variants: [{ subject: direct ? "Less time preparing grant reports" : "{{subjectLine}}", body: initialBody, v_disabled: false }] }, { type: "email", delay: 4, delay_unit: "days", variants: [{ subject: direct ? "A simpler way to prep funder reports" : "A simpler way to prep client grant reports", body: "<div>Hi {{firstName}},</div><div><br /></div><div>Just following up in case this is useful. You can try one real award for free here: https://grantdeskhq.com/assessment</div><div><br /></div><div>Best,</div><div>Eli</div>", v_disabled: false }] }, { type: "email", delay: 5, delay_unit: "days", variants: [{ subject: direct ? "Worth trying on one award?" : "Worth trying with one client award?", body: "<div>Hi {{firstName}},</div><div><br /></div><div>One last note: GrantDeskHQ is designed to reduce the repetitive first-pass work of assembling a grant report. If useful, your first award is free: https://grantdeskhq.com/assessment</div><div><br /></div><div>Best,</div><div>Eli</div>", v_disabled: false }] }, { type: "email", delay: 7, delay_unit: "days", variants: [{ subject: direct ? "Closing the loop" : "Closing the loop on client grant reports", body: "<div>Hi {{firstName}},</div><div><br /></div><div>I will close the loop here. If grant-report preparation becomes a priority later, you can try one award free: https://grantdeskhq.com/assessment</div><div><br /></div><div>Best,</div><div>Eli</div>", v_disabled: false }] }] }]
  };
}

function controlledCampaignReady(campaign: Record<string, unknown>, sender: string, allowedStatuses = [0]) {
  const summary = controlledCampaignSafetySummary(campaign);
  const first = summary.firstEmailVariants.find((variant) => !variant.disabled);
  return allowedStatuses.includes(Number(summary.status)) && campaignUsesOnlySender(campaign, sender) && summary.stopOnReply && summary.bounceProtectionEnabled && !summary.openTracking && !summary.linkTracking && Number(summary.dailyMaxLeads) === 5 && Boolean(first?.body.includes("https://grantdeskhq.com/assessment") && first.body.toLowerCase().includes("free"));
}

/** Scheduler-protected reconciliation uses read-only API polling. Webhooks are
 * optional plan-dependent acceleration, not a correctness dependency. */
async function reconcileInstantlyPolling() {
  const health = instantlyHealth();
  if (!health.apiKeyConfigured || !health.integrationEnabled) {
    await saveInstantlyStatus({ ...health, checkedAt: new Date().toISOString(), reconciliation: "API_KEY_NOT_CONFIGURED" });
    return { mode: "PREVIEW_ONLY", health };
  }
  const client = new InstantlyClient();
  const [records, priorStatus] = await Promise.all([readInstantlyRecords(), readInstantlyStatus()]);
  const results = await Promise.allSettled([client.listLeadLists(), client.listCampaigns(), client.listAccounts(), client.listRecentLeads(200), client.listCampaignAnalytics(), client.listRecentEmails()]);
  const [lists, campaigns, accounts, leads, campaignAnalytics, recentEmails] = results.map((result) => result.status === "fulfilled" ? result.value : null);
  const model = await readCanonicalGtmModel();
  const leadItems = instantlyItems(leads);
  const canonicalByEmail = new Map(model.records.flatMap((record) => record.email ? [[record.email.toLowerCase(), record] as const] : []));
  const matched = leadItems.flatMap((lead) => canonicalByEmail.has(String(lead.email || "").toLowerCase()) ? [canonicalByEmail.get(String(lead.email || "").toLowerCase())!] : []);
  const priorContactExcluded = matched.filter((record) => record.priorContact).length;
  const duplicateEmails = leadItems.length - new Set(leadItems.map((lead) => String(lead.email || "").toLowerCase()).filter(Boolean)).size;
  const recordsByLead = new Map(records.filter((record) => record.instantlyLeadId).map((record) => [record.instantlyLeadId, record]));
  const recordsByEmail = new Map(records.filter((record) => record.email).map((record) => [record.email.toLowerCase(), record]));
  const transitions: Record<string, number> = {};
  let polledRecords = 0;
  for (const lead of leadItems) {
    const record = recordsByLead.get(String(lead.id || "")) || recordsByEmail.get(String(lead.email || "").toLowerCase());
    if (!record) continue;
    polledRecords++;
    const transition = reconcileInstantlyLead(record, lead);
    const providerChanged = transition.record.lastProviderUpdatedAt !== record.lastProviderUpdatedAt;
    if (transition.event || providerChanged) await saveInstantlyRecord(transition.record);
    if (transition.event) transitions[transition.event] = (transitions[transition.event] || 0) + 1;
    if (transition.suppressEmail && transition.record.email) await recordGtmContactSuppression(transition.record.email, [transition.suppressEmail], "instantly_polling");
  }
  const mappedCampaignIds = new Set([health.directCampaignId, health.partnerCampaignId].filter(Boolean));
  const analyticsItems = Array.isArray(campaignAnalytics) ? campaignAnalytics.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : instantlyItems(campaignAnalytics);
  const mappedAnalytics = analyticsItems.filter((item) => mappedCampaignIds.has(String(item.campaign_id || item.id || "")));
  const requiredErrors = results.slice(0, 5).flatMap((result, index) => result.status === "rejected" ? [`${["lead_lists", "campaigns", "accounts", "leads", "campaign_analytics"][index]}: ${result.reason instanceof Error ? result.reason.message : "request failed"}`] : []);
  const emailReadError = results[5]?.status === "rejected" ? (results[5].reason instanceof Error ? results[5].reason.message : "request failed") : "";
  const snapshot = {
    ...health,
    checkedAt: new Date().toISOString(),
    lastSuccessfulSync: requiredErrors.length ? String(priorStatus?.lastSuccessfulSync || "") : new Date().toISOString(),
    reconciliation: requiredErrors.length ? "PARTIAL" : "PASS",
    eventSync: "POLLING",
    pollingCadence: process.env.INSTANTLY_POLLING_SCHEDULE || "0 * * * *",
    webhookRequirement: "OPTIONAL",
    lists: instantSafeSummary(lists, ["id", "name", "timestamp_created"]),
    campaigns: instantSafeSummary(campaigns, ["id", "name", "status", "daily_limit", "daily_max_leads", "stop_on_reply", "stop_on_auto_reply", "timestamp_created"]),
    accounts: instantSafeSummary(accounts, ["email", "status", "warmup_status", "warmup_limit", "daily_limit", "setup_pending", "timestamp_created"]),
    leads: instantSafeSummary(leads, ["id", "email", "first_name", "last_name", "company_name", "campaign", "list_id", "status", "email_reply_count", "timestamp_updated", "last_step_timestamp_executed", "lt_interest_status"]),
    leadCount: leadItems.length,
    leadReadTruncated: Boolean(leads && typeof leads === "object" && (leads as { truncated?: boolean }).truncated),
    matchedCanonicalContacts: matched.length,
    previouslyContactedExcluded: priorContactExcluded,
    duplicatesPrevented: duplicateEmails,
    campaignAnalytics: mappedAnalytics.map((item) => Object.fromEntries(["campaign_id", "campaign_name", "campaign_status", "leads_count", "contacted_count", "emails_sent_count", "reply_count", "reply_count_unique", "reply_count_automatic", "bounced_count", "unsubscribed_count", "completed_count", "total_opportunities"].flatMap((field) => typeof item[field] === "string" || typeof item[field] === "number" || typeof item[field] === "boolean" ? [[field, item[field]]] : []))),
    polledRecords,
    transitions,
    replyContent: recentEmails ? "AVAILABLE" : "OPTIONAL_EMAILS_READ_REQUIRED",
    replyContentError: emailReadError || undefined,
    errors: requiredErrors
  };
  await saveInstantlyStatus(snapshot);
  return { mode: "READ_ONLY", status: snapshot };
}

async function handleInstantlyReconcile(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  return json(response, 200, await reconcileInstantlyPolling());
}

/** Creates only named storage lists—never a campaign, lead, or email. */
async function handleInstantlyEnsureLists(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  const config = instantlyConfig();
  if (!config.integrationEnabled || !config.apiKeyConfigured) return json(response, 409, { error: "Instantly API is not configured." });
  const client = new InstantlyClient();
  const existing = instantlyItems(await client.listLeadLists());
  const required = ["DIRECT — QUALIFIED", "PARTNERS — QUALIFIED"];
  const mappings: Record<string, string> = {};
  for (const name of required) {
    const match = existing.find((item) => item.name === name);
    const created = match || await client.createLeadList(name);
    const id = String(created.id || "");
    if (!id) throw new Error(`Instantly did not return an id for ${name}.`);
    mappings[name] = id;
  }
  await saveInstantlyStatus({ ...(await readInstantlyStatus() || {}), listMappings: mappings, listProvisionedAt: new Date().toISOString(), listProvisioning: "SAFE_STORAGE_ONLY" });
  return json(response, 200, { mode: "SAFE_STORAGE_ONLY", mappings });
}

/** Public only after cryptographic verification; replayed event ids are ignored. */
async function handleInstantlyWebhook(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  const secret = process.env.INSTANTLY_WEBHOOK_SECRET || "";
  const payload = await readBody(request);
  const signed = verifyInstantlyWebhookSignature(payload, String(request.headers["x-instantly-signature"] || request.headers["x-webhook-signature"] || ""), secret);
  const staticToken = verifyInstantlyWebhookToken(String(request.headers["x-grantdeskhq-webhook-token"] || ""), secret);
  if (!signed && !staticToken) return json(response, 401, { error: "Webhook authorization is invalid." });
  let event;
  try { event = normalizeInstantlyWebhook(JSON.parse(payload.toString("utf8"))); } catch { event = null; }
  if (!event) return json(response, 400, { error: "Webhook payload is invalid." });
  if (!await saveInstantlyWebhookEvent(event)) return json(response, 200, { received: true, duplicate: true });
  const records = await readInstantlyRecords();
  const record = records.find((item) => (event.instantlyLeadId && item.instantlyLeadId === event.instantlyLeadId) || (event.email && item.email === event.email));
  if (record) await saveInstantlyRecord(applyInstantlyEvent(record, event));
  if (event.type === "BOUNCE" && event.email) await recordGtmContactSuppression(event.email, ["hard_bounce"], "instantly_webhook");
  if (event.type === "UNSUBSCRIBE" && event.email) await recordGtmContactSuppression(event.email, ["unsubscribe"], "instantly_webhook");
  return json(response, 200, { received: true, matched: Boolean(record) });
}

async function handleGtmShadowStatus(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  requireGtmAdmin(await requireUser(request));
  return json(response, 200, { status: await readGtmShadowStatus() });
}

async function handleGtmContentEngine(request: IncomingMessage, response: ServerResponse) {
  requireGtmAdmin(await requireUser(request));
  if (request.method === "GET") return json(response, 200, { state: await readGtmContentEngineState() });
  if (request.method !== "PATCH") return json(response, 405, { error: "Method not allowed." });
  const input = await readJson(request) as { kind?: "opportunity" | "draft" | "distribution"; id?: string; status?: string; updates?: { title?: string; metaDescription?: string; body?: string; ctaCopy?: string } };
  if (!input.kind || !input.id || !/^[a-z0-9_-]{3,160}$/i.test(input.id)) return json(response, 400, { error: "A valid content record action is required." });
  const state = await readGtmContentEngineState();
  if (!state) return json(response, 409, { error: "Content opportunities have not been generated yet." });
  const updated = input.kind === "draft" && input.updates
    ? editContentDraft(state, input.id, input.updates)
    : input.status ? updateContentEngineState(state, { kind: input.kind, id: input.id, status: input.status })
      : null;
  if (!updated) return json(response, 400, { error: "A content status or draft update is required." });
  return json(response, 200, { state: await saveGtmContentEngineState(updated) });
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

/** Re-evaluate the current bounded public Direct inventory from stored provider data only. */
async function handleStoredDirectDiscoveryReconcile(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  const scan = await readGtmDirectDiscoveryScan();
  const reconciliation = await reconcileStoredContactEnrichmentBatch({ segment: "direct", limit: 20, discoveredDirect: scan?.opportunities || [], directOnly: true });
  if (!scan) return json(response, 200, { reconciliation, scan: null });
  const canonical = await readCanonicalGtmModel();
  const sourceUrls = new Set(scan.opportunities.map((opportunity) => opportunity.evidence[0]?.url || opportunity.organizationUrl));
  const readyCreated = canonical.records.filter((record) => record.segment === "DIRECT" && record.state === "READY_TO_SEND" && sourceUrls.has(record.sourceUrl)).length;
  const telemetry = {
    ...scan.telemetry,
    readyCreated,
    mainBottleneck: readyCreated ? "Qualified candidates passed the canonical readiness gates." : "No qualified, never-contacted discovery record currently has an appropriate finance or grants operating owner with verified contact evidence."
  };
  const saved = await saveGtmDirectDiscoveryScan({ ...scan, telemetry });
  return json(response, 200, { reconciliation, scan: saved });
}

async function handleScheduledPartnerHunterReconciliation(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  // Provider evidence must be applied before inventory is evaluated: a Partner
  // already staged, scheduled, or sent is consumed inventory, never Ready.
  const instantly = await reconcileInstantlyPolling();
  const before = await readCanonicalGtmModel();
  const decision = inventoryDecision("partner", before.metrics.partnerReady);
  let discovery = await readGtmPartnerDiscoveryScan();
  let partner = null;
  if (decision.triggered) {
    const knownDomains = before.records.filter((record) => record.segment === "PARTNER").map((record) => record.organizationDomain);
    const priorContactDomains = before.records.filter((record) => record.segment === "PARTNER" && record.priorContact).map((record) => record.organizationDomain);
    try { discovery = await runPartnerPublicDiscovery({ knownDomains, priorContactDomains, maximum: 25 }).then(saveGtmPartnerDiscoveryScan); }
    catch (error) { console.error("GTM_PARTNER_DISCOVERY", error); }
    const limit = boundedEnrichmentLimit("partner", before.metrics.partnerReady, Math.min(configuredPositiveInteger("HUNTER_MAX_LOOKUPS_PER_RUN", 10), 10));
    if (limit > 0) partner = await runContactEnrichmentBatch({ segment: "partner", limit, discoveredPartner: discovery?.opportunities || [] });
  }
  const stored = await reconcileStoredContactEnrichmentBatch({ segment: "partner", limit: 20, discoveredPartner: discovery?.opportunities || [] });
  console.info("GTM_HUNTER_BATCH " + JSON.stringify(partner ? { segment: partner.segment, attempted: partner.attempted, contactsResolved: partner.contactsResolved, verifiedEmails: partner.verifiedEmails, ready: partner.ready, needsVerification: partner.needsVerification, alreadyContacted: partner.alreadyContacted, duplicates: partner.duplicates, failures: partner.failures, providerUsage: partner.providerUsage } : { segment: "partner", skipped: "HEALTHY_READY_INVENTORY" }));
  const inventory = await persistInventoryAutopilot();
  return json(response, 200, { decision, discovery, partner, stored, instantly, inventory });
}

async function handleSearchConsoleReconcile(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  const state = await saveSearchConsoleState(await reconcileSearchConsole());
  const contentReplenishment = reconcileContentInventory(await readGtmContentEngineState());
  const content = await saveGtmContentEngineState(contentReplenishment.state);
  console.info("SEARCH_CONSOLE_RECONCILE " + JSON.stringify({ analyticsStatus: state.analyticsStatus, pages: state.ranges.last28Days?.pages.length || 0, queries: state.ranges.last28Days?.queries.length || 0, sitemap: state.sitemap.result, dataThrough: state.dataThrough, errors: state.errors }));
  const inventory = await persistInventoryAutopilot();
  return json(response, 200, { state, content, contentReplenishment: { decision: contentReplenishment.decision, generated: contentReplenishment.generated, supplyConstrained: contentReplenishment.supplyConstrained, bottleneck: contentReplenishment.bottleneck }, inventory });
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
  // Reconcile provider state first so Ready is a post-reconciliation canonical
  // count. This is a bounded Instantly read and cannot hand off or send a lead.
  try { await reconcileInstantlyPolling(); }
  catch (error) { errors.push(error instanceof Error ? error.message : "Instantly reconciliation failed before Direct inventory evaluation."); }
  const before = await readCanonicalGtmModel();
  const directDecision = inventoryDecision("direct", before.metrics.directReady);
  let awardScan;
  if (before.metrics.directReady < GTM_INVENTORY_POLICY.direct.target) {
    try { awardScan = await runDailyAwardScan().then(saveGtmAwardScan); }
    catch (error) { errors.push(error instanceof Error ? error.message : "Award scan failed."); }
  }
  const opportunities = awardScan?.opportunities || [];
  let directDiscovery;
  if (before.metrics.directReady < GTM_INVENTORY_POLICY.direct.target) try {
    directDiscovery = await runDirectPublicDiscovery({
      knownOrganizationIds: before.records.map((record) => record.organizationId),
      priorContactOrganizationIds: before.records.filter((record) => record.priorContact).map((record) => record.organizationId),
      suppressedDomains: before.records.filter((record) => record.suppressionStatus === "BLOCKED").map((record) => record.organizationDomain)
    });
    directDiscovery = { ...directDiscovery, sourceRegistry: directDiscovery.sourceRegistry.map((source) => source.name === "USAspending recent federal awards" ? { ...source, status: awardScan ? "PASS" : "ERROR", lastSuccess: awardScan ? directDiscovery!.generatedAt : null } : source) };
    directDiscovery = await saveGtmDirectDiscoveryScan(directDiscovery);
  } catch (error) { errors.push(error instanceof Error ? error.message : "Public Direct discovery could not be saved."); }
  const directOpportunities = directDiscovery?.opportunities || [];
  let reconciliation;
  if (awardScan || directDiscovery) {
    try { reconciliation = await reconcileAndSaveControlPlane([...initialOpportunities, ...opportunities, ...directOpportunities]); }
    catch (error) { errors.push(error instanceof Error ? error.message : "GTM Control Plane reconciliation could not be saved."); }
  }
  let shadowStatus;
  try { shadowStatus = await saveGtmShadowStatus(buildShadowStatus(opportunities.map(shadowLeadFromOpportunity), suggestedTopicsFromLeads(opportunities.map(shadowLeadFromOpportunity)))); }
  catch (error) { errors.push(error instanceof Error ? error.message : "GTM shadow status could not be saved."); }
  let social;
  const priorSocial = await readGtmDailyScan();
  try { social = await runDailySocialScan(new Date(), socialDiscoveryBreadth((priorSocial?.items || []).filter((item) => item.status === "ACTIONABLE").length)).then(saveGtmDailyScan); }
  catch (error) { errors.push(error instanceof Error ? error.message : "Social scan failed."); }
  // Reuse the established daily GTM runtime for bounded Direct replenishment.
  // The batch suppresses contacted organizations before a provider call and
  // never discovers a new cohort or sends a message.
  let directReplenishment;
  try {
    const canonical = await readCanonicalGtmModel();
    const ready = canonical.metrics.directReady;
    const configuredLimit = Math.min(configuredPositiveInteger("HUNTER_MAX_LOOKUPS_PER_RUN", 10), 10);
    const limit = boundedEnrichmentLimit("direct", ready, configuredLimit);
    if (limit > 0) {
      directReplenishment = await runContactEnrichmentBatch({ segment: "direct", limit, discoveredDirect: [...opportunities, ...directOpportunities] });
      if (directDiscovery) {
        directDiscovery = await saveGtmDirectDiscoveryScan({ ...directDiscovery, telemetry: {
          ...directDiscovery.telemetry,
          hunterFinderCalls: directReplenishment.providerUsage.hunterLookups,
          hunterVerifierCalls: directReplenishment.providerUsage.hunterVerifications,
          verified: directReplenishment.verifiedEmails,
          provisionallyVerified: directReplenishment.verifiedEmails,
          readyCreated: (await readCanonicalGtmModel()).records.filter((record) => record.segment === "DIRECT" && record.state === "READY_TO_SEND" && directDiscovery!.opportunities.some((opportunity) => opportunity.id === record.id)).length,
          mainBottleneck: (await readCanonicalGtmModel()).records.some((record) => record.segment === "DIRECT" && record.state === "READY_TO_SEND" && directDiscovery!.opportunities.some((opportunity) => opportunity.id === record.id)) ? "Qualified candidates passed every canonical readiness gate." : directReplenishment.records.find((record) => record.failureReason)?.failureReason || directDiscovery.telemetry.mainBottleneck
        } });
      }
      console.info("GTM_HUNTER_DIRECT_REPLENISHMENT " + JSON.stringify({ attempted: directReplenishment.attempted, ready: directReplenishment.ready, needsVerification: directReplenishment.needsVerification, alreadyContacted: directReplenishment.alreadyContacted, providerUsage: directReplenishment.providerUsage }));
    }
  } catch (error) { errors.push(error instanceof Error ? error.message : "Direct replenishment could not be completed."); }
  const inventory = await persistInventoryAutopilot();
  return json(response, 200, {
    status: errors.length ? "partial" : "completed",
    generatedAt: new Date().toISOString(),
    socialItemCount: social?.items.filter((item) => item.status === "ACTIONABLE").length || 0,
    socialResearchMode: "HUMAN_REVIEW_ONLY",
    socialTelemetry: social ? { sourcesChecked: social.sourceCount, itemsExamined: social.itemsExamined, itemsQualified: social.itemsQualified, itemsSuppressed: social.itemsSuppressed, errors: social.errors } : null,
    awardCandidateCount: awardScan?.opportunities.length || null,
    directDiscovery: directDiscovery || null,
    controlPlaneCardCount: reconciliation?.cards.length || null,
    controlPlaneUniqueOrganizationCount: reconciliation?.uniqueOrganizations || null,
    shadowMode: "SHADOW",
    shadowStatus: shadowStatus || null,
    directReplenishment: directReplenishment || null,
    directDecision,
    inventory,
    errors
  });
}

/** Scheduler-protected, read-only telemetry for runtime validation and System Health. */
async function handleGtmSourcingStatus(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  const [direct, social, awards, canonical] = await Promise.all([readGtmDirectDiscoveryScan(), readGtmDailyScan(), readGtmAwardScan(), readCanonicalGtmModel()]);
  return json(response, 200, { direct, social, awards, canonical: { metrics: canonical.metrics, records: canonical.records.filter((record) => record.segment === "DIRECT") } });
}

/** Scheduler-authenticated, calculation-only inventory refresh. It intentionally
 * performs no public research, enrichment, Instantly action, publishing, or posting. */
async function handleGtmInventoryAutopilotReconcile(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." });
  await requireGtmScheduler(request);
  return json(response, 200, { inventory: await persistInventoryAutopilot() });
}

/** One durable, founder-readable inventory snapshot. This function never
 * discovers, enriches, stages, sends, publishes, or posts. */
async function persistInventoryAutopilot(): Promise<InventoryAutopilotSnapshot> {
  const [canonical, directScan, partnerScan, content, social] = await Promise.all([
    readCanonicalGtmModel(), readGtmDirectDiscoveryScan(), readGtmPartnerDiscoveryScan(), readGtmContentEngineState(), readGtmDailyScan()
  ]);
  const directDecision = inventoryDecision("direct", canonical.metrics.directReady);
  const partnerDecision = inventoryDecision("partner", canonical.metrics.partnerReady);
  const contentReady = (content?.drafts || []).filter((draft) => draft.status === "READY_FOR_REVIEW").length;
  const contentDecision = inventoryDecision("content", contentReady);
  const socialActionable = (social?.items || []).filter((item) => item.status === "ACTIONABLE").length;
  const socialBreadth = socialDiscoveryBreadth(socialActionable);
  const snapshot: InventoryAutopilotSnapshot = {
    generatedAt: new Date().toISOString(),
    direct: { decision: directDecision, replenishmentTriggered: directDecision.triggered, supplyConstrained: directDecision.triggered && Boolean(directScan && directScan.telemetry.readyCreated === 0), bottleneck: directScan?.telemetry.mainBottleneck || "Awaiting the next daily Direct inventory evaluation.", telemetry: { rawCandidates: directScan?.telemetry.rawCandidatesExamined ?? null, qualified: directScan?.telemetry.qualified ?? null, readyCreated: directScan?.telemetry.readyCreated ?? null, hunterFinder: directScan?.telemetry.hunterFinderCalls ?? null, hunterVerifier: directScan?.telemetry.hunterVerifierCalls ?? null } },
    partner: { decision: partnerDecision, replenishmentTriggered: partnerDecision.triggered, supplyConstrained: partnerDecision.triggered && Boolean(partnerScan && partnerScan.qualified === 0), bottleneck: partnerScan?.mainBottleneck || "Awaiting the next daily Partner inventory evaluation.", telemetry: { rawCandidates: partnerScan?.rawCandidatesExamined ?? null, qualified: partnerScan?.qualified ?? null, priorContactRemoved: partnerScan?.priorContactRemoved ?? null } },
    content: { decision: contentDecision, replenishmentTriggered: contentDecision.triggered, supplyConstrained: contentDecision.triggered && Boolean(content && !content.opportunities.some((item) => item.status === "OPPORTUNITY" && item.recommendedAction === "NEW")), bottleneck: contentDecision.triggered ? "Founder review inventory is below its operating floor." : "Founder review inventory is healthy.", telemetry: { activeReadyForReview: contentReady, activeDrafts: content?.drafts.length ?? 0 } },
    social: { actionable: socialActionable, preferredFloor: GTM_INVENTORY_POLICY.social.preferredFloor, targetRange: [GTM_INVENTORY_POLICY.social.targetMin, GTM_INVENTORY_POLICY.social.targetMax], breadth: socialBreadth, state: !social ? "BLOCKED" : socialActionable < GTM_INVENTORY_POLICY.social.preferredFloor ? "SUPPLY_CONSTRAINED" : "HEALTHY", bottleneck: social?.coverage || "Awaiting the next daily Social scan.", telemetry: { queries: social?.queryCount ?? null, urlsChecked: social?.searchResultsReturned ?? social?.sourceCount ?? null, discussionsExamined: social?.itemsExamined ?? null, stale: social?.itemsStale ?? null, irrelevant: social?.itemsIrrelevant ?? null, duplicates: social?.itemsDuplicate ?? null, respondedSkipped: social?.itemsRespondedSkipped ?? null } },
    safeguards: { autoHandoff: false, contentAutoPublish: false, socialAutoPost: false }
  };
  return saveGtmInventoryAutopilot(snapshot);
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
    if (clientApplicationRoutes.has(normalizedRoute) || /^\/gtm\/seo\/content\/[a-z0-9_-]{3,160}$/i.test(normalizedRoute)) {
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
