import { createVerify } from "node:crypto";
import type { IncomingMessage } from "node:http";

const projectId = process.env.GOOGLE_CLOUD_PROJECT || "grantdeskhq-proto-ek-2026";
const certUrl = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certificateCache: { expiresAt: number; certificates: Record<string, string> } | null = null;

export interface AuthenticatedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export async function requireUser(request: IncomingMessage): Promise<AuthenticatedUser> {
  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "Sign in to continue.");
  const token = authorization.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) throw new HttpError(401, "The account session is invalid.");
  const header = decodeJson(parts[0]) as { alg?: string; kid?: string };
  const payload = decodeJson(parts[1]) as Record<string, unknown>;
  if (header.alg !== "RS256" || !header.kid) throw new HttpError(401, "The account session is invalid.");
  const certificates = await getCertificates();
  const certificate = certificates[header.kid];
  if (!certificate) throw new HttpError(401, "The account session could not be verified.");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (!verifier.verify(certificate, Buffer.from(parts[2], "base64url"))) throw new HttpError(401, "The account session could not be verified.");

  const now = Math.floor(Date.now() / 1000);
  const subject = String(payload.sub || "");
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}` || !subject || subject.length > 128) throw new HttpError(401, "The account session belongs to a different project.");
  if (Number(payload.exp || 0) <= now || Number(payload.iat || now + 1) > now) throw new HttpError(401, "The account session expired. Sign in again.");
  return {
    uid: subject,
    email: String(payload.email || ""),
    emailVerified: Boolean(payload.email_verified),
    name: String(payload.name || "")
  };
}

async function getCertificates() {
  if (certificateCache && certificateCache.expiresAt > Date.now()) return certificateCache.certificates;
  const response = await fetch(certUrl);
  if (!response.ok) throw new HttpError(503, "Account verification is temporarily unavailable.");
  const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] || 300);
  const certificates = await response.json() as Record<string, string>;
  certificateCache = { certificates, expiresAt: Date.now() + maxAge * 1000 };
  return certificates;
}

function decodeJson(value: string) {
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
  catch { throw new HttpError(401, "The account session is invalid."); }
}

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
