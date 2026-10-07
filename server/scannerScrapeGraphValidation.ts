import { lookup } from "node:dns/promises";
import { createGtmScannerRecoveryCohort, listGtmChannelSeeds, listGtmScannerImportReceipts, listGtmScannerRecoveryCohorts, readGtmScannerRecoveryCohort, saveGtmChannelSeed, type GtmScannerRecoveryCohort } from "./persistence.ts";
import { extractPublicOrganizationEvidence, readScrapeGraphCreditBalance, scrapeGraphBudgetAllowsCall, scrapeGraphRuntimeConfiguration } from "./scrapeGraphEvidence.ts";
import { attachScannerSupplementalIdentityEvidence, supplementalOrganizationNames } from "./scannerDallasFoundationIdentityEvidence.ts";
import type { ChannelSeedRecord } from "../src/lib/gtmChannelSeeds.ts";

type Outcome = { canonicalRecordId: string; segment: ChannelSeedRecord["segment"]; disposition: "QUALIFIED" | "DEFERRED" | "REJECTED"; reason: string; providerHttpStatus?: number | null; providerRequestId?: string | null };

/** Scanner and structured-award rows are organization research only. Direct,
 * independently fetched public evidence is the normal qualification route.
 * ScrapeGraphAI is a bounded fallback for a record whose official domain still
 * cannot be established; it is never a batch-wide prerequisite. */
export async function validateScannerSourceSeedsWithScrapeGraph(env: NodeJS.ProcessEnv = process.env) {
  const now = new Date().toISOString();
  // Supplemental identity evidence is immutable and source-key-bound. Persist
  // it for every matching batch record before selecting a bounded validation
  // slice, so an extractor-credit guard cannot leave the other 10 supplied
  // Direct identities without their provenance.
  const loadedSeeds = await listGtmChannelSeeds();
  const allSeeds: ChannelSeedRecord[] = [];
  for (const originalSeed of loadedSeeds) {
    const seed = attachScannerSupplementalIdentityEvidence(originalSeed);
    if (seed !== originalSeed) await saveGtmChannelSeed(seed);
    allSeeds.push(seed);
  }
  const cohorts = await listGtmScannerRecoveryCohorts();
  const candidates = prioritizeScannerValidationCandidates(allSeeds, cohorts, now, env).slice(0, configuredLimit(env));
  const configuration = scrapeGraphRuntimeConfiguration(env);
  const result = {
    selected: candidates.length, independentOfficialEvidenceCandidates: candidates.filter((seed) => independentOfficialSourceCandidates(seed).length > 0).length, validated: 0, deferred: 0, rejected: 0, remediated: 0,
    provider: "public_source+official_domain; scrapegraphai_fallback", blocked: null as string | null,
    scrapeGraph: { configured: Boolean(configuration.enabled && configuration.apiKey), remainingCredits: null as number | null, creditsReserved: allSeeds.reduce((sum, seed) => sum + (seed.scrapeGraphEvidence?.creditsReserved || 0), 0), httpStatus: null as number | null, providerRequestId: null as string | null },
    outcomes: [] as Outcome[]
  };
  let fallbackBlock: string | null = null;
  let balance: Awaited<ReturnType<typeof readScrapeGraphCreditBalance>> | null = null;
  const checkFallback = async () => {
    if (fallbackBlock) return fallbackBlock;
    if (!configuration.enabled || !configuration.apiKey) {
      fallbackBlock = "SCRAPEGRAPH_NOT_CONFIGURED";
      result.blocked = fallbackBlock;
      return fallbackBlock;
    }
    balance = await readScrapeGraphCreditBalance(configuration);
    result.scrapeGraph.remainingCredits = balance.remaining;
    result.scrapeGraph.httpStatus = balance.httpStatus;
    result.scrapeGraph.providerRequestId = balance.providerRequestId;
    if (balance.status !== "AVAILABLE") {
      fallbackBlock = `SCRAPEGRAPH_${String(balance.errorCategory || "UNAVAILABLE").toUpperCase()}`;
      result.blocked = fallbackBlock;
      return fallbackBlock;
    }
    if (!scrapeGraphBudgetAllowsCall({ creditsAlreadyReserved: result.scrapeGraph.creditsReserved, providerRemaining: balance.remaining, configuration })) {
      fallbackBlock = "SCRAPEGRAPH_CREDIT_HEADROOM_REACHED";
      result.blocked = fallbackBlock;
      return fallbackBlock;
    }
    return null;
  };
  for (const seed of candidates) {
    const source = publicSource(seed.sourceUrl);
    if (!source) { await record(seed, "REJECTED", "UNSAFE_OR_MALFORMED_SOURCE_URL", "The scanner source is not a permitted public HTTPS URL.", now, env, null, null, "public_source"); result.rejected++; result.outcomes.push(outcome(seed, "REJECTED", "UNSAFE_OR_MALFORMED_SOURCE_URL")); continue; }
    if (!await sourceSupportsOrganizationSignal(source, seed)) { await record(seed, "REJECTED", "SOURCE_CLAIM_NOT_INDEPENDENTLY_VERIFIED", "The public discovery source did not support the organization identity and segment signal.", now, env, null, null, "public_source"); result.rejected++; result.outcomes.push(outcome(seed, "REJECTED", "SOURCE_CLAIM_NOT_INDEPENDENTLY_VERIFIED")); continue; }
    const official = await independentlyVerifiedOfficialSource(seed, source);
    if (official) {
      await qualifyWithIndependentOfficialEvidence(seed, official, now);
      result.validated++;
      result.outcomes.push(outcome(seed, "QUALIFIED", "EVIDENCE_QUALIFIED_INDEPENDENT_PUBLIC_EVIDENCE"));
      continue;
    }
    const unavailable = await checkFallback();
    if (unavailable) {
      await deferForUnavailableFallback(seed, unavailable, now, env);
      result.deferred++;
      result.outcomes.push(outcome(seed, "DEFERRED", unavailable, result.scrapeGraph.httpStatus, result.scrapeGraph.providerRequestId));
      continue;
    }
    const nextAttempt = (seed.validationAttemptCount || 0) + 1;
    const reserved = { requestId: `reserved_${seed.id}_${nextAttempt}`, sourceUrl: source.toString(), officialOrganizationUrl: null, officialOrganizationName: null, evidenceSummary: null, contactSourceUrl: null, creditsReserved: nextScrapeGraphReservedCredits(seed.scrapeGraphEvidence?.creditsReserved || 0, configuration.extractCreditCost), extractedAt: now };
    await saveGtmChannelSeed({ ...seed, lifecycle: "ROLE_UNRESOLVED", validationDisposition: "DEFERRED", validationAttemptCount: nextAttempt, validationLastAttemptAt: now, validationNextAttemptAt: retryAt(now, nextAttempt), enrichmentProvider: "scrapegraphai", enrichmentProviderStatus: "PROCESSING", enrichmentResult: "ScrapeGraphAI public-source extraction is in progress; no identity, contact, or email is inferred.", enrichmentUpdatedAt: now, scrapeGraphEvidence: reserved });
    result.scrapeGraph.creditsReserved += configuration.extractCreditCost;
    const extracted = await extractPublicOrganizationEvidence({ sourceUrl: source.toString(), organization: seed.organization, segment: seed.segment, configuration });
    if (extracted.status === "UNAVAILABLE") {
      const reason = `SCRAPEGRAPH_${String(extracted.errorCategory || "UNAVAILABLE").toUpperCase()}`;
      const accountCondition = ["authentication", "insufficient_credits", "rate_limited"].includes(String(extracted.errorCategory));
      if (accountCondition) {
        await deferForUnavailableFallback({ ...seed, scrapeGraphEvidence: reserved }, reason, now, env, extracted.httpStatus, extracted.requestId);
        fallbackBlock = reason;
        result.blocked = reason;
      } else {
        await record({ ...seed, scrapeGraphEvidence: reserved }, "DEFERRED", reason, "The public evidence extractor did not return a result; the record remains deferred without a generated contact.", now, env, extracted.httpStatus, extracted.requestId);
      }
      result.deferred++; result.outcomes.push(outcome(seed, "DEFERRED", reason, extracted.httpStatus, extracted.requestId)); continue;
    }
    const extractedOfficial = publicSource(extracted.officialOrganizationUrl || "");
    if (!extractedOfficial || !await officialSourceSupportsOrganization(extractedOfficial, seed)) { await record({ ...seed, scrapeGraphEvidence: { ...reserved, requestId: extracted.requestId || reserved.requestId, officialOrganizationUrl: extracted.officialOrganizationUrl, officialOrganizationName: extracted.officialOrganizationName, evidenceSummary: extracted.evidenceSummary, contactSourceUrl: extracted.contact?.sourceUrl || null, extractedAt: now } }, "DEFERRED", "OFFICIAL_DOMAIN_NOT_INDEPENDENTLY_VERIFIED", "The extractor returned no independently verifiable official organization domain. The record remains deferred.", now, env, extracted.httpStatus, extracted.requestId); result.deferred++; result.outcomes.push(outcome(seed, "DEFERRED", "OFFICIAL_DOMAIN_NOT_INDEPENDENTLY_VERIFIED", extracted.httpStatus, extracted.requestId)); continue; }
    const domain = extractedOfficial.hostname.toLowerCase().replace(/^www\./, "");
    // A contact must be visibly published on a same-domain official page. The
    // original source can be a funder, award notice, or directory and must
    // never be mistaken for contact evidence merely because it names the org.
    const contactSource = extractedContactSourceForVerification(extracted.contact, domain);
    const contact = extracted.contact && contactSource && roleFits(seed.segment, extracted.contact.title) && extracted.contact.email.endsWith(`@${domain}`) && await pageSupportsPublishedContact(contactSource, seed, extracted.contact) ? { ...extracted.contact, observedAt: now } : null;
    await saveGtmChannelSeed({ ...seed, lifecycle: "EVIDENCE_QUALIFIED", organizationDomain: domain, officialOrganizationUrl: extractedOfficial.toString(), officialOrganizationEvidenceUrl: extractedOfficial.toString(), qualificationProvider: "scrapegraphai_extract+public_source", qualificationUpdatedAt: now, validationDisposition: "QUALIFIED", validationAttemptCount: nextAttempt, validationLastAttemptAt: now, validationNextAttemptAt: null, rejectionReason: null, scannerValidatedContact: contact, scrapeGraphEvidence: { ...reserved, requestId: extracted.requestId || reserved.requestId, officialOrganizationUrl: extractedOfficial.toString(), officialOrganizationName: extracted.officialOrganizationName, evidenceSummary: extracted.evidenceSummary, contactSourceUrl: contact?.sourceUrl || null, extractedAt: now }, enrichmentProvider: "scrapegraphai", enrichmentProviderStatus: contact ? "COMPLETED" : "PROCESSING", enrichmentResult: contact ? "ScrapeGraphAI located an explicitly published role-fit work email. Instantly verification is required before readiness." : "Organization evidence qualified. A public current role-fit email remains unresolved and will be checked only on official organization pages.", enrichmentUpdatedAt: now, qualificationReasons: [...seed.qualificationReasons, "Public source independently supports the segment signal.", "Official organization domain independently verified after ScrapeGraphAI extraction."] });
    result.validated++; result.outcomes.push(outcome(seed, "QUALIFIED", contact ? "EVIDENCE_QUALIFIED_PUBLIC_CONTACT" : "EVIDENCE_QUALIFIED_CONTACT_UNRESOLVED", extracted.httpStatus, extracted.requestId));
  }
  return result;
}

const directRecoverySelectionBasis = "Deterministic pre-validation priority: Direct scanner records from the immutable receipt, ordered by safe public-source shape and explicit post-award evidence terms. This is not qualification evidence and does not authorize contact or outreach.";

/** Creates or returns the fixed recovery cohort from the immutable receipt.
 * The caller is scheduler-authenticated, and this operation cannot call an
 * evidence, contact, verification, enrollment, or delivery provider. */
export async function createOrReadScannerDirectRecoveryCohort(batchId: string) {
  const normalizedBatchId = batchId.trim();
  if (!/^daily-grantdeskhq-[a-z0-9-]{8,160}$/i.test(normalizedBatchId)) throw new Error("batchId is not a permitted immutable scanner batch identifier.");
  const existing = await readGtmScannerRecoveryCohort(normalizedBatchId);
  if (existing) return { cohort: existing, created: false };
  const receipts = await listGtmScannerImportReceipts();
  const receipt = receipts
    .filter((item) => item.batchId === normalizedBatchId && !item.quarantined && item.sourceFileId && item.contentHash && item.canonicalRecordIds?.length)
    .sort((left, right) => Number(right.receiptKind === "RECONCILIATION") - Number(left.receiptKind === "RECONCILIATION") || right.processedAt.localeCompare(left.processedAt))[0];
  if (!receipt) throw new Error("No committed immutable scanner receipt is available for this batch.");
  const selected = selectScannerDirectRecoveryCohort(await listGtmChannelSeeds(), receipt.batchId, receipt.canonicalRecordIds, 10);
  if (selected.length < 1) throw new Error("The committed scanner receipt has no recoverable Direct organization records for a cohort.");
  const cohort: GtmScannerRecoveryCohort = {
    id: `scanner_direct_recovery_${receipt.batchId}`,
    batchId: receipt.batchId,
    sourceFileId: receipt.sourceFileId,
    contentHash: receipt.contentHash,
    segment: "DIRECT",
    canonicalRecordIds: selected.map((seed) => seed.id),
    selectedAt: new Date().toISOString(),
    selectionBasis: directRecoverySelectionBasis,
    creationSource: "scheduler_authenticated_recovery",
    stateVersion: 1
  };
  return createGtmScannerRecoveryCohort(cohort);
}

/** A fixed cohort may prioritize one evidence pass after the immutable cohort
 * was selected. A historical attempt before selection does not strand that
 * record, while post-cohort retries immediately return to normal bounded
 * scheduling so a bad batch can never starve the production queue. */
export function prioritizeScannerValidationCandidates(seeds: readonly ChannelSeedRecord[], cohorts: readonly GtmScannerRecoveryCohort[], now: string, env: NodeJS.ProcessEnv = process.env) {
  const due = seeds.filter((seed) => requiresIndependentPublicValidation(seed) && scannerValidationDueForScrapeGraph(seed, now, env));
  const cohortById = new Map<string, GtmScannerRecoveryCohort>();
  for (const cohort of cohorts.filter((entry) => entry.segment === "DIRECT")) {
    for (const id of cohort.canonicalRecordIds) {
      const current = cohortById.get(id);
      if (!current || current.selectedAt < cohort.selectedAt) cohortById.set(id, cohort);
    }
  }
  const priority = due.filter((seed) => {
    const cohort = cohortById.get(seed.id);
    return Boolean(cohort) && !validatedSinceCohortSelection(seed, cohort!);
  });
  const selected = new Set(priority.map((seed) => seed.id));
  const ordered = [...priority, ...due.filter((seed) => !selected.has(seed.id))];
  // A record with an independently supplied official-domain candidate can
  // proceed without spending a ScrapeGraphAI credit. Keep cohort ordering
  // within each group, but process those records before fallback-dependent
  // work so a headroom-protected extractor cannot stall independent evidence.
  return [
    ...ordered.filter((seed) => independentOfficialSourceCandidates(seed).length > 0),
    ...ordered.filter((seed) => independentOfficialSourceCandidates(seed).length === 0)
  ];
}

function validatedSinceCohortSelection(seed: ChannelSeedRecord, cohort: GtmScannerRecoveryCohort) {
  const lastAttemptAt = Date.parse(seed.validationLastAttemptAt || "");
  const cohortSelectedAt = Date.parse(cohort.selectedAt || "");
  return Number.isFinite(lastAttemptAt) && Number.isFinite(cohortSelectedAt) && lastAttemptAt >= cohortSelectedAt;
}

/** The score is strictly a deterministic work-order preference. Every source,
 * official-domain, role, email, verification, suppression, and enrollment
 * gate still runs in the normal validator/controller path. */
export function selectScannerDirectRecoveryCohort(seeds: readonly ChannelSeedRecord[], batchId: string, canonicalRecordIds: readonly string[], maximum = 10) {
  const receiptIds = new Set(canonicalRecordIds);
  const limit = Math.max(1, Math.min(10, Math.floor(maximum)));
  return seeds
    .filter((seed) => seed.segment === "DIRECT" && seed.source === "chatgpt_scanner_drive" && seed.scannerBatchId === batchId && receiptIds.has(seed.id) && (seed.lifecycle === "DISCOVERED" || seed.lifecycle === "ROLE_UNRESOLVED"))
    .sort((left, right) => directRecoveryPriority(right) - directRecoveryPriority(left) || left.id.localeCompare(right.id))
    .slice(0, limit);
}

function directRecoveryPriority(seed: ChannelSeedRecord) {
  const source = publicSource(seed.sourceUrl);
  const terms = `${seed.evidenceSummary} ${seed.qualificationReasons.join(" ")}`.toLowerCase();
  return (source ? 2 : 0)
    + (seed.scannerClaimedDomain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(seed.scannerClaimedDomain) ? 2 : 0)
    + (/grant|restricted fund|post-award|report|compliance|budget/.test(terms) ? 2 : 0)
    + (seed.targetRoleGroup.length ? 1 : 0);
}

/** Only organization-research sources need the independent-domain validation
 * pass. Provider-discovered seeds already carry separately verified evidence
 * and remain on their existing Instantly-first path. */
export function requiresIndependentPublicValidation(seed: Pick<ChannelSeedRecord, "source">) {
  return seed.source === "chatgpt_scanner_drive" || seed.source === "usaspending_award" || seed.source === "social_public_identified";
}

function normalizedDomain(value: string | null | undefined) {
  const trimmed = String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed) ? trimmed : null;
}

function sameDomain(left: URL, right: string) {
  const host = left.hostname.toLowerCase().replace(/^www\./, "");
  return host === right || host.endsWith(`.${right}`) || right.endsWith(`.${host}`);
}

export function extractedContactSourceForVerification(contact: { sourceUrl?: string | null } | null | undefined, officialDomain: string) {
  const source = publicSource(contact?.sourceUrl || "");
  return source && sameDomain(source, officialDomain) ? source : null;
}

/** Uses only a supplied organization domain or a prior official URL. A
 * discovery/funder/directory page never becomes an organization domain just
 * because it names the organization. */
export function independentOfficialSourceCandidates(seed: ChannelSeedRecord) {
  const candidates: URL[] = [];
  const known = publicSource(seed.officialOrganizationUrl || "");
  if (known) candidates.push(known);
  const domain = normalizedDomain(seed.organizationDomain) || normalizedDomain(seed.scannerClaimedDomain);
  if (domain) {
    const claimed = publicSource(`https://${domain}/`);
    if (claimed && !candidates.some((candidate) => sameDomain(candidate, domain))) candidates.push(claimed);
  }
  const supplemental = publicSource(seed.scannerSupplementalIdentityEvidence?.identityEvidenceUrl || "");
  if (supplemental && !candidates.some((candidate) => candidate.toString() === supplemental.toString())) candidates.push(supplemental);
  return candidates;
}

async function independentlyVerifiedOfficialSource(seed: ChannelSeedRecord, discoverySource: URL) {
  for (const candidate of independentOfficialSourceCandidates(seed)) {
    if (sameDomain(candidate, discoverySource.hostname.toLowerCase().replace(/^www\./, ""))) continue;
    if (await officialSourceSupportsOrganization(candidate, seed)) return candidate;
  }
  return null;
}

async function qualifyWithIndependentOfficialEvidence(seed: ChannelSeedRecord, official: URL, now: string) {
  const domain = official.hostname.toLowerCase().replace(/^www\./, "");
  await saveGtmChannelSeed({
    ...seed,
    lifecycle: "EVIDENCE_QUALIFIED",
    organizationDomain: domain,
    officialOrganizationUrl: official.toString(),
    officialOrganizationEvidenceUrl: official.toString(),
    qualificationProvider: "independent_public_source",
    qualificationUpdatedAt: now,
    validationDisposition: "QUALIFIED",
    validationLastAttemptAt: now,
    validationNextAttemptAt: null,
    rejectionReason: null,
    enrichmentProvider: null,
    enrichmentProviderStatus: null,
    enrichmentResult: "Discovery evidence and an independently fetched official organization page support qualification. Instantly contact discovery and completed email verification remain required before readiness.",
    enrichmentUpdatedAt: now,
    qualificationReasons: [...seed.qualificationReasons, "Independent official organization page confirms the organization identity and domain."]
  });
}

/** An account-level fallback condition is not a record-quality failure. Keep
 * the record resumable without burning validation attempts or converting it
 * into a permanent rejection. */
async function deferForUnavailableFallback(seed: ChannelSeedRecord, reason: string, now: string, env: NodeJS.ProcessEnv, httpStatus: number | null = null, requestId: string | null = null) {
  const minutes = Number(env.GTM_SCRAPEGRAPH_FALLBACK_RETRY_MINUTES || 360);
  const delay = Number.isFinite(minutes) && minutes >= 15 ? Math.min(24 * 60, Math.floor(minutes)) : 360;
  await saveGtmChannelSeed({
    ...seed,
    lifecycle: "ROLE_UNRESOLVED",
    validationDisposition: "DEFERRED",
    validationLastAttemptAt: now,
    validationNextAttemptAt: new Date(Date.parse(now) + delay * 60_000).toISOString(),
    rejectionReason: reason,
    enrichmentProvider: "scrapegraphai_fallback",
    enrichmentProviderStatus: "BLOCKED",
    enrichmentLastProviderError: httpStatus ? `${reason} HTTP_${httpStatus}${requestId ? ` REQUEST_${requestId}` : ""}`.slice(0, 500) : reason,
    enrichmentResult: "Independent official-domain evidence was not yet available. The optional public extractor is unavailable, so this record remains deferred without creating a contact or affecting unrelated records.",
    enrichmentUpdatedAt: now
  });
}

async function record(seed: ChannelSeedRecord, disposition: "DEFERRED" | "REJECTED", reason: string, detail: string, now: string, env: NodeJS.ProcessEnv, httpStatus: number | null = null, requestId: string | null = null, provider = "scrapegraphai") {
  const attempts = (seed.validationAttemptCount || 0) + 1;
  const exhausted = disposition === "DEFERRED" && attempts >= configuredMaxAttempts(env);
  const final = exhausted ? "REJECTED" : disposition;
  await saveGtmChannelSeed({ ...seed, lifecycle: final === "REJECTED" ? "REJECTED" : "ROLE_UNRESOLVED", rejectionReason: exhausted ? `${reason}_RETRY_EXHAUSTED` : reason, enrichmentProvider: provider, enrichmentProviderStatus: final === "REJECTED" ? "FAILED" : "PROCESSING", enrichmentLastProviderError: httpStatus ? `${reason} HTTP_${httpStatus}${requestId ? ` REQUEST_${requestId}` : ""}`.slice(0, 500) : reason, enrichmentResult: detail, qualificationProvider: provider === "public_source" ? "independent_public_source" : "scrapegraphai_extract+public_source", qualificationUpdatedAt: now, validationDisposition: final, validationAttemptCount: attempts, validationLastAttemptAt: now, validationNextAttemptAt: final === "DEFERRED" ? retryAt(now, attempts) : null, enrichmentUpdatedAt: now });
}
function outcome(seed: ChannelSeedRecord, disposition: Outcome["disposition"], reason: string, providerHttpStatus: number | null = null, providerRequestId: string | null = null): Outcome { return { canonicalRecordId: seed.id, segment: seed.segment, disposition, reason, providerHttpStatus, providerRequestId }; }
export function scannerValidationDueForScrapeGraph(seed: ChannelSeedRecord, now: string, env: NodeJS.ProcessEnv = process.env) { if (seed.lifecycle === "DISCOVERED") return true; if (seed.lifecycle !== "ROLE_UNRESOLVED") return false; const attempts = seed.validationAttemptCount || 0; if (attempts >= configuredMaxAttempts(env)) return false; if (seed.validationDisposition && seed.validationDisposition !== "DEFERRED") return false; const next = Date.parse(seed.validationNextAttemptAt || ""); return !Number.isFinite(next) || next <= Date.parse(now); }
/** Retries consume credits too; a later attempt can never reset the durable per-record accounting. */
export function nextScrapeGraphReservedCredits(existing: number, extractCreditCost: number) { return Math.max(0, Number.isFinite(existing) ? existing : 0) + Math.max(0, Number.isFinite(extractCreditCost) ? extractCreditCost : 0); }
function configuredLimit(env: NodeJS.ProcessEnv) { const value = Number(env.GTM_SCRAPEGRAPH_MAX_PER_RUN || env.GTM_SCANNER_VALIDATION_MAX_PER_RUN || 10); return Number.isInteger(value) && value > 0 ? Math.min(value, 10) : 10; }
function configuredMaxAttempts(env: NodeJS.ProcessEnv) { const value = Number(env.GTM_SCANNER_VALIDATION_MAX_ATTEMPTS || 3); return Number.isInteger(value) && value >= 1 ? Math.min(value, 5) : 3; }
function retryAt(now: string, attempts: number) { return new Date(Date.parse(now) + Math.min(24 * 60 * 60 * 1_000, 15 * 60 * 1_000 * 2 ** Math.max(0, attempts - 1))).toISOString(); }
async function sourceSupportsOrganizationSignal(source: URL, seed: ChannelSeedRecord) {
  const host = source.hostname.toLowerCase().replace(/^www\./, "");
  if (seed.source === "usaspending_award") {
    return seed.segment === "DIRECT" && /(^|\.)usaspending\.gov$/.test(host) && Boolean(seed.scannerUnknownFields?.awardEvidenceId || seed.scannerUnknownFields?.awardStartDate);
  }
  const text = await publicText(source);
  return mentionsOrganization(text, seed.organization) && (seed.segment === "DIRECT" ? /grant|funder|restricted fund|compliance|budget|report/.test(text) : /nonprofit|fractional cfo|accounting|grant|fiscal|controller/.test(text));
}
async function officialSourceSupportsOrganization(source: URL, seed: ChannelSeedRecord) {
  const text = await publicText(source);
  return supplementalOrganizationNames(seed).some((organization) => mentionsOrganization(text, organization));
}
async function pageSupportsPublishedContact(source: URL, seed: ChannelSeedRecord, contact: { fullName: string; title: string; email: string }) {
  const text = await publicText(source);
  return supplementalOrganizationNames(seed).some((organization) => mentionsOrganization(text, organization)) && text.includes(contact.fullName.toLowerCase()) && text.includes(contact.email.toLowerCase()) && text.includes(contact.title.toLowerCase());
}
function roleFits(segment: ChannelSeedRecord["segment"], title: string) { return segment === "DIRECT" ? /\b(cfo|finance|controller|grants|executive director|chief operating)\b/i.test(title) : /\b(founder|ceo|partner|principal|fractional cfo|director)\b/i.test(title); }
function mentionsOrganization(text: string, organization: string) { const parts = organization.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((part) => part.length > 2); return parts.length > 0 && parts.every((part) => text.includes(part)); }
async function publicText(source: URL) { try { const addresses = await lookup(source.hostname, { all: true, verbatim: true }); if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) return ""; const response = await fetch(source, { redirect: "error", headers: { Accept: "text/html,application/pdf;q=0.9" }, signal: AbortSignal.timeout(15_000) }); if (!response.ok || Number(response.headers.get("content-length") || 0) > 512_000) return ""; const text = await boundedText(response, 512_000); return text.toLowerCase().replace(/[^a-z0-9@._+-]+/g, " "); } catch { return ""; } }
async function boundedText(response: Response, maximum: number) { const reader = response.body?.getReader(); if (!reader) return ""; const chunks: Uint8Array[] = []; let size = 0; try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maximum) { await reader.cancel(); return ""; } chunks.push(value); } } finally { reader.releaseLock(); } const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } return new TextDecoder().decode(bytes); }
function privateAddress(address: string) { const value = address.toLowerCase(); return value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd") || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value); }
function publicSource(value: string) { try { const url = new URL(value); const host = url.hostname.toLowerCase().replace(/^www\./, ""); return url.protocol === "https:" && !url.username && !url.password && !/^(localhost|metadata\.google\.internal|127\.|10\.|192\.168\.|169\.254\.)/.test(host) ? url : null; } catch { return null; } }
