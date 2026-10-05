import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, requireUser, type AuthenticatedUser } from "./auth.ts";
import { consumeMcpOauthAuthorization, consumeMcpOauthRefreshToken, readMcpOauthAccessToken, readMcpOauthClient, saveMcpOauthAccessToken, saveMcpOauthAuthorization, saveMcpOauthClient, saveMcpOauthRefreshToken, type McpOauthRefreshTokenRecord } from "./persistence.ts";

const readScope = "grantdeskhq.reports.read";
const writeScope = "grantdeskhq.reports.write";
const allowedScopes = new Set([readScope, writeScope]);
const authorizationLifetimeMs = 5 * 60_000;
const accessTokenLifetimeMs = 60 * 60_000;
const refreshTokenLifetimeMs = 30 * 24 * 60 * 60_000;
const chatGptStableConnectorRedirectUri = "https://chatgpt.com/connector_platform_oauth_redirect";

export function grantReportingMcpOrigin(environment: NodeJS.ProcessEnv = process.env) {
  const configured = String(environment.GRANTDESK_PUBLIC_ORIGIN || "https://grantdeskhq.com").trim().replace(/\/+$/, "");
  const url = new URL(configured);
  if (url.protocol !== "https:" || !["grantdeskhq.com", "www.grantdeskhq.com"].includes(url.hostname)) throw new Error("GRANTDESK_PUBLIC_ORIGIN must be the approved GrantDeskHQ HTTPS origin.");
  return url.origin;
}

export function grantReportingMcpResourceMetadata(environment: NodeJS.ProcessEnv = process.env) {
  const origin = grantReportingMcpOrigin(environment);
  return { resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: [readScope, writeScope] };
}

export function grantReportingMcpAuthorizationMetadata(environment: NodeJS.ProcessEnv = process.env) {
  const origin = grantReportingMcpOrigin(environment);
  return {
    issuer: origin,
    authorization_response_iss_parameter_supported: true,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    userinfo_endpoint: `${origin}/oauth/userinfo`,
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    response_types_supported: ["code"],
    scopes_supported: [readScope, writeScope]
  };
}

/** This OAuth server advertises issuer identification, so ChatGPT uses its
 * stable production connector callback. Restrict DCR to that callback: an
 * arbitrary HTTPS URI would let an untrusted client receive a user code. */
export function allowedGrantReportingMcpRedirectUri(value: string) {
  return value === chatGptStableConnectorRedirectUri;
}

export async function registerGrantReportingMcpClient(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return oauthJson(response, 405, { error: "invalid_request", error_description: "POST is required." });
  const body = await readJson(request, 16_000) as { redirect_uris?: unknown };
  const requestedRedirectUris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.map((value) => String(value)) : [];
  const redirectUris = requestedRedirectUris.filter(allowedGrantReportingMcpRedirectUri);
  if (!redirectUris.length || redirectUris.length !== requestedRedirectUris.length || redirectUris.length !== new Set(redirectUris).size) return oauthJson(response, 400, { error: "invalid_redirect_uri", error_description: "The ChatGPT stable connector redirect URI is required." });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const clientId = `gdhq_mcp_${randomUUID().replaceAll("-", "")}`;
    const created = await saveMcpOauthClient({ clientId, redirectUris, createdAt: new Date().toISOString() });
    if (created) return oauthJson(response, 201, { client_id: clientId, token_endpoint_auth_method: "none" });
  }
  return oauthJson(response, 503, { error: "temporarily_unavailable", error_description: "A client registration ID could not be reserved." });
}

/**
 * The browser-facing authorization route is a normal GrantDeskHQ SPA route.
 * It signs the user in with the existing Firebase UI, then posts its Firebase
 * bearer to this endpoint.  The broker creates an OAuth code; no Firebase ID
 * token is ever exposed to ChatGPT as an MCP access token.
 */
export async function approveGrantReportingMcpAuthorization(request: IncomingMessage, response: ServerResponse, query: URLSearchParams) {
  if (request.method !== "POST") return oauthJson(response, 405, { error: "invalid_request", error_description: "POST is required." });
  const user = await requireUser(request);
  const validation = await validateAuthorizationRequest(query);
  if ("error" in validation) return oauthJson(response, 400, validation);
  const code = `gdhq_ac_${randomBytes(32).toString("base64url")}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + authorizationLifetimeMs).toISOString();
  await saveMcpOauthAuthorization({ codeHash: tokenHash(code), clientId: validation.clientId, redirectUri: validation.redirectUri, codeChallenge: validation.codeChallenge, resource: validation.resource, scopes: validation.scopes, user, createdAt, expiresAt });
  const redirect = new URL(validation.redirectUri);
  redirect.searchParams.set("code", code);
  if (validation.state) redirect.searchParams.set("state", validation.state);
  redirect.searchParams.set("iss", grantReportingMcpOrigin());
  return oauthJson(response, 200, { redirect_uri: redirect.toString(), expires_at: expiresAt });
}

export async function exchangeGrantReportingMcpToken(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") return oauthJson(response, 405, { error: "invalid_request", error_description: "POST is required." });
  const form = await readForm(request, 16_000);
  if (form.get("grant_type") === "refresh_token") return exchangeGrantReportingMcpRefreshToken(form, response);
  if (form.get("grant_type") !== "authorization_code") return oauthJson(response, 400, { error: "unsupported_grant_type", error_description: "Only authorization_code and refresh_token are supported." });
  const code = String(form.get("code") || "");
  const clientId = String(form.get("client_id") || "");
  const redirectUri = String(form.get("redirect_uri") || "");
  const verifier = String(form.get("code_verifier") || "");
  const resource = String(form.get("resource") || "");
  if (!code || !clientId || !redirectUri || !verifier || !resource) return oauthJson(response, 400, { error: "invalid_request", error_description: "code, client_id, redirect_uri, code_verifier, and resource are required." });
  const authorization = await consumeMcpOauthAuthorization(tokenHash(code));
  if (!authorization || authorization.clientId !== clientId || authorization.redirectUri !== redirectUri || authorization.resource !== resource || pkceChallenge(verifier) !== authorization.codeChallenge) return oauthJson(response, 400, { error: "invalid_grant", error_description: "The authorization code is invalid, expired, already used, or does not match this PKCE request." });
  return oauthJson(response, 200, await issueGrantReportingMcpTokenPair({ clientId, resource, scopes: authorization.scopes, user: authorization.user }));
}

async function exchangeGrantReportingMcpRefreshToken(form: URLSearchParams, response: ServerResponse) {
  const refreshToken = String(form.get("refresh_token") || "");
  const clientId = String(form.get("client_id") || "");
  const resource = String(form.get("resource") || "");
  if (!refreshToken || !clientId || !resource) return oauthJson(response, 400, { error: "invalid_request", error_description: "refresh_token, client_id, and resource are required." });
  const prior = await consumeMcpOauthRefreshToken(tokenHash(refreshToken));
  if (!prior || prior.clientId !== clientId || prior.resource !== resource) return oauthJson(response, 400, { error: "invalid_grant", error_description: "The refresh token is invalid, expired, already used, or does not match this OAuth client and resource." });
  return oauthJson(response, 200, await issueGrantReportingMcpTokenPair({ clientId, resource, scopes: prior.scopes, user: prior.user }));
}

async function issueGrantReportingMcpTokenPair(input: Omit<McpOauthRefreshTokenRecord, "tokenHash" | "createdAt" | "expiresAt">) {
  const createdAt = new Date().toISOString();
  const accessToken = `gdhq_at_${randomBytes(32).toString("base64url")}`;
  const refreshToken = `gdhq_rt_${randomBytes(32).toString("base64url")}`;
  const accessExpiresAt = new Date(Date.now() + accessTokenLifetimeMs).toISOString();
  const refreshExpiresAt = new Date(Date.now() + refreshTokenLifetimeMs).toISOString();
  await Promise.all([
    saveMcpOauthAccessToken({ tokenHash: tokenHash(accessToken), ...input, createdAt, expiresAt: accessExpiresAt }),
    saveMcpOauthRefreshToken({ tokenHash: tokenHash(refreshToken), ...input, createdAt, expiresAt: refreshExpiresAt })
  ]);
  return { access_token: accessToken, token_type: "Bearer", expires_in: Math.floor(accessTokenLifetimeMs / 1000), refresh_token: refreshToken, refresh_expires_in: Math.floor(refreshTokenLifetimeMs / 1000), scope: input.scopes.join(" ") };
}

export async function grantReportingMcpUserInfo(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return oauthJson(response, 405, { error: "invalid_request", error_description: "GET is required." });
  const token = await authenticatedOauthToken(request);
  if (!token) return oauthJson(response, 401, { error: "invalid_token", error_description: "A valid GrantDeskHQ OAuth access token is required." }, true);
  return oauthJson(response, 200, { sub: token.user.uid, email: token.user.email, email_verified: token.user.emailVerified, name: token.user.name || undefined });
}

export async function requireGrantReportingMcpUser(request: IncomingMessage): Promise<{ user: AuthenticatedUser; scopes: string[] }> {
  const token = await authenticatedOauthToken(request);
  if (!token) throw new McpOauthAuthenticationError();
  return { user: token.user, scopes: token.scopes };
}

export class McpOauthAuthenticationError extends Error {
  constructor() { super("GrantDeskHQ OAuth authentication is required."); }
}

export function oauthChallenge() {
  return `Bearer resource_metadata="${grantReportingMcpOrigin()}/.well-known/oauth-protected-resource", error="invalid_token", error_description="GrantDeskHQ OAuth authentication is required"`;
}

export function hasMcpScope(scopes: readonly string[], scope: string) { return scopes.includes(scope); }
export const grantReportingMcpScopes = { read: readScope, write: writeScope };

async function validateAuthorizationRequest(query: URLSearchParams): Promise<{ clientId: string; redirectUri: string; codeChallenge: string; resource: string; scopes: string[]; state: string } | { error: string; error_description: string }> {
  if (query.get("response_type") !== "code") return { error: "unsupported_response_type", error_description: "Only response_type=code is supported." };
  const clientId = String(query.get("client_id") || "");
  const redirectUri = String(query.get("redirect_uri") || "");
  const codeChallenge = String(query.get("code_challenge") || "");
  const resource = String(query.get("resource") || "");
  const state = String(query.get("state") || "");
  if (!clientId || !allowedGrantReportingMcpRedirectUri(redirectUri) || !codeChallenge || query.get("code_challenge_method") !== "S256" || resource !== `${grantReportingMcpOrigin()}/mcp` || state.length > 2048) return { error: "invalid_request", error_description: "The OAuth client, ChatGPT redirect URI, PKCE S256 challenge, resource, or state is invalid." };
  const client = await readMcpOauthClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) return { error: "invalid_client", error_description: "The OAuth client or redirect URI is not registered." };
  const scopes = String(query.get("scope") || readScope).split(/\s+/).filter(Boolean);
  if (!scopes.length || scopes.some((scope) => !allowedScopes.has(scope))) return { error: "invalid_scope", error_description: "The requested GrantDeskHQ scope is not supported." };
  return { clientId, redirectUri, codeChallenge, resource, scopes: [...new Set(scopes)], state };
}

async function authenticatedOauthToken(request: IncomingMessage) {
  const bearer = String(request.headers.authorization || "").match(/^Bearer\s+(gdhq_at_[A-Za-z0-9_-]{32,})$/i)?.[1];
  return bearer ? readMcpOauthAccessToken(tokenHash(bearer)) : null;
}

function tokenHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function pkceChallenge(verifier: string) { return createHash("sha256").update(verifier).digest("base64url"); }

async function readJson(request: IncomingMessage, maximum: number): Promise<unknown> {
  const raw = await readBody(request, maximum);
  try { return JSON.parse(raw); } catch { throw new HttpError(400, "OAuth JSON body is invalid."); }
}
async function readForm(request: IncomingMessage, maximum: number) { return new URLSearchParams(await readBody(request, maximum)); }
async function readBody(request: IncomingMessage, maximum: number) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length; if (size > maximum) throw new HttpError(413, "OAuth request body exceeds the limit."); chunks.push(bytes); }
  return Buffer.concat(chunks).toString("utf8");
}
function oauthJson(response: ServerResponse, status: number, payload: Record<string, unknown>, challenge = false) {
  if (challenge) response.setHeader("WWW-Authenticate", oauthChallenge());
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(payload));
}
