import { createHash } from "node:crypto";

const apiBase = "https://v2-api.scrapegraphai.com/api";
const maximumCumulativeCredits = 400;
const minimumProviderHeadroom = 100;
const extractCreditCost = 5;

export type ScrapeGraphErrorCategory = "not_configured" | "insufficient_credits" | "authentication" | "rate_limited" | "provider_error" | "network" | "invalid_response";
export type ScrapeGraphCreditBalance = { status: "AVAILABLE" | "UNAVAILABLE"; remaining: number | null; httpStatus: number | null; providerRequestId: string | null; errorCategory?: ScrapeGraphErrorCategory };
export type PublicContactExtraction = {
  status: "FOUND" | "NO_CONTACT" | "UNAVAILABLE";
  requestId: string | null;
  officialOrganizationUrl: string | null;
  officialOrganizationName: string | null;
  evidenceSummary: string | null;
  contact: { firstName: string; lastName: string; fullName: string; title: string; email: string; sourceUrl: string } | null;
  httpStatus: number | null;
  errorCategory?: ScrapeGraphErrorCategory;
};

export type ScrapeGraphRuntimeConfiguration = {
  enabled: boolean;
  apiKey: string;
  maximumCumulativeCredits: number;
  minimumProviderHeadroom: number;
  extractCreditCost: number;
  fetcher?: typeof fetch;
};

export function scrapeGraphRuntimeConfiguration(env: NodeJS.ProcessEnv = process.env): ScrapeGraphRuntimeConfiguration {
  return {
    enabled: env.GTM_SCRAPEGRAPH_ENABLED === "true",
    apiKey: (env.SCRAPEGRAPH_API_KEY || env.SGAI_API_KEY || "").trim(),
    maximumCumulativeCredits,
    minimumProviderHeadroom,
    extractCreditCost
  };
}

export function scrapeGraphBudgetAllowsCall(input: { creditsAlreadyReserved: number; providerRemaining: number | null; configuration?: Pick<ScrapeGraphRuntimeConfiguration, "maximumCumulativeCredits" | "minimumProviderHeadroom" | "extractCreditCost"> }) {
  const configuration = input.configuration || { maximumCumulativeCredits, minimumProviderHeadroom, extractCreditCost };
  if (input.creditsAlreadyReserved + configuration.extractCreditCost > configuration.maximumCumulativeCredits) return false;
  return input.providerRemaining === null || input.providerRemaining - configuration.extractCreditCost >= configuration.minimumProviderHeadroom;
}

export async function readScrapeGraphCreditBalance(configuration: ScrapeGraphRuntimeConfiguration): Promise<ScrapeGraphCreditBalance> {
  if (!configuration.enabled || !configuration.apiKey) return { status: "UNAVAILABLE", remaining: null, httpStatus: null, providerRequestId: null, errorCategory: "not_configured" };
  const fetcher = configuration.fetcher || fetch;
  try {
    const response = await fetcher(`${apiBase}/credits`, { headers: { "SGAI-APIKEY": configuration.apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    const requestId = providerRequestId(response);
    if (!response.ok) return { status: "UNAVAILABLE", remaining: null, httpStatus: response.status, providerRequestId: requestId, errorCategory: errorCategory(response.status) };
    const data = await response.json() as unknown;
    return { status: "AVAILABLE", remaining: creditValue(data), httpStatus: response.status, providerRequestId: requestId };
  } catch {
    return { status: "UNAVAILABLE", remaining: null, httpStatus: null, providerRequestId: null, errorCategory: "network" };
  }
}

/** The model is instructed to return only literals from the supplied public URL.
 * The caller still fetches the claimed URLs independently before accepting any
 * domain, signal, person, title, or email as canonical evidence. */
export async function extractPublicOrganizationEvidence(input: { sourceUrl: string; organization: string; segment: "DIRECT" | "PARTNER"; configuration: ScrapeGraphRuntimeConfiguration }): Promise<PublicContactExtraction> {
  const { configuration } = input;
  if (!configuration.enabled || !configuration.apiKey) return unavailable("not_configured");
  const fetcher = configuration.fetcher || fetch;
  const prompt = [
    "Extract only facts explicitly published on this page. Do not infer, generate, or guess any value.",
    `The research candidate is ${input.organization} in the ${input.segment} segment.`,
    "Return the organization official website URL only if explicitly linked or stated; otherwise null.",
    "Return a concise public signal relevant to nonprofit post-award grant reporting, restricted-fund accounting, grants compliance, or nonprofit finance services only if explicitly stated.",
    "Return at most one current finance, grants, controller, CFO, executive, or relevant partner leader only if their name, title, and individual work email are visibly published. Do not construct or infer an email."
  ].join(" ");
  const schema = {
    type: "object",
    properties: {
      official_website_url: { type: ["string", "null"] },
      official_organization_name: { type: ["string", "null"] },
      evidence_summary: { type: ["string", "null"] },
      contact_name: { type: ["string", "null"] },
      contact_title: { type: ["string", "null"] },
      contact_email: { type: ["string", "null"] }
    },
    required: ["official_website_url", "official_organization_name", "evidence_summary", "contact_name", "contact_title", "contact_email"]
  };
  try {
    const response = await fetcher(`${apiBase}/extract`, {
      method: "POST",
      headers: { "SGAI-APIKEY": configuration.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url: input.sourceUrl, prompt, schema, allowedTypes: ["text/html", "application/pdf"] }),
      signal: AbortSignal.timeout(45_000)
    });
    const requestId = providerRequestId(response);
    if (!response.ok) return { ...unavailable(errorCategory(response.status)), requestId, httpStatus: response.status };
    const responseBody = await response.json() as unknown;
    const parsed = extractedObject(responseBody);
    const name = text(parsed.contact_name);
    const title = text(parsed.contact_title);
    const email = text(parsed.contact_email).toLowerCase();
    const pieces = name.split(/\s+/).filter(Boolean);
    const contact = pieces.length >= 2 && title && email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
      ? { firstName: pieces[0], lastName: pieces.at(-1) || "", fullName: name, title, email, sourceUrl: input.sourceUrl }
      : null;
    return {
      status: contact ? "FOUND" : "NO_CONTACT",
      requestId: requestId || text(object(responseBody).id) || stableRequestId(input.sourceUrl),
      officialOrganizationUrl: safeHttpsUrl(text(parsed.official_website_url)),
      officialOrganizationName: text(parsed.official_organization_name) || null,
      evidenceSummary: text(parsed.evidence_summary) || null,
      contact,
      httpStatus: response.status
    };
  } catch {
    return unavailable("network");
  }
}

function unavailable(errorCategory: ScrapeGraphErrorCategory): PublicContactExtraction {
  return { status: "UNAVAILABLE", requestId: null, officialOrganizationUrl: null, officialOrganizationName: null, evidenceSummary: null, contact: null, httpStatus: null, errorCategory };
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function extractedObject(value: unknown) {
  const body = object(value); const json = body.json || object(body.data).json || body.data;
  return object(typeof json === "string" ? safelyParse(json) : json);
}
function safelyParse(value: string): unknown { try { return JSON.parse(value); } catch { return {}; } }
function providerRequestId(response: Response) { return String(response.headers.get("x-request-id") || response.headers.get("request-id") || "").trim() || null; }
function errorCategory(status: number): ScrapeGraphErrorCategory { return status === 401 || status === 403 ? "authentication" : status === 402 ? "insufficient_credits" : status === 429 ? "rate_limited" : "provider_error"; }
function safeHttpsUrl(value: string) { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null; } catch { return null; } }
function stableRequestId(sourceUrl: string) { return `extract_${createHash("sha256").update(sourceUrl).digest("hex").slice(0, 24)}`; }
function creditValue(value: unknown): number | null {
  const body = object(value);
  const candidates = [body.remaining_credits, body.remainingCredits, body.credits, object(body.data).remaining_credits, object(body.data).remainingCredits, object(body.data).credits];
  for (const candidate of candidates) { const numeric = Number(candidate); if (Number.isFinite(numeric) && numeric >= 0) return numeric; }
  return null;
}
