import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { recordInstantlyVerifiedGtmContact } from "./contactEnrichment.ts";
import { InstantlyClient, instantlyConfig } from "./instantly.ts";
import { listGtmChannelSeeds, saveGtmChannelSeed } from "./persistence.ts";
import { extractPublicOrganizationEvidence, readScrapeGraphCreditBalance, scrapeGraphBudgetAllowsCall, scrapeGraphRuntimeConfiguration } from "./scrapeGraphEvidence.ts";
import type { ChannelSeedRecord } from "../src/lib/gtmChannelSeeds.ts";

export type ScannerScrapeGraphEnrichmentResult = { segment: "DIRECT" | "PARTNER"; selected: number; previewCount: null; submitted: number; resourceId: null; providerStatus: string; blocked: string | null; pendingVerification: number; noPublishedContact: number; };
const officialContactPath = /\/(?:staff|team|leadership|people|about|contact|finance|grants|who-we-are|our-team)(?:\/|$)/i;

/** Scanner identities are read only from the organization-controlled public
 * page. Instantly's standalone verifier owns email verification; this path
 * cannot enroll a campaign or send a message. */
export async function enrichValidatedScannerSeedsWithScrapeGraph(segment: "DIRECT" | "PARTNER", seeds: ChannelSeedRecord[], env: NodeJS.ProcessEnv = process.env): Promise<ScannerScrapeGraphEnrichmentResult> {
  const config = instantlyConfig(env);
  const scrapeGraph = scrapeGraphRuntimeConfiguration(env);
  const result: ScannerScrapeGraphEnrichmentResult = { segment, selected: seeds.length, previewCount: null, submitted: 0, resourceId: null, providerStatus: "SCRAPEGRAPH_INSTANTLY_VERIFICATION", blocked: null, pendingVerification: 0, noPublishedContact: 0 };
  if (!config.integrationEnabled || !config.apiKeyConfigured) return { ...result, blocked: "INSTANTLY_NOT_CONFIGURED" };
  if (!scrapeGraph.enabled || !scrapeGraph.apiKey) return { ...result, blocked: "SCRAPEGRAPH_NOT_CONFIGURED" };
  const credit = await readScrapeGraphCreditBalance(scrapeGraph);
  if (credit.status !== "AVAILABLE") return { ...result, blocked: `SCRAPEGRAPH_${String(credit.errorCategory || "UNAVAILABLE").toUpperCase()}` };
  const all = await listGtmChannelSeeds();
  let creditsReserved = all.reduce((sum, seed) => sum + (seed.scrapeGraphEvidence?.creditsReserved || 0), 0);
  const client = new InstantlyClient(config, env.INSTANTLY_API_KEY || "");
  for (const original of seeds) {
    const now = new Date().toISOString();
    let seed = original;
    let contact = seed.scannerValidatedContact?.email ? seed.scannerValidatedContact : null;
    if (!contact) {
      const official = publicUrl(seed.officialOrganizationEvidenceUrl || seed.officialOrganizationUrl || "");
      if (!official) { await defer(seed, "OFFICIAL_DOMAIN_NOT_INDEPENDENTLY_VERIFIED", now); continue; }
      const priorEvidence = seed.scrapeGraphEvidence;
      const inferredPriorPages = priorEvidence?.pagesExamined || (priorEvidence?.sourceUrl === official.toString() ? [official.toString()] : []);
      const pages = (await officialContactPages(official, scannerScrapeGraphPageLimit(env))).filter((page) => !inferredPriorPages.includes(page));
      const attemptedPages: string[] = [];
      const requestIds: string[] = [];
      let extracted: Awaited<ReturnType<typeof extractPublicOrganizationEvidence>> | null = null;
      let candidate: { firstName: string; lastName: string; fullName: string; title: string; email: string; sourceUrl: string; observedAt: string } | null = null;
      for (const page of pages) {
        if (!scrapeGraphBudgetAllowsCall({ creditsAlreadyReserved: creditsReserved, providerRemaining: credit.remaining, configuration: scrapeGraph })) { result.blocked = "SCRAPEGRAPH_CREDIT_HEADROOM_REACHED"; break; }
        extracted = await extractPublicOrganizationEvidence({ sourceUrl: page, organization: seed.organization, segment, configuration: scrapeGraph });
        creditsReserved += scrapeGraph.extractCreditCost;
        attemptedPages.push(page);
        if (extracted.requestId) requestIds.push(extracted.requestId);
        if (extracted.status === "UNAVAILABLE") {
          await defer(seed, `SCRAPEGRAPH_${String(extracted.errorCategory || "UNAVAILABLE").toUpperCase()}`, now, extracted.httpStatus, extracted.requestId);
          if (["authentication", "insufficient_credits", "rate_limited"].includes(String(extracted.errorCategory))) result.blocked = `SCRAPEGRAPH_${String(extracted.errorCategory).toUpperCase()}`;
          break;
        }
        if (extracted.contact && roleFits(segment, extracted.contact.title) && extracted.contact.email.endsWith(`@${seed.organizationDomain}`) && await supportsPublishedContact(new URL(page), seed.organization, extracted.contact)) { candidate = { ...extracted.contact, sourceUrl: page, observedAt: now }; break; }
      }
      if (result.blocked) break;
      const evidence = { requestId: requestIds.at(-1) || priorEvidence?.requestId || stableId(seed.id), requestIds: [...new Set([...(priorEvidence?.requestIds || (priorEvidence?.requestId ? [priorEvidence.requestId] : [])), ...requestIds])], sourceUrl: official.toString(), officialOrganizationUrl: seed.officialOrganizationUrl || official.toString(), officialOrganizationName: extracted?.officialOrganizationName || priorEvidence?.officialOrganizationName || null, evidenceSummary: extracted?.evidenceSummary || priorEvidence?.evidenceSummary || null, contactSourceUrl: candidate?.sourceUrl || null, pagesExamined: [...new Set([...inferredPriorPages, ...attemptedPages])], creditsReserved: (priorEvidence?.creditsReserved || 0) + attemptedPages.length * scrapeGraph.extractCreditCost, extractedAt: now };
      if (!candidate) { await saveGtmChannelSeed({ ...seed, lifecycle: "EVIDENCE_QUALIFIED", scannerValidatedContact: null, scrapeGraphEvidence: evidence, enrichmentProvider: "scrapegraphai", enrichmentProviderStatus: "COMPLETED", enrichmentResult: "ScrapeGraphAI examined only bounded, same-host official contact pages and found no explicitly published current role-fit individual work email. The candidate remains unresolved and was not verified or enrolled.", enrichmentLastProviderError: "NO_EXPLICIT_PUBLISHED_ROLE_FIT_EMAIL", enrichmentLastCheckedAt: now, enrichmentUpdatedAt: now, enrichmentTerminalAt: now }); result.noPublishedContact++; continue; }
      seed = await saveGtmChannelSeed({ ...seed, scannerValidatedContact: candidate, scrapeGraphEvidence: evidence, enrichmentProvider: "scrapegraphai", enrichmentProviderStatus: "PROCESSING", enrichmentResult: "ScrapeGraphAI found a current role-fit public email on a verified official organization page. Instantly standalone verification is in progress; the candidate is not READY yet.", enrichmentLastCheckedAt: now, enrichmentUpdatedAt: now });
      contact = candidate;
    }
    const email = String(contact.email || "").trim().toLowerCase();
    if (!email) { await defer(seed, "NO_EXPLICIT_PUBLISHED_ROLE_FIT_EMAIL", now); continue; }
    try {
      const verification = await client.ensureEmailVerification(email);
      const status = verificationDisposition(verification);
      const verificationId = stableVerificationId(email);
      if (status === "PENDING") { await saveGtmChannelSeed({ ...seed, lifecycle: "EVIDENCE_QUALIFIED", scrapeGraphVerificationJobId: verificationId, scrapeGraphVerificationStatus: "PENDING", scrapeGraphVerificationSubmittedAt: seed.scrapeGraphVerificationSubmittedAt || now, scrapeGraphVerificationLastCheckedAt: now, enrichmentProvider: "scrapegraphai+instantly_email_verification", enrichmentProviderStatus: "PROCESSING", enrichmentResult: "Instantly standalone verification is pending. Provider acceptance is not a verified email and cannot create READY inventory.", enrichmentLastCheckedAt: now, enrichmentUpdatedAt: now }); result.pendingVerification++; continue; }
      if (status !== "VERIFIED") { await saveGtmChannelSeed({ ...seed, lifecycle: "ENRICHMENT_FAILED", rejectionReason: `INSTANTLY_VERIFICATION_${status}`, scrapeGraphVerificationJobId: verificationId, scrapeGraphVerificationStatus: status, scrapeGraphVerificationLastCheckedAt: now, enrichmentProvider: "scrapegraphai+instantly_email_verification", enrichmentProviderStatus: "FAILED", enrichmentResult: "Instantly standalone verification did not return an acceptable individual work-email result. No campaign enrollment occurred.", enrichmentLastProviderError: `INSTANTLY_VERIFICATION_${status}`, enrichmentLastCheckedAt: now, enrichmentUpdatedAt: now, enrichmentTerminalAt: now }); continue; }
      const record = await recordInstantlyVerifiedGtmContact({ prospectChannel: segment === "DIRECT" ? "DIRECT_NONPROFIT" : "PARTNER_ACCOUNTING", organization: seed.organization, organizationDomain: seed.organizationDomain!, domainSourceUrl: seed.officialOrganizationEvidenceUrl || seed.sourceUrl, person: { firstName: contact.firstName, lastName: contact.lastName, fullName: contact.fullName, currentTitle: contact.title, titleSourceUrl: contact.sourceUrl, titleObservedAt: contact.observedAt, responsibilityEvidence: "ScrapeGraphAI extracted an explicitly published current role-fit contact from the verified official organization page." } }, email, verificationId, contact.sourceUrl);
      if (!record.readyForHumanApproval) { await saveGtmChannelSeed({ ...seed, lifecycle: "ENRICHMENT_FAILED", rejectionReason: record.verification.readyBlocker || "CANONICAL_CONTACT_GATE_REJECTED", scrapeGraphVerificationJobId: verificationId, scrapeGraphVerificationStatus: "VERIFIED", scrapeGraphVerificationLastCheckedAt: now, enrichmentProvider: "scrapegraphai+instantly_email_verification", enrichmentProviderStatus: "FAILED", enrichmentResult: "Instantly verified the public email, but a canonical suppression, prior-contact, organization, role, or segment gate rejected it. No enrollment occurred.", enrichmentLastProviderError: record.verification.readyBlocker || "CANONICAL_CONTACT_GATE_REJECTED", enrichmentLastCheckedAt: now, enrichmentUpdatedAt: now, enrichmentTerminalAt: now }); continue; }
      await saveGtmChannelSeed({ ...seed, lifecycle: "VERIFIED", rejectionReason: null, scrapeGraphVerificationJobId: verificationId, scrapeGraphVerificationStatus: "VERIFIED", scrapeGraphVerificationLastCheckedAt: now, enrichmentProvider: "scrapegraphai+instantly_email_verification", enrichmentProviderStatus: "COMPLETED", enrichmentResult: "ScrapeGraphAI public contact evidence and Instantly standalone verification passed. Canonical suppression, deduplication, capacity, and clean-campaign handoff gates remain required.", enrichmentLastProviderError: null, enrichmentLastCheckedAt: now, enrichmentUpdatedAt: now, enrichmentTerminalAt: null });
      result.submitted++;
    } catch (error) { await defer(seed, "INSTANTLY_EMAIL_VERIFICATION_UNAVAILABLE", now, null, null, safeError(error)); result.pendingVerification++; }
  }
  return result;
}

export function verificationDisposition(value: { verification_status?: string; catch_all?: boolean | string }) { const raw = String(value.verification_status || "").trim().toLowerCase(); const catchAll = value.catch_all === true || String(value.catch_all).toLowerCase() === "true"; if (catchAll) return "ACCEPT_ALL"; if (["verified", "valid", "deliverable"].includes(raw)) return "VERIFIED"; if (["pending", "processing", "queued", "in_progress", ""].includes(raw)) return "PENDING"; if (["invalid", "undeliverable", "not_found"].includes(raw)) return "INVALID"; if (["risky", "risky_email"].includes(raw)) return "RISKY"; return "UNKNOWN"; }
async function defer(seed: ChannelSeedRecord, reason: string, now: string, httpStatus: number | null = null, requestId: string | null = null, detail?: string) { await saveGtmChannelSeed({ ...seed, lifecycle: "EVIDENCE_QUALIFIED", enrichmentProvider: "scrapegraphai+instantly_email_verification", enrichmentProviderStatus: "PROCESSING", enrichmentLastProviderError: `${reason}${httpStatus ? `_HTTP_${httpStatus}` : ""}${requestId ? `_REQUEST_${requestId}` : ""}`.slice(0, 500), enrichmentResult: detail || "The contact remains deferred. No generated email, campaign handoff, or send was attempted.", enrichmentLastCheckedAt: now, enrichmentUpdatedAt: now }); }
function stableVerificationId(email: string) { return `instantly_verification_${createHash("sha256").update(email).digest("hex").slice(0, 32)}`; }
function stableId(seedId: string) { return `scrapegraph_${createHash("sha256").update(seedId).digest("hex").slice(0, 24)}`; }
function roleFits(segment: "DIRECT" | "PARTNER", title: string) { return segment === "DIRECT" ? /\b(cfo|finance|controller|grants|executive director|chief operating)\b/i.test(title) : /\b(founder|ceo|partner|principal|fractional cfo|director)\b/i.test(title); }
function publicUrl(value: string) { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url : null; } catch { return null; } }
export function scannerScrapeGraphPageLimit(env: NodeJS.ProcessEnv = process.env) { const configured = Number(env.GTM_SCRAPEGRAPH_PAGES_PER_ORG || 3); return Number.isInteger(configured) && configured > 0 ? Math.min(3, configured) : 3; }
/** Returns the verified homepage plus a tiny, deterministic set of safe same-host staff/contact pages. */
export async function officialContactPages(official: URL, maximum: number): Promise<string[]> {
  const root = canonicalPage(official);
  if (!root || maximum < 1 || !await isPublicHostname(official.hostname)) return [];
  const pages = [root];
  if (maximum === 1) return pages;
  try {
    const response = await fetch(official, { redirect: "error", headers: { Accept: "text/html" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok || !String(response.headers.get("content-type") || "").toLowerCase().includes("text/html") || Number(response.headers.get("content-length") || 0) > 512_000) return pages;
    const html = await boundedText(response, 512_000);
    for (const page of selectOfficialContactPages(official, html, maximum)) { if (!pages.includes(page)) pages.push(page); if (pages.length >= maximum) break; }
  } catch { /* A homepage is still safe to examine; link discovery is optional. */ }
  return pages;
}
export function selectOfficialContactPages(official: URL, html: string, maximum = 3): string[] {
  if (maximum < 2) return [];
  const pages = new Set<string>();
  const matches = html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#?]+)["'][^>]*>/gi);
  for (const match of matches) {
    try { const url = new URL(match[1]!, official); const page = canonicalPage(url); if (page && url.hostname === official.hostname && officialContactPath.test(url.pathname)) pages.add(page); } catch { /* untrusted anchor */ }
  }
  return [...pages].sort((left, right) => pagePriority(left) - pagePriority(right) || left.localeCompare(right)).slice(0, Math.max(0, maximum - 1));
}
function canonicalPage(url: URL) { return url.protocol === "https:" && !url.username && !url.password ? `${url.origin}${url.pathname.replace(/\/+$/, "") || "/"}` : null; }
function pagePriority(page: string) { const value = new URL(page).pathname.toLowerCase(); const priority = ["leadership", "staff", "team", "people", "our-team", "finance", "grants", "contact", "about", "who-we-are"].findIndex((part) => value.includes(part)); return priority < 0 ? Number.MAX_SAFE_INTEGER : priority; }
async function isPublicHostname(hostname: string) { try { const addresses = await lookup(hostname, { all: true, verbatim: true }); return Boolean(addresses.length) && !addresses.some((entry) => privateAddress(entry.address)); } catch { return false; } }
async function supportsPublishedContact(url: URL, organization: string, contact: { fullName: string; title: string; email: string }) { try { const addresses = await lookup(url.hostname, { all: true, verbatim: true }); if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) return false; const response = await fetch(url, { redirect: "error", headers: { Accept: "text/html,application/pdf;q=0.9" }, signal: AbortSignal.timeout(15_000) }); if (!response.ok || Number(response.headers.get("content-length") || 0) > 512_000) return false; const text = (await boundedText(response, 512_000)).toLowerCase(); const pieces = organization.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((part) => part.length > 2); return pieces.every((part) => text.includes(part)) && text.includes(contact.fullName.toLowerCase()) && text.includes(contact.title.toLowerCase()) && text.includes(contact.email.toLowerCase()); } catch { return false; } }
async function boundedText(response: Response, maximum: number) { const reader = response.body?.getReader(); if (!reader) return ""; const chunks: Uint8Array[] = []; let size = 0; try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maximum) { await reader.cancel(); return ""; } chunks.push(value); } } finally { reader.releaseLock(); } const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } return new TextDecoder().decode(bytes); }
function privateAddress(address: string) { const value = address.toLowerCase(); return value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd") || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value); }
function safeError(error: unknown) { return error instanceof Error ? error.message.slice(0, 500) : "Provider verification request failed."; }
