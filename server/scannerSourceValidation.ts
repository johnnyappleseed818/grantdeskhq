import { lookup } from "node:dns/promises";
import { listGtmChannelSeeds, saveGtmChannelSeed } from "./persistence.ts";
import { resolveHunterOrganizationDomain } from "./contactEnrichmentProviders.ts";
import type { ChannelSeedRecord } from "../src/lib/gtmChannelSeeds.ts";

type ScannerValidationOutcome = {
  canonicalRecordId: string;
  segment: ChannelSeedRecord["segment"];
  disposition: "QUALIFIED" | "DEFERRED" | "REJECTED";
  reason: string;
};

/** A public discovery page need not be the organization\x27s own site. */
export async function validateScannerSourceSeeds(env: NodeJS.ProcessEnv = process.env) {
  const now = new Date().toISOString();
  const candidates = (await listGtmChannelSeeds())
    .filter((seed) => seed.source === "chatgpt_scanner_drive" && scannerValidationDue(seed, now, env))
    .slice(0, configuredLimit(env));
  const result = {
    selected: candidates.length, validated: 0, deferred: 0, rejected: 0, remediated: 0,
    provider: "hunter_domain_finder+public_source",
    scrapegraphConfigured: Boolean((env.SCRAPEGRAPH_API_KEY || env.SGAI_API_KEY || "").trim()),
    blocked: null as string | null,
    outcomes: [] as ScannerValidationOutcome[]
  };
  if (!env.HUNTER_API_KEY?.trim()) return { ...result, blocked: "HUNTER_NOT_CONFIGURED" };
  for (const seed of candidates) {
    const source = publicSource(seed.sourceUrl);
    if (!source) {
      await recordValidationOutcome(seed, "REJECTED", "UNSAFE_OR_MALFORMED_SOURCE_URL", "The scanner source is not a permitted public HTTPS URL.", now, env);
      result.rejected++;
      result.outcomes.push({ canonicalRecordId: seed.id, segment: seed.segment, disposition: "REJECTED", reason: "UNSAFE_OR_MALFORMED_SOURCE_URL" });
      continue;
    }
    const resolved = await resolveHunterOrganizationDomain(seed.organization, {
      enabled: env.GTM_CONTACT_ENRICHMENT_ENABLED === "true", apiKey: env.HUNTER_API_KEY, lookupLimit: 1, lookupsUsed: 0
    });
    if (resolved.status !== "FOUND" || !resolved.domain) {
      const disposition = resolved.status === "NOT_FOUND" ? "REJECTED" : "DEFERRED";
      const reason = resolved.status === "NOT_FOUND" ? "OFFICIAL_DOMAIN_NOT_FOUND" : `HUNTER_DOMAIN_${String(resolved.errorCategory || "UNAVAILABLE").toUpperCase()}`;
      await recordValidationOutcome(seed, disposition, reason, "The official organization domain could not be independently resolved.", now, env);
      result[disposition === "REJECTED" ? "rejected" : "deferred"]++;
      result.outcomes.push({ canonicalRecordId: seed.id, segment: seed.segment, disposition, reason });
      continue;
    }
    if (!await sourceSupportsOrganizationSignal(source, seed.organization, seed.segment)) {
      await recordValidationOutcome(seed, "REJECTED", "SOURCE_CLAIM_NOT_INDEPENDENTLY_VERIFIED", "The public source did not support the organization identity and the required segment-specific signal.", now, env);
      result.rejected++;
      result.outcomes.push({ canonicalRecordId: seed.id, segment: seed.segment, disposition: "REJECTED", reason: "SOURCE_CLAIM_NOT_INDEPENDENTLY_VERIFIED" });
      continue;
    }
    const officialUrl = `https://${resolved.domain}`;
    await saveGtmChannelSeed({
      ...seed, lifecycle: "EVIDENCE_QUALIFIED", organizationDomain: resolved.domain,
      officialOrganizationUrl: officialUrl, officialOrganizationEvidenceUrl: officialUrl,
      qualificationProvider: "hunter_domain_finder+public_source", qualificationUpdatedAt: now,
      rejectionReason: null, enrichmentProvider: "hunter_domain_finder",
      validationDisposition: "QUALIFIED", validationAttemptCount: (seed.validationAttemptCount || 0) + 1,
      validationLastAttemptAt: now, validationNextAttemptAt: null,
      enrichmentResult: "Organization identity and public signal are qualified. Hunter contact discovery and email verification are now required; no contact is inferred from the source page.",
      evidenceSummary: `${seed.evidenceSummary} Official domain independently resolved for the organization; public source supports the segment signal.`,
      qualificationReasons: [...seed.qualificationReasons, "Official domain independently resolved by Hunter Domain Finder.", "Public source independently supports the organization and segment-specific signal."],
      enrichmentUpdatedAt: now
    });
    result.validated++;
    result.outcomes.push({ canonicalRecordId: seed.id, segment: seed.segment, disposition: "QUALIFIED", reason: "EVIDENCE_QUALIFIED" });
  }
  return result;
}

async function recordValidationOutcome(seed: ChannelSeedRecord, disposition: "DEFERRED" | "REJECTED", reason: string, detail: string, now: string, env: NodeJS.ProcessEnv) {
  const attempts = (seed.validationAttemptCount || 0) + 1;
  const exhausted = disposition === "DEFERRED" && attempts >= configuredMaxAttempts(env);
  const finalDisposition = exhausted ? "REJECTED" : disposition;
  const nextAttempt = finalDisposition === "DEFERRED" ? new Date(Date.parse(now) + retryDelayMs(attempts)).toISOString() : null;
  await saveGtmChannelSeed({
    ...seed,
    lifecycle: finalDisposition === "REJECTED" ? "REJECTED" : "ROLE_UNRESOLVED",
    rejectionReason: exhausted ? `${reason}_RETRY_EXHAUSTED` : reason,
    enrichmentResult: detail,
    qualificationProvider: "hunter_domain_finder+public_source",
    qualificationUpdatedAt: now,
    validationDisposition: finalDisposition,
    validationAttemptCount: attempts,
    validationLastAttemptAt: now,
    validationNextAttemptAt: nextAttempt,
    enrichmentUpdatedAt: now
  });
}

/** Legacy ROLE_UNRESOLVED scanner records lacked retry metadata. They get one
 * bounded re-evaluation, then persist an explicit terminal or deferred state. */
export function scannerValidationDue(seed: ChannelSeedRecord, now: string, env: NodeJS.ProcessEnv = process.env) {
  if (seed.lifecycle === "DISCOVERED") return true;
  if (seed.lifecycle !== "ROLE_UNRESOLVED") return false;
  const attempts = seed.validationAttemptCount || 0;
  if (attempts >= configuredMaxAttempts(env)) return false;
  if (seed.validationDisposition && seed.validationDisposition !== "DEFERRED") return false;
  const next = Date.parse(seed.validationNextAttemptAt || "");
  return !Number.isFinite(next) || next <= Date.parse(now);
}

function retryDelayMs(attempts: number) {
  return Math.min(24 * 60 * 60 * 1000, 15 * 60 * 1000 * 2 ** Math.max(0, attempts - 1));
}

async function sourceSupportsOrganizationSignal(source: URL, organization: string, segment: ChannelSeedRecord["segment"]) {
  try {
    const addresses = await lookup(source.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) return false;
    const response = await fetch(source, { redirect: "error", headers: { Accept: "text/html,application/pdf;q=0.9" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok || Number(response.headers.get("content-length") || 0) > 512_000) return false;
    const text = await boundedText(response, 512_000);
    const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    const parts = organization.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((part) => part.length > 2);
    const mention = parts.length > 0 && parts.every((part) => normalized.includes(part));
    const signal = segment === "DIRECT" ? /grant|funder|restricted fund|compliance|budget|report/.test(normalized) : /nonprofit|fractional cfo|accounting|grant|fiscal|controller/.test(normalized);
    return mention && signal;
  } catch { return false; }
}

async function boundedText(response: Response, maximum: number) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); return ""; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function privateAddress(address: string) {
  const value = address.toLowerCase();
  return value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd") || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value);
}
function publicSource(value: string) {
  try {
    const url = new URL(value); const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.protocol === "https:" && !url.username && !url.password && !/^(localhost|metadata\.google\.internal|127\.|10\.|192\.168\.|169\.254\.)/.test(host) ? url : null;
  } catch { return null; }
}
function configuredLimit(env: NodeJS.ProcessEnv) {
  const value = Number(env.GTM_SCANNER_VALIDATION_MAX_PER_RUN || 10);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 30) : 10;
}
function configuredMaxAttempts(env: NodeJS.ProcessEnv) {
  const value = Number(env.GTM_SCANNER_VALIDATION_MAX_ATTEMPTS || 3);
  return Number.isInteger(value) && value >= 1 ? Math.min(value, 5) : 3;
}

/** Legacy helper retained for regression coverage. It is intentionally not a qualification gate. */
export function sourceProvesOrganizationDomain(seed: Pick<ChannelSeedRecord, "sourceUrl" | "scannerClaimedDomain">) {
  const source = publicSource(seed.sourceUrl);
  const claimed = String(seed.scannerClaimedDomain || "").trim().toLowerCase().replace(/^www\./, "");
  return Boolean(source && claimed && (source.hostname === claimed || source.hostname.endsWith(`.${claimed}`)));
}
function legacyRoleFits(segment: ChannelSeedRecord["segment"], title: string) { return segment === "DIRECT" ? /\b(cfo|finance|controller|grants|executive director|chief operating)\b/i.test(title) : /\b(founder|ceo|partner|principal|fractional cfo|director)\b/i.test(title); }
export function scannerEvidenceBackedIdentity(seed: ChannelSeedRecord, markdown: string) {
  const hint = seed.scannerUnknownFields?.role_or_public_identity_text;
  if (typeof hint !== "string" || !markdown) return null;
  const match = hint.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z.\x27-]+){1,3})\s*,?\s*([^;]{3,120})/);
  if (!match || !markdown.toLowerCase().includes(match[1].toLowerCase()) || !legacyRoleFits(seed.segment, match[2])) return null;
  const fullName = match[1].trim(); const title = match[2].trim();
  const [firstName, ...last] = fullName.split(/\s+/); const lastName = last.at(-1) || "";
  return lastName ? { firstName, lastName, fullName, title, sourceUrl: seed.sourceUrl } : null;
}
