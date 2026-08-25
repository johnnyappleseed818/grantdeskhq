// @vitest-environment node
import type { IncomingMessage } from "node:http";
import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../server/auth";
import { requireHealthScheduler } from "../../server/schedulerAuth";

describe("reliability scheduler authentication", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  function signedGoogleIdentityToken(claims: Record<string, unknown>) {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-google-key" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
    return { token: `${header}.${payload}.${signature}`, jwk: publicKey.export({ format: "jwk" }) };
  }

  it("accepts only the configured, verified, unexpired OIDC identity and audience", async () => {
    vi.stubEnv("HEALTH_SCHEDULER_SERVICE_ACCOUNT", "grantdeskhq-health-scheduler@example.iam.gserviceaccount.com");
    vi.stubEnv("HEALTH_SCHEDULER_AUDIENCE", "https://candidate.example");
    const identity = signedGoogleIdentityToken({ aud: "https://candidate.example", email: "grantdeskhq-health-scheduler@example.iam.gserviceaccount.com", email_verified: "true", exp: String(Math.floor(Date.now() / 1000) + 300), iss: "https://accounts.google.com" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ keys: [{ ...identity.jwk, kid: "test-google-key", use: "sig", alg: "RS256" }] })));
    const request = { headers: { authorization: "Bearer " + identity.token } } as IncomingMessage;
    await expect(requireHealthScheduler(request)).resolves.toMatchObject({ job: "reliability" });
  });

  it("rejects a wrong audience", async () => {
    vi.stubEnv("HEALTH_SCHEDULER_SERVICE_ACCOUNT", "grantdeskhq-health-scheduler@example.iam.gserviceaccount.com");
    vi.stubEnv("HEALTH_SCHEDULER_AUDIENCE", "https://candidate.example");
    const identity = signedGoogleIdentityToken({ aud: "https://wrong.example", email: "grantdeskhq-health-scheduler@example.iam.gserviceaccount.com", email_verified: "true", exp: String(Math.floor(Date.now() / 1000) + 300), iss: "https://accounts.google.com" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ keys: [{ ...identity.jwk, kid: "test-google-key", use: "sig", alg: "RS256" }] })));
    await expect(requireHealthScheduler({ headers: { authorization: "Bearer " + identity.token } } as IncomingMessage)).rejects.toMatchObject({ statusCode: 401 } satisfies Partial<HttpError>);
  });
});
