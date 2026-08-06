import type { IncomingMessage } from "node:http";
import { HttpError } from "./auth.ts";

interface TokenInfo {
  aud?: string;
  email?: string;
  email_verified?: string;
  exp?: string;
  iss?: string;
}

export async function requireGtmScheduler(request: IncomingMessage) {
  const expectedEmail = process.env.GTM_SCHEDULER_SERVICE_ACCOUNT?.trim();
  const expectedAudience = process.env.GTM_SCHEDULER_AUDIENCE?.trim();
  if (!expectedEmail || !expectedAudience) throw new HttpError(503, "The GTM scheduler identity is not configured.");
  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "A verified scheduler identity is required.");
  const token = authorization.slice(7);
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  if (!response.ok) throw new HttpError(401, "The scheduler identity could not be verified.");
  const payload = await response.json() as TokenInfo;
  const now = Math.floor(Date.now() / 1000);
  if (
    payload.aud !== expectedAudience
    || payload.email !== expectedEmail
    || payload.email_verified !== "true"
    || Number(payload.exp || 0) <= now
    || !["https://accounts.google.com", "accounts.google.com"].includes(String(payload.iss || ""))
  ) throw new HttpError(401, "The scheduler identity is not authorized for this GrantDeskHQ job.");
  return { email: payload.email };
}
