import { InstantlyApiError, InstantlyClient, instantlyConfig, redactedInstantlyDiagnostic } from "./instantly.ts";
import { listGtmChannelSeeds, listGtmScannerRecoveryCohorts, reserveGtmChannelSeedEnrichmentSubmission, saveGtmChannelSeed, type GtmScannerRecoveryCohort } from "./persistence.ts";
import { recordInstantlyVerifiedGtmContact } from "./contactEnrichment.ts";
import { scannerScrapeGraphPageLimit } from "./gtmScrapeGraphEnrichment.ts";
import type { ChannelSeedRecord } from "../src/lib/gtmChannelSeeds.ts";

export type ChannelSeedEnrichmentSegment = "DIRECT" | "PARTNER";
const titles: Record<ChannelSeedEnrichmentSegment, string[]> = {
  DIRECT: ["CFO", "Finance Director", "Controller", "Director of Grants", "Grants Manager", "Director of Institutional Giving"],
  PARTNER: ["Founder", "CEO", "Managing Partner", "Nonprofit Practice Lead", "Partner", "Principal"]
};
export interface ChannelSeedEnrichmentResult { segment: ChannelSeedEnrichmentSegment; selected: number; previewCount: number | null; submitted: number; resourceId: string | null; providerStatus: string | null; blocked: string | null; }

/** Safe aggregate telemetry for the scheduler and System Health. It contains
 * no organization, contact, source URL, provider ID, or provider payload. */
export function summarizeChannelSeedLifecycle(seeds: ReadonlyArray<Pick<ChannelSeedRecord, "segment" | "lifecycle" | "enrichmentProviderStatus" | "rejectionReason">>) {
  const freshCounts = () => ({ total: 0, lifecycle: {} as Record<string, number>, providerStatus: {} as Record<string, number>, terminalReason: {} as Record<string, number> });
  const direct = freshCounts();
  const partner = freshCounts();
  const increment = (target: ReturnType<typeof freshCounts>, key: "lifecycle" | "providerStatus" | "terminalReason", value: string | null | undefined) => {
    if (!value) return;
    target[key][value] = (target[key][value] || 0) + 1;
  };
  for (const seed of seeds) {
    if (seed.segment !== "DIRECT" && seed.segment !== "PARTNER") continue;
    const target = seed.segment === "DIRECT" ? direct : partner;
    target.total += 1;
    increment(target, "lifecycle", seed.lifecycle);
    increment(target, "providerStatus", seed.enrichmentProviderStatus);
    if (seed.lifecycle === "ENRICHMENT_FAILED" || seed.lifecycle === "CONTACT_UNRESOLVED" || seed.lifecycle === "REJECTED") increment(target, "terminalReason", seed.rejectionReason);
  }
  return { total: direct.total + partner.total, direct, partner };
}

/** Idempotent contact enrichment. ScrapeGraphAI remains an evidence extractor,
 * but a public site without a published role-fit email must not serialize the
 * provider-backed work-email route. Instantly SuperSearch is therefore the
 * preferred volume contact source for every evidence-qualified organization;
 * neither provider can touch campaigns here. */
export async function enrichChannelSeedsWithInstantly(segment: ChannelSeedEnrichmentSegment, env: NodeJS.ProcessEnv = process.env): Promise<ChannelSeedEnrichmentResult> {
  const config = instantlyConfig(env);
  const allSeeds = await normalizePersistedProviderNoResultSeeds(await listGtmChannelSeeds());
  const cohorts = await listGtmScannerRecoveryCohorts();
  const recoveryVersion = superSearchAccessRecoveryVersion(env);
  const eligible = prioritizeChannelSeedEnrichmentCandidates(allSeeds, cohorts, segment, recoveryVersion);
  const seeds = eligible.slice(0, superSearchBatchLimit(env));
  if (!config.integrationEnabled || !config.apiKeyConfigured) return { segment, selected: seeds.length, previewCount: null, submitted: 0, resourceId: null, providerStatus: null, blocked: "INSTANTLY_NOT_CONFIGURED" };
  const listId = segment === "DIRECT" ? config.directListId : config.partnerListId;
  if (!listId) return { segment, selected: seeds.length, previewCount: null, submitted: 0, resourceId: null, providerStatus: null, blocked: "MISSING_SEGMENT_LIST" };
  if (!seeds.length) return { segment, selected: 0, previewCount: 0, submitted: 0, resourceId: null, providerStatus: null, blocked: null };
  const client = new InstantlyClient(config, env.INSTANTLY_API_KEY || "");
  let allowance: number | null;
  try { allowance = superSearchAvailableCredits(await client.getWorkspaceBillingPlanDetails()); }
  catch (error) {
    if (superSearchAccessDenied(error)) return blockSuperSearchAccess(allSeeds, recoveryVersion, error, null, segment);
    throw error;
  }
  if (allowance === null || allowance < 1) return blockSuperSearchAccess(allSeeds, recoveryVersion, null, allowance, segment);
  const permitted = superSearchSubmissionLimit(seeds.length, allowance, env);
  const previewSeeds = seeds.slice(0, permitted);
  const previewNames = previewSeeds.map((seed) => seed.organization);
  let preview: { number_of_leads?: number; number_of_redacted_results?: number };
  try {
    // Preview is read-only, so a transient failure here never creates an
    // immutable provider-submission claim and can use the normal scheduler
    // retry path.
    preview = await client.previewSuperSearch({ companyNames: previewNames, titles: titles[segment], limit: previewNames.length });
  } catch (error) {
    if (superSearchAccessDenied(error)) return blockSuperSearchAccess(allSeeds, recoveryVersion, error, allowance, segment);
    throw error;
  }
  const limitedSeeds: typeof seeds = [];
  for (const seed of previewSeeds) {
    const claim = await reserveGtmChannelSeedEnrichmentSubmission({ seedId: seed.id, segment, recoveryVersion, provider: "instantly_supersearch" });
    if (claim.acquired) limitedSeeds.push(seed);
  }
  if (!limitedSeeds.length) return { segment, selected: 0, previewCount: Number(preview.number_of_leads || 0), submitted: 0, resourceId: null, providerStatus: "ALREADY_CLAIMED", blocked: null };
  const names = limitedSeeds.map((seed) => seed.organization);
  let response: { id?: string; resource_id?: string; background_job_id?: string | null; status?: string };
  try {
    response = await client.enrichSuperSearch({ companyNames: names, titles: titles[segment], listId, limit: names.length, searchName: `GrantDeskHQ ${segment} channel seeds 2026-08-28` });
  } catch (error) {
    if (superSearchAccessDenied(error)) return blockSuperSearchAccess(allSeeds, recoveryVersion, error, allowance, segment);
    const now = new Date().toISOString();
    const detail = redactedInstantlyDiagnostic(error instanceof Error ? error.message : "Instantly SuperSearch submission response was unavailable.");
    await Promise.all(limitedSeeds.map((seed) => saveGtmChannelSeed({ ...seed, lifecycle: "ENRICHMENT_BLOCKED", rejectionReason: "INSTANTLY_SUPERSEARCH_AMBIGUOUS_SUBMISSION", enrichmentProvider: "instantly_supersearch", enrichmentProviderStatus: "BLOCKED", enrichmentResult: "The provider submission response was ambiguous. The immutable submission claim prevents a duplicate request; reconcile provider evidence or use a reviewed new recovery generation before retrying.", enrichmentLastCheckedAt: now, enrichmentLastProviderError: detail, enrichmentAccessRecoveryVersion: recoveryVersion, enrichmentUpdatedAt: now })));
    return { segment, selected: limitedSeeds.length, previewCount: null, submitted: 0, resourceId: null, providerStatus: "AMBIGUOUS", blocked: "INSTANTLY_SUPERSEARCH_AMBIGUOUS_SUBMISSION" };
  }
  const enrichmentOperationId = String(response.id || "").trim() || null;
  const enrichmentBackgroundJobId = String(response.background_job_id || "").trim() || null;
  const resourceId = String(response.resource_id || listId).trim() || listId;
  const now = new Date().toISOString();
  await Promise.all(limitedSeeds.map((seed) => saveGtmChannelSeed({ ...seed, lifecycle: "ENRICHMENT_SUBMITTED", enrichmentProvider: "instantly_supersearch", enrichmentResult: `Submitted to Instantly SuperSearch; preview matched ${Number(preview.number_of_leads || 0)} candidate contact(s). Provider verification and role reconciliation remain required before any handoff.`, enrichmentResourceId: resourceId, enrichmentOperationId, enrichmentBackgroundJobId, enrichmentJobId: enrichmentBackgroundJobId, enrichmentProviderStatus: "SUBMITTED", enrichmentSubmittedAt: now, enrichmentLastCheckedAt: now, enrichmentAttemptCount: (seed.enrichmentAttemptCount || 0) + 1, enrichmentLastProviderError: null, enrichmentAccessRecoveryVersion: recoveryVersion, enrichmentTerminalAt: null, enrichmentUpdatedAt: now })));
  return { segment, selected: limitedSeeds.length, previewCount: Number(preview.number_of_leads || 0), submitted: limitedSeeds.length, resourceId, providerStatus: String(response.status || "") || null, blocked: null };
}


export async function reconcileChannelSeedEnrichment(segment: ChannelSeedEnrichmentSegment, env: NodeJS.ProcessEnv = process.env) {
  const config = instantlyConfig(env);
  const seeds = (await normalizePersistedProviderNoResultSeeds(await listGtmChannelSeeds())).filter((seed) => seed.segment === segment && seed.lifecycle === "ENRICHMENT_SUBMITTED");
  const result = { segment, reconciled: 0, verified: 0, pending: seeds.length, neverSubmitted: 0, processing: 0, completedButUnreconciled: 0, providerRejected: 0, rateLimited: 0, missingProviderObject: 0, stale: 0, failed: 0 };
  if (!config.integrationEnabled || !config.apiKeyConfigured || !seeds.length) return result;
  const client = new InstantlyClient(config, env.INSTANTLY_API_KEY || "");
  const listId = segment === "DIRECT" ? config.directListId : config.partnerListId;
  const listed = await client.listAllLeadsInList(listId);
  const leads = listed.items;
  const now = new Date().toISOString();
  for (const seed of seeds) {
    const lead = leads.find((item) => roleFits(segment, text(item.job_title)) && text(item.email) && (norm(text(item.company_name)) === norm(seed.organization) || norm(text(item.company_domain)) === norm(seed.organizationDomain || "")));
    if (lead && providerLeadIsVerified(lead)) {
      const email = text(lead.email); const firstName = text(lead.first_name) || "Contact"; const lastName = text(lead.last_name) || "Research";
      try {
        await recordInstantlyVerifiedGtmContact({ organization: seed.organization, organizationDomain: seed.organizationDomain!, domainSourceUrl: seed.sourceUrl, person: { firstName, lastName, fullName: `${firstName} ${lastName}`.trim(), currentTitle: text(lead.job_title), titleSourceUrl: seed.sourceUrl, responsibilityEvidence: "Instantly SuperSearch returned a role-fit provider-verified contact." } }, email, text(lead.id), seed.sourceUrl);
        await saveGtmChannelSeed({ ...seed, lifecycle: "VERIFIED", enrichmentResult: "Instantly returned a role-fit contact with a verified, non-catch-all business email; final suppression, deduplication, content, and campaign gates remain required.", enrichmentProviderStatus: "COMPLETED", enrichmentLastCheckedAt: now, enrichmentLastProviderError: null, enrichmentUpdatedAt: now });
        result.reconciled += 1; result.verified += 1; continue;
      } catch (error) {
        await markTerminal(seed, "CANONICAL_CONTACT_GATE_REJECTED", "FAILED", now, safeError(error)); result.providerRejected += 1; result.failed += 1; continue;
      }
    }
    if (lead && [-1, -2, -3, -4].includes(Number(lead.verification_status))) {
      await markTerminal(seed, "PROVIDER_EMAIL_NOT_VERIFIED", "FAILED", now); result.providerRejected += 1; result.failed += 1; continue;
    }
    const provider = superSearchProviderReferences(seed);
    if (!provider.resourceId) { result.neverSubmitted += 1; continue; }
    try {
      const resource = await client.getSuperSearchEnrichment(provider.resourceId);
      const background = provider.backgroundJobId ? await client.getBackgroundJob(provider.backgroundJobId) : null;
      if (backgroundJobFailed(background)) { await markTerminal(seed, "PROVIDER_ENRICHMENT_JOB_FAILED", "FAILED", now); result.providerRejected += 1; result.failed += 1; continue; }
      if (resource.in_progress === true || backgroundJobProcessing(background) || (lead && [11, 12].includes(Number(lead.verification_status))) || (listed.truncated && !lead)) {
        if (providerJobIsStale(seed, Date.now(), env)) { await markTerminal(seed, "PROVIDER_JOB_STALE", "STALE", now); result.stale += 1; result.failed += 1; continue; }
        await saveGtmChannelSeed({ ...seed, enrichmentProviderStatus: "PROCESSING", enrichmentLastCheckedAt: now, enrichmentLastProviderError: listed.truncated && !lead ? "PROVIDER_LIST_PAGE_LIMIT_REACHED" : null, enrichmentUpdatedAt: now }); result.processing += 1; continue;
      }
      await markTerminal(seed, lead ? "PROVIDER_VERIFICATION_NOT_TERMINAL" : resource.has_no_leads === true ? "NO_ROLE_FIT_PROVIDER_CONTACT" : "NO_ROLE_FIT_VERIFIED_PROVIDER_CONTACT", "COMPLETED", now);
      result.completedButUnreconciled += 1; result.failed += 1;
    } catch (error) {
      const message = safeError(error);
      if (message.includes("(429)")) { await saveGtmChannelSeed({ ...seed, enrichmentProviderStatus: "PROCESSING", enrichmentLastCheckedAt: now, enrichmentLastProviderError: "PROVIDER_RATE_LIMITED", enrichmentUpdatedAt: now }); result.rateLimited += 1; continue; }
      if (message.includes("(404)")) { await markTerminal(seed, "MISSING_PROVIDER_ENRICHMENT_OBJECT", "MISSING_PROVIDER_OBJECT", now, message); result.missingProviderObject += 1; result.failed += 1; continue; }
      await markTerminal(seed, "PROVIDER_ENRICHMENT_FAILED", "FAILED", now, message); result.providerRejected += 1; result.failed += 1;
    }
  }
  result.pending = result.processing + result.rateLimited + result.neverSubmitted;
  return result;
}

async function markTerminal(seed: Awaited<ReturnType<typeof listGtmChannelSeeds>>[number], reason: string, status: "COMPLETED" | "FAILED" | "MISSING_PROVIDER_OBJECT" | "STALE", at: string, error: string | null = null) {
  await saveGtmChannelSeed({ ...seed, lifecycle: isProviderNoRoleFitReason(reason) ? "CONTACT_UNRESOLVED" : "ENRICHMENT_FAILED", rejectionReason: reason, enrichmentResult: reason, enrichmentProviderStatus: status, enrichmentLastCheckedAt: at, enrichmentLastProviderError: error, enrichmentTerminalAt: at, enrichmentUpdatedAt: at });
}

const providerNoRoleFitReasons = new Set(["NO_ROLE_FIT_PROVIDER_CONTACT", "NO_ROLE_FIT_VERIFIED_PROVIDER_CONTACT"]);
export function isProviderNoRoleFitReason(reason: string | null | undefined) { return providerNoRoleFitReasons.has(String(reason || "")); }

/** Legacy completed no-result rows predate CONTACT_UNRESOLVED. Migrate only
 * that exact terminal outcome in place; failed provider operations and
 * ambiguous submissions retain their existing fail-closed state. */
export function normalizeProviderNoRoleFitSeed(seed: ChannelSeedRecord): ChannelSeedRecord {
  if (seed.lifecycle === "ENRICHMENT_FAILED" && seed.enrichmentProviderStatus === "COMPLETED" && isProviderNoRoleFitReason(seed.rejectionReason)) {
    return { ...seed, lifecycle: "CONTACT_UNRESOLVED", enrichmentResult: seed.enrichmentResult || seed.rejectionReason || "NO_ROLE_FIT_VERIFIED_PROVIDER_CONTACT" };
  }
  return seed;
}

async function normalizePersistedProviderNoResultSeeds(seeds: Awaited<ReturnType<typeof listGtmChannelSeeds>>) {
  const normalized = seeds.map(normalizeProviderNoRoleFitSeed);
  await Promise.all(normalized.flatMap((seed, index) => seed === seeds[index] ? [] : [saveGtmChannelSeed(seed)]));
  return normalized;
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
export function providerLeadIsVerified(lead: Record<string, unknown>) { return Number(lead.verification_status) === 1; }
/** The provider distinguishes target resource, enrichment operation, and optional
 * background-import job. Old persisted records used enrichmentJobId for the
 * operation; they remain readable but are never sent to the resource endpoint. */
export function superSearchProviderReferences(seed: Pick<ChannelSeedRecord, "enrichmentResourceId" | "enrichmentBackgroundJobId" | "enrichmentOperationId" | "enrichmentJobId">) {
  return {
    resourceId: text(seed.enrichmentResourceId),
    backgroundJobId: text(seed.enrichmentBackgroundJobId),
    operationId: text(seed.enrichmentOperationId || (!seed.enrichmentBackgroundJobId ? seed.enrichmentJobId : ""))
  };
}
export function backgroundJobProcessing(job: Record<string, unknown> | null) {
  if (!job) return false;
  return !["completed", "complete", "success", "failed", "error", "cancelled", "canceled"].includes(text(job.status).toLowerCase());
}
export function backgroundJobFailed(job: Record<string, unknown> | null) {
  if (!job) return false;
  return ["failed", "error", "cancelled", "canceled"].includes(text(job.status).toLowerCase());
}
function norm(value: string) { return value.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
/** A deliberately small first recovery probe avoids repeating the former
 * 43/50-record request against a workspace with a bounded credit allowance.
 * Operators may raise it only through the deployed configuration after a
 * successful provider result and capacity review. */
/**
 * The former default of one was a one-off recovery probe.  Normal durable
 * processing remains deliberately bounded, but lets the configured provider
 * allowance determine how many independent organizations can be submitted.
 */
export function superSearchBatchLimit(env: NodeJS.ProcessEnv) { const configured = Number(env.GTM_SUPERSEARCH_MAX_PER_RUN || 10); return Number.isInteger(configured) && configured > 0 ? Math.min(25, configured) : 10; }
export function superSearchSubmissionLimit(candidateCount: number, allowance: number, env: NodeJS.ProcessEnv) {
  return Math.max(0, Math.min(Math.max(0, Math.floor(candidateCount)), superSearchBatchLimit(env), Math.max(0, Math.floor(allowance))));
}
export function superSearchAccessRecoveryVersion(env: NodeJS.ProcessEnv) { return String(env.GTM_SUPERSEARCH_ACCESS_RECOVERY_VERSION || "v1").trim().slice(0, 80) || "v1"; }
export function superSearchAvailableCredits(plan: unknown): number | null {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;
  const root = plan as Record<string, unknown>;
  const expectedProduct = String(root.plan_id_leadfinder || root.leadfinder_plan_id || "").trim();
  const entries: Array<Record<string, unknown>> = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 4 || !value) return;
    if (Array.isArray(value)) { value.forEach((item) => visit(item, depth + 1)); return; }
    if (typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.available_credits !== undefined) entries.push(record);
    Object.values(record).forEach((item) => visit(item, depth + 1));
  };
  visit(root);
  const selected = entries.find((entry) => !expectedProduct || String(entry.product || entry.plan_id || "").trim() === expectedProduct) || entries[0];
  const value = Number(selected?.available_credits);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
export function superSearchEligibleSeed(seed: { organizationDomain?: string | null; source?: string; lifecycle: string; rejectionReason?: string | null; enrichmentTerminalAt?: string | null; enrichmentAttemptCount?: number | null; enrichmentAccessRecoveryVersion?: string | null }, recoveryVersion = "v1") {
  if (!seed.organizationDomain) return false;
  if (seed.lifecycle === "ENRICHMENT_BLOCKED" && String(seed.rejectionReason || "").startsWith("INSTANTLY_SUPERSEARCH_")) return seed.enrichmentAccessRecoveryVersion !== recoveryVersion;
  return seed.lifecycle === "EVIDENCE_QUALIFIED"
    || seed.lifecycle === "ENRICHMENT_PENDING"
    || (seed.source === "chatgpt_scanner_drive" && seed.lifecycle === "ENRICHMENT_FAILED" && seed.rejectionReason === "NO_EXPLICIT_PUBLISHED_ROLE_FIT_EMAIL")
    || (seed.lifecycle === "ENRICHMENT_FAILED" && !seed.enrichmentTerminalAt && (seed.enrichmentAttemptCount || 0) < 3);
}

/** The fixed Direct recovery cohort is an immutable work-order audit record,
 * not qualification or outreach authority. Reuse it here so a bounded
 * SuperSearch probe cannot be consumed by unrelated older queue items before
 * the one evidence-qualified cohort member gets its approved contact lookup. */
export function prioritizeChannelSeedEnrichmentCandidates(seeds: readonly ChannelSeedRecord[], cohorts: readonly GtmScannerRecoveryCohort[], segment: ChannelSeedEnrichmentSegment, recoveryVersion = "v1") {
  const eligible = seeds.filter((seed) => seed.segment === segment && superSearchEligibleSeed(seed, recoveryVersion));
  if (segment !== "DIRECT") return eligible;
  const cohortIds = new Set(cohorts
    .filter((cohort) => cohort.segment === "DIRECT")
    .sort((left, right) => right.selectedAt.localeCompare(left.selectedAt))
    .flatMap((cohort) => cohort.canonicalRecordIds));
  const priority = eligible.filter((seed) => cohortIds.has(seed.id));
  const selected = new Set(priority.map((seed) => seed.id));
  return [...priority, ...eligible.filter((seed) => !selected.has(seed.id))];
}

async function blockSuperSearchAccess(allSeeds: Awaited<ReturnType<typeof listGtmChannelSeeds>>, recoveryVersion: string, error: unknown, allowance: number | null, segment: ChannelSeedEnrichmentSegment): Promise<ChannelSeedEnrichmentResult> {
  const now = new Date().toISOString();
  const apiError = error instanceof InstantlyApiError ? error : null;
  const blocked = allowance === null ? "INSTANTLY_SUPERSEARCH_ALLOWANCE_UNAVAILABLE" : allowance < 1 ? "INSTANTLY_SUPERSEARCH_CREDITS_UNAVAILABLE" : "INSTANTLY_SUPERSEARCH_ACCESS_BLOCKED";
  const detail = apiError
    ? [`HTTP_${apiError.status}`, apiError.path, apiError.requestId && `REQUEST_${apiError.requestId}`, apiError.providerCode && `CODE_${apiError.providerCode}`, apiError.providerDetail].filter(Boolean).join(" ")
    : redactedInstantlyDiagnostic(error instanceof Error ? error.message : "Workspace billing details unavailable");
  const affected = allSeeds.filter((seed) => superSearchEligibleSeed(seed, recoveryVersion));
  await Promise.all(affected.map((seed) => saveGtmChannelSeed({ ...seed, lifecycle: "ENRICHMENT_BLOCKED", rejectionReason: `${blocked}${apiError ? `_HTTP_${apiError.status}` : ""}`, enrichmentProvider: "instantly_supersearch", enrichmentProviderStatus: "BLOCKED", enrichmentResult: "Instantly SuperSearch enrichment is blocked before provider job creation. The record is preserved and requires a new configured recovery generation after the account condition is resolved.", enrichmentLastCheckedAt: now, enrichmentLastProviderError: detail || blocked, enrichmentAccessRecoveryVersion: recoveryVersion, enrichmentUpdatedAt: now })));
  return { segment, selected: 0, previewCount: null, submitted: 0, resourceId: null, providerStatus: "BLOCKED", blocked };
}

function superSearchAccessDenied(error: unknown) {
  return error instanceof InstantlyApiError && [402, 403].includes(error.status);
}
export function scannerSeedNeedsPublicContactScan(seed: { enrichmentTerminalAt?: string | null; enrichmentLastProviderError?: string | null; scrapeGraphEvidence?: { pagesExamined?: string[] | null } | null }, env: NodeJS.ProcessEnv = process.env) { const examined = seed.scrapeGraphEvidence?.pagesExamined || []; return (!seed.enrichmentTerminalAt || seed.enrichmentLastProviderError === "NO_EXPLICIT_PUBLISHED_ROLE_FIT_EMAIL") && examined.length < scannerScrapeGraphPageLimit(env); }
function roleFits(segment: ChannelSeedEnrichmentSegment, title: string) { return segment === "DIRECT" ? /\b(cfo|finance director|controller|director of grants|grants manager|institutional giving)\b/i.test(title) : /\b(founder|ceo|managing partner|partner|principal)\b/i.test(title); }
export function providerJobIsStale(seed: { enrichmentSubmittedAt?: string | null; enrichmentUpdatedAt?: string | null }, now: number, env: NodeJS.ProcessEnv = process.env) { const submitted = Date.parse(seed.enrichmentSubmittedAt || seed.enrichmentUpdatedAt || ""); const staleMs = Number(env.INSTANTLY_ENRICHMENT_STALE_MS || 3600000); return Number.isFinite(submitted) && now - submitted > (Number.isFinite(staleMs) && staleMs >= 60000 ? staleMs : 3600000); }
function safeError(error: unknown) { return error instanceof Error ? error.message.slice(0, 240) : "provider_error"; }
