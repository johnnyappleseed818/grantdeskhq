import type { IncomingMessage } from "node:http";
import { createPublicKey, verify } from "node:crypto";
import { HttpError } from "./auth.ts";

interface TokenInfo {
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  exp?: string;
  iss?: string;
}

interface GoogleJwk { kid?: string; kty?: string; n?: string; e?: string; alg?: string; use?: string; }

let googleKeys: GoogleJwk[] = [];
let googleKeysExpireAt = 0;

function decodeJson(part: string) {
  try { return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>; }
  catch { return null; }
}

async function trustedGoogleKeys() {
  if (googleKeys.length && Date.now() < googleKeysExpireAt) return googleKeys;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) throw new Error("Google signing keys are unavailable.");
  const body = await response.json() as { keys?: GoogleJwk[] };
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 300);
  googleKeys = Array.isArray(body.keys) ? body.keys : [];
  googleKeysExpireAt = Date.now() + Math.min(Math.max(maxAge, 60), 3_600) * 1_000;
  if (!googleKeys.length) throw new Error("Google signing keys are unavailable.");
  return googleKeys;
}

/** Verify the signature locally against Google's published OIDC signing keys.
 * tokeninfo rejects service-account ID tokens minted for Cloud Run audiences. */
async function verifyGoogleIdentityToken(token: string): Promise<TokenInfo | null> {
  const [encodedHeader, encodedPayload, encodedSignature, ...extra] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra.length) return null;
  const header = decodeJson(encodedHeader);
  const payload = decodeJson(encodedPayload);
  if (!header || !payload || header.alg !== "RS256" || typeof header.kid !== "string") return null;
  const key = (await trustedGoogleKeys()).find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA" && candidate.n && candidate.e);
  if (!key) return null;
  try {
    const publicKey = createPublicKey({ key: { kty: "RSA", n: key.n!, e: key.e! }, format: "jwk" });
    const valid = verify("RSA-SHA256", Buffer.from(`${encodedHeader}.${encodedPayload}`), publicKey, Buffer.from(encodedSignature, "base64url"));
    return valid ? payload as TokenInfo : null;
  } catch { return null; }
}

export function isVerifiedGoogleEmail(value: TokenInfo["email_verified"]) {
  return value === true || value === "true";
}

export async function requireGtmScheduler(request: IncomingMessage) {
  return requireScheduler(request, process.env.GTM_SCHEDULER_SERVICE_ACCOUNT, process.env.GTM_SCHEDULER_AUDIENCE, "GTM");
}

/** Incident-only dual identity. It is not used by normal Scheduler paths and
 * is disabled unless the temporary operator service account is configured. */
export async function requireGtmIncidentOperator(request: IncomingMessage) {
  try { return await requireGtmScheduler(request); }
  catch (error) {
    if (!process.env.GTM_INCIDENT_OPERATOR_SERVICE_ACCOUNT?.trim()) throw error;
    return requireScheduler(request, process.env.GTM_INCIDENT_OPERATOR_SERVICE_ACCOUNT, process.env.GTM_SCHEDULER_AUDIENCE, "incident remediation");
  }
}

export async function requireHealthScheduler(request: IncomingMessage) {
  return requireScheduler(request, process.env.HEALTH_SCHEDULER_SERVICE_ACCOUNT, process.env.HEALTH_SCHEDULER_AUDIENCE, "reliability");
}

async function requireScheduler(request: IncomingMessage, configuredEmail: string | undefined, configuredAudience: string | undefined, label: string) {
  const expectedEmail = configuredEmail?.trim();
  const expectedAudience = configuredAudience?.trim();
  if (!expectedEmail || !expectedAudience) throw new HttpError(503, `The ${label} scheduler identity is not configured.`);
  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "A verified scheduler identity is required.");
  const token = authorization.slice(7);
  const payload = await verifyGoogleIdentityToken(token);
  if (!payload) throw new HttpError(401, "The scheduler identity could not be verified.");
  const now = Math.floor(Date.now() / 1000);
  if (
    payload.aud !== expectedAudience
    || payload.email !== expectedEmail
    || !isVerifiedGoogleEmail(payload.email_verified)
    || Number(payload.exp || 0) <= now
    || !["https://accounts.google.com", "accounts.google.com"].includes(String(payload.iss || ""))
  ) throw new HttpError(401, "The scheduler identity is not authorized for this GrantDeskHQ job.");
  return { email: payload.email, job: label };
}
