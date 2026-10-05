import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authorization: null as Record<string, unknown> | null,
  refresh: null as Record<string, unknown> | null,
  refreshConsumed: false,
  redirectUris: [] as string[],
  savedAccess: [] as Record<string, unknown>[]
}));

vi.mock("../../server/persistence.ts", () => ({
  consumeMcpOauthAuthorization: vi.fn(async () => state.authorization),
  consumeMcpOauthRefreshToken: vi.fn(async () => state.refreshConsumed ? null : (state.refreshConsumed = true, state.refresh)),
  readMcpOauthAccessToken: vi.fn(async () => null),
  readMcpOauthClient: vi.fn(async () => null),
  saveMcpOauthAccessToken: vi.fn(async (record: Record<string, unknown>) => { state.savedAccess.push(record); }),
  saveMcpOauthAuthorization: vi.fn(async () => undefined),
  saveMcpOauthClient: vi.fn(async (record: { redirectUris: string[] }) => { state.redirectUris = record.redirectUris; return true; }),
  saveMcpOauthRefreshToken: vi.fn(async (record: Record<string, unknown>) => { state.refresh = record; })
}));

import { exchangeGrantReportingMcpToken, registerGrantReportingMcpClient } from "../../server/chatgptGrantReportingOAuth.ts";

const resource = "https://grantdeskhq.com/mcp";
const clientId = "gdhq_mcp_test";
const verifier = "mcp-test-verifier";
const pkce = createHash("sha256").update(verifier).digest("base64url");
const user = { uid: "synthetic-tenant-user", email: "synthetic@example.invalid", emailVerified: true, name: "Synthetic User" };

type OAuthHandler = (request: IncomingMessage, response: ServerResponse) => Promise<unknown>;

async function post(handler: OAuthHandler, body: URLSearchParams | Record<string, unknown>, contentType = "application/x-www-form-urlencoded") {
  const server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("OAuth fixture did not bind a test port.");
  try {
    const payload = body instanceof URLSearchParams ? body.toString() : JSON.stringify(body);
    return await fetch(`http://127.0.0.1:${address.port}`, { method: "POST", headers: { "content-type": contentType }, body: payload });
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

describe("GrantDeskHQ MCP OAuth token lifecycle", () => {
  beforeEach(() => {
    state.authorization = { codeHash: "ignored", clientId, redirectUri: "https://chatgpt.com/connector_platform_oauth_redirect", codeChallenge: pkce, resource, scopes: ["grantdeskhq.reports.read", "grantdeskhq.reports.write"], user, createdAt: "2026-10-05T00:00:00.000Z", expiresAt: "2030-10-05T00:00:00.000Z" };
    state.refresh = null; state.refreshConsumed = false; state.redirectUris = []; state.savedAccess = [];
  });

  it("issues an opaque resource-bound token pair, rotates a refresh token once, and rejects its replay", async () => {
    const initial = await post(exchangeGrantReportingMcpToken, new URLSearchParams({ grant_type: "authorization_code", code: "unused-code", client_id: clientId, redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect", code_verifier: verifier, resource }));
    expect(initial.status).toBe(200);
    const first = await initial.json() as { access_token: string; refresh_token: string; expires_in: number; refresh_expires_in: number };
    expect(first.access_token).toMatch(/^gdhq_at_/);
    expect(first.refresh_token).toMatch(/^gdhq_rt_/);
    expect(first.expires_in).toBe(3600);
    expect(first.refresh_expires_in).toBe(2_592_000);
    expect(state.savedAccess).toHaveLength(1);

    const refreshed = await post(exchangeGrantReportingMcpToken, new URLSearchParams({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: clientId, resource }));
    expect(refreshed.status).toBe(200);
    const second = await refreshed.json() as { access_token: string; refresh_token: string };
    expect(second.access_token).not.toBe(first.access_token);
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect((await post(exchangeGrantReportingMcpToken, new URLSearchParams({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: clientId, resource }))).status).toBe(400);
  });

  it("registers only ChatGPT's stable connector redirect URI", async () => {
    const valid = await post(registerGrantReportingMcpClient, { redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"] }, "application/json");
    expect(valid.status).toBe(201);
    expect(state.redirectUris).toEqual(["https://chatgpt.com/connector_platform_oauth_redirect"]);
    const rejected = await post(registerGrantReportingMcpClient, { redirect_uris: ["https://example.invalid/callback"] }, "application/json");
    expect(rejected.status).toBe(400);
  });
});
