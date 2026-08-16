import { isVerifiedBusinessEmail, normalizeBusinessDomain, type ContactEnrichmentProviderName, type EmailSource, type EmailVerificationStatus, type EnrichmentTarget, type ProviderLookupResult } from "../src/lib/contactEnrichment.ts";

type Fetcher = (input: URL | string, init?: RequestInit) => Promise<Response>;

export interface ProviderRuntimeLimits {
  enabled: boolean;
  lookupLimit: number;
  lookupsUsed: number;
}

export interface HunterProviderConfiguration extends ProviderRuntimeLimits {
  apiKey?: string;
  fetcher?: Fetcher;
}

export interface ApolloProviderConfiguration extends ProviderRuntimeLimits {
  apiKey?: string;
  fetcher?: Fetcher;
}

export function createHunterProvider(configuration: HunterProviderConfiguration) {
  const fetcher = configuration.fetcher || fetch;
  const apiKey = configuration.apiKey?.trim() || "";
  return {
    name: "hunter" as const,
    async discover(target: EnrichmentTarget): Promise<ProviderLookupResult> {
      const unavailable = providerUnavailable("hunter", configuration, "not_configured");
      if (unavailable) return unavailable;
      try {
        const finderUrl = new URL("https://api.hunter.io/v2/email-finder");
        finderUrl.searchParams.set("domain", normalizeBusinessDomain(target.organizationDomain));
        finderUrl.searchParams.set("first_name", target.person.firstName);
        finderUrl.searchParams.set("last_name", target.person.lastName);
        finderUrl.searchParams.set("api_key", apiKey);
        const finderResponse = await fetcher(finderUrl, { signal: AbortSignal.timeout(12_000) });
        if (!finderResponse.ok) return providerFailure("hunter", finderResponse.status);
        const finder = await parseJson(finderResponse);
        const candidate = stringAt(finder, ["data", "email"]);
        if (!candidate || !isVerifiedBusinessEmail(candidate, target.organizationDomain)) return providerResult("hunter", "NOT_FOUND", { attempted: true, providerMetadata: { finderCalled: true } });

        const verifierUrl = new URL("https://api.hunter.io/v2/email-verifier");
        verifierUrl.searchParams.set("email", candidate);
        verifierUrl.searchParams.set("api_key", apiKey);
        const verifierResponse = await fetcher(verifierUrl, { signal: AbortSignal.timeout(12_000) });
        if (!verifierResponse.ok) return providerFailure("hunter", verifierResponse.status, { email: candidate, providerMetadata: { verifierCalled: true } });
        const verifier = await parseJson(verifierResponse);
        const verificationStatus = hunterVerificationStatus(stringAt(verifier, ["data", "status"]), booleanAt(verifier, ["data", "accept_all"]));
        return providerResult("hunter", verificationStatus, {
          email: candidate,
          confidence: numberAt(verifier, ["data", "score"]) ?? numberAt(finder, ["data", "score"]),
          acceptAll: verificationStatus === "ACCEPT_ALL",
          sourceUrls: dedupeSources([...hunterSources(finder), ...hunterSources(verifier)]),
          attempted: true,
          providerMetadata: { finderCalled: true, verifierCalled: true, smtpCheck: booleanAt(verifier, ["data", "smtp_check"]) ?? false }
        });
      } catch (error) {
        return providerResult("hunter", "UNAVAILABLE", { attempted: true, errorCategory: isAbort(error) ? "network" : "provider_error", providerMetadata: { finderCalled: true } });
      }
    }
  };
}

export function createApolloProvider(configuration: ApolloProviderConfiguration) {
  const fetcher = configuration.fetcher || fetch;
  const apiKey = configuration.apiKey?.trim() || "";
  return {
    name: "apollo" as const,
    async discover(target: EnrichmentTarget): Promise<ProviderLookupResult> {
      const unavailable = providerUnavailable("apollo", configuration, "not_configured");
      if (unavailable) return unavailable;
      try {
        const response = await fetcher("https://api.apollo.io/api/v1/people/match", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": apiKey
          },
          body: JSON.stringify({ first_name: target.person.firstName, last_name: target.person.lastName, organization_name: target.organization, domain: normalizeBusinessDomain(target.organizationDomain), reveal_personal_emails: false, reveal_phone_number: false }),
          signal: AbortSignal.timeout(12_000)
        });
        if (!response.ok) return providerFailure("apollo", response.status);
        const body = await parseJson(response);
        const person = objectAt(body, ["person"]);
        const candidate = typeof person?.email === "string" ? person.email : "";
        if (!candidate || !isVerifiedBusinessEmail(candidate, target.organizationDomain)) return providerResult("apollo", "NOT_FOUND", { attempted: true, providerMetadata: { peopleMatchCalled: true } });
        const status = apolloVerificationStatus(typeof person?.email_status === "string" ? person.email_status : "");
        return providerResult("apollo", status, {
          email: candidate,
          confidence: status === "VERIFIED" ? 100 : undefined,
          sourceUrls: [],
          attempted: true,
          providerMetadata: { peopleMatchCalled: true, emailStatus: typeof person?.email_status === "string" ? person.email_status : "unavailable", revealedPersonalEmail: false, revealedPhone: false }
        });
      } catch (error) {
        return providerResult("apollo", "UNAVAILABLE", { attempted: true, errorCategory: isAbort(error) ? "network" : "provider_error", providerMetadata: { peopleMatchCalled: true } });
      }
    }
  };
}

function providerUnavailable(provider: ContactEnrichmentProviderName, configuration: ProviderRuntimeLimits & { apiKey?: string }, missingKeyCategory: "not_configured") {
  if (!configuration.enabled) return providerResult(provider, "UNAVAILABLE", { attempted: false, errorCategory: "not_configured", providerMetadata: { enabled: false } });
  if (!configuration.apiKey?.trim()) return providerResult(provider, "UNAVAILABLE", { attempted: false, errorCategory: missingKeyCategory, providerMetadata: { credentialConfigured: false } });
  if (configuration.lookupLimit <= configuration.lookupsUsed) return providerResult(provider, "UNAVAILABLE", { attempted: false, errorCategory: "limit_reached", providerMetadata: { lookupLimit: configuration.lookupLimit } });
  return null;
}

function providerFailure(provider: ContactEnrichmentProviderName, statusCode: number, details: Partial<ProviderLookupResult> = {}) {
  const errorCategory = statusCode === 401 ? "authentication" : statusCode === 403 || statusCode === 429 ? "rate_limited" : "provider_error";
  return providerResult(provider, "UNAVAILABLE", { ...details, attempted: true, errorCategory, providerMetadata: { ...(details.providerMetadata || {}), httpStatus: statusCode } });
}

function providerResult(provider: ContactEnrichmentProviderName, status: EmailVerificationStatus, details: Partial<ProviderLookupResult>): ProviderLookupResult {
  return {
    provider,
    status,
    sourceUrls: [],
    providerMetadata: {},
    attemptedAt: new Date().toISOString(),
    attempted: false,
    ...details
  };
}

function hunterVerificationStatus(status: string | undefined, acceptAll: boolean | undefined): EmailVerificationStatus {
  if (acceptAll || status === "accept_all") return "ACCEPT_ALL";
  if (status === "valid") return "VERIFIED";
  if (status === "invalid") return "INVALID";
  return "UNKNOWN";
}

function apolloVerificationStatus(status: string): EmailVerificationStatus {
  return status.toLowerCase() === "verified" ? "VERIFIED" : status.toLowerCase() === "invalid" ? "INVALID" : "UNKNOWN";
}

function hunterSources(value: unknown): EmailSource[] {
  const sources = arrayAt(value, ["data", "sources"]);
  return sources.flatMap((source) => {
    if (!source || typeof source !== "object") return [];
    const row = source as Record<string, unknown>;
    const url = typeof row.uri === "string" ? row.uri : "";
    if (!/^https:\/\//.test(url)) return [];
    const lastSeenAt = typeof row.last_seen_on === "string" ? row.last_seen_on : undefined;
    return [{ url, ...(lastSeenAt ? { lastSeenAt } : {}) }];
  });
}

function dedupeSources(sources: EmailSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

async function parseJson(response: Response) {
  try { return await response.json() as unknown; }
  catch { throw new Error("invalid_provider_response"); }
}

function objectAt(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current && typeof current === "object" ? current as Record<string, unknown> : null;
}

function arrayAt(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return [];
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current) ? current : [];
}

function stringAt(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current.trim() : undefined;
}

function numberAt(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "number" && Number.isFinite(current) ? current : undefined;
}

function booleanAt(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "boolean" ? current : undefined;
}

function isAbort(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || /timeout/i.test(error.message));
}
