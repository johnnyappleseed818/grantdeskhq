import { listGtmChannelSeeds, saveGtmChannelSeed } from "./persistence.ts";
import type { ChannelSeedRecord } from "../src/lib/gtmChannelSeeds.ts";

const nonOrganizationSourceHosts = new Set(["linkedin.com", "indeed.com", "idealist.org", "lensa.com", "mcjobboard.net"]);
const minimumScrapeGraphCreditHeadroom = 100;

/**
 * Bounded, evidence-first validation for scanner imports. This cannot create a
 * contact, run Hunter, stage an Instantly lead, or send an email. It only
 * advances a row when an organisation-controlled source independently names a
 * relevant person and role; every other row remains unresolved or rejected.
 */
export async function validateScannerSourceSeeds(env: NodeJS.ProcessEnv = process.env) {
  const allSeeds = await listGtmChannelSeeds();
  const unsafePriorValidation = allSeeds.filter((seed) => seed.source === "chatgpt_scanner_drive" && seed.lifecycle === "ENRICHMENT_PENDING" && seed.scannerValidatedContact && !sourceProvesOrganizationDomain(seed));
  const now = new Date().toISOString();
  for (const seed of unsafePriorValidation) {
    await saveGtmChannelSeed({ ...seed, lifecycle: "ROLE_UNRESOLVED", organizationDomain: null, scannerValidatedContact: null, rejectionReason: "NO_ORGANIZATION_CONTROLLED_DOMAIN_PROOF", enrichmentResult: "Prior scanner validation lacked a claimed organization domain matching the public source; the record remains discovery research and cannot enter Hunter or outbound.", enrichmentUpdatedAt: now });
  }
  const candidates = allSeeds
    .filter((seed) => seed.source === "chatgpt_scanner_drive" && seed.lifecycle === "DISCOVERED")
    .slice(0, configuredLimit(env));
  const result = { selected: candidates.length, validated: 0, roleUnresolved: 0, rejected: 0, remediated: unsafePriorValidation.length, provider: "scrapegraph", creditsRemaining: null as number | null, blocked: null as string | null };
  const apiKey = (env.SCRAPEGRAPH_API_KEY || env.SGAI_API_KEY || "").trim();
  if (!apiKey) return { ...result, blocked: "SCRAPEGRAPH_NOT_CONFIGURED" };
  const credits = await creditsRemaining(apiKey);
  result.creditsRemaining = credits;
  if (credits === null) return { ...result, blocked: "SCRAPEGRAPH_CREDITS_UNAVAILABLE" };
  if (credits - candidates.length < minimumScrapeGraphCreditHeadroom) return { ...result, blocked: "SCRAPEGRAPH_CREDIT_HEADROOM" };
  for (const seed of candidates) {
    const source = publicSource(seed.sourceUrl);
    if (!source || nonOrganizationSourceHosts.has(source.hostname)) {
      await saveGtmChannelSeed({ ...seed, lifecycle: "ROLE_UNRESOLVED", rejectionReason: "SCANNER_SOURCE_NOT_ORGANIZATION_CONTROLLED", enrichmentResult: "Scanner source is a job board or social profile; organization identity and named buyer remain unverified.", enrichmentUpdatedAt: new Date().toISOString() });
      result.roleUnresolved += 1; continue;
    }
    if (!sourceProvesOrganizationDomain(seed)) {
      await saveGtmChannelSeed({ ...seed, lifecycle: "ROLE_UNRESOLVED", rejectionReason: "NO_ORGANIZATION_CONTROLLED_DOMAIN_PROOF", enrichmentResult: "A claimed organization domain matching the public source is required before source extraction or Hunter enrichment; this scanner row remains research-only.", enrichmentUpdatedAt: new Date().toISOString() });
      result.roleUnresolved += 1; continue;
    }
    const markdown = await scrapeMarkdown(apiKey, source.toString());
    const identity = scannerEvidenceBackedIdentity(seed, markdown);
    if (!identity) {
      await saveGtmChannelSeed({ ...seed, lifecycle: "ROLE_UNRESOLVED", rejectionReason: "NO_SOURCE_VERIFIED_NAMED_ROLE", enrichmentResult: "Organization-controlled source did not establish a named, relevant buyer or partner owner.", enrichmentUpdatedAt: new Date().toISOString() });
      result.roleUnresolved += 1; continue;
    }
    const organizationDomain = normalizedDomain(seed.scannerClaimedDomain!);
    await saveGtmChannelSeed({ ...seed, lifecycle: "ENRICHMENT_PENDING", organizationDomain, sourceUrl: source.toString(), evidenceSummary: `${seed.evidenceSummary} Independent source validation confirmed ${identity.fullName}, ${identity.title}.`, qualificationReasons: [...seed.qualificationReasons, "Organization-controlled source and named role independently validated by ScrapeGraphAI markdown extraction."], scannerValidatedContact: identity, enrichmentProvider: "scrapegraph_source_validation", enrichmentResult: "Source validated; Hunter email finder and verifier are now permitted for this named individual.", enrichmentUpdatedAt: new Date().toISOString() } as ChannelSeedRecord);
    result.validated += 1;
  }
  return result;
}

function normalizedDomain(value: string) { return value.trim().toLowerCase().replace(/^www\./, ""); }
export function sourceProvesOrganizationDomain(seed: Pick<ChannelSeedRecord, "sourceUrl" | "scannerClaimedDomain">) {
  const source = publicSource(seed.sourceUrl);
  const claimed = typeof seed.scannerClaimedDomain === "string" ? normalizedDomain(seed.scannerClaimedDomain) : "";
  if (!source || !claimed || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(claimed)) return false;
  const host = normalizedDomain(source.hostname);
  return host === claimed || host.endsWith(`.${claimed}`);
}

function publicSource(value: string) { try { const url = new URL(value); const host = url.hostname.toLowerCase().replace(/^www\./, ""); return url.protocol === "https:" && !url.username && !url.password && !/^(localhost|metadata\.google\.internal|127\.|10\.|192\.168\.|169\.254\.)/.test(host) ? url : null; } catch { return null; } }
async function creditsRemaining(apiKey: string) { try { const response = await fetch("https://v2-api.scrapegraphai.com/api/credits", { headers: { "SGAI-APIKEY": apiKey }, signal: AbortSignal.timeout(12_000) }); if (!response.ok) return null; const body = await response.json() as Record<string, unknown>; const value = body.remaining ?? body.credits ?? (body.data as Record<string, unknown> | undefined)?.remaining; return typeof value === "number" && Number.isFinite(value) ? value : null; } catch { return null; } }
async function scrapeMarkdown(apiKey: string, url: string) { try { const response = await fetch("https://v2-api.scrapegraphai.com/api/scrape", { method: "POST", headers: { "Content-Type": "application/json", "SGAI-APIKEY": apiKey }, body: JSON.stringify({ url, formats: [{ type: "markdown", mode: "reader" }], fetchConfig: { mode: "auto", timeout: 20_000 } }), signal: AbortSignal.timeout(30_000) }); if (!response.ok) return ""; const body = await response.json() as { results?: { markdown?: { data?: unknown } } }; const data = body.results?.markdown?.data; return Array.isArray(data) && typeof data[0] === "string" ? data[0].slice(0, 80_000) : ""; } catch { return ""; } }
export function scannerEvidenceBackedIdentity(seed: ChannelSeedRecord, markdown: string) {
function configuredLimit(env: NodeJS.ProcessEnv) { const value = Number(env.GTM_SCANNER_VALIDATION_MAX_PER_RUN || 10); return Number.isInteger(value) && value > 0 ? Math.min(value, 30) : 10; }
  const hint = seed.scannerUnknownFields?.role_or_public_identity_text;
  if (typeof hint !== "string" || !markdown) return null;
  const match = hint.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){1,3})\s*,?\s*([^;]{3,120})/);
  if (!match) return null;
  const fullName = match[1].trim(); const title = match[2].trim();
  const normalized = markdown.toLowerCase();
  if (!normalized.includes(fullName.toLowerCase()) || !roleFits(seed.segment, title)) return null;
  const [firstName, ...last] = fullName.split(/\s+/); const lastName = last.at(-1) || "";
  return lastName ? { firstName, lastName, fullName, title, sourceUrl: seed.sourceUrl } : null;
}
function roleFits(segment: ChannelSeedRecord["segment"], title: string) { return segment === "DIRECT" ? /\b(cfo|finance|controller|grants|executive director|chief operating)\b/i.test(title) : /\b(founder|ceo|partner|principal|fractional cfo|director)\b/i.test(title); }
