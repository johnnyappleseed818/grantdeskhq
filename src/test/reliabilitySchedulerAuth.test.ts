// @vitest-environment node
import type { IncomingMessage } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../server/auth";
import { requireHealthScheduler } from "../../server/schedulerAuth";

describe("reliability scheduler authentication", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("accepts only the configured, verified, unexpired OIDC identity and audience", async () => {
    vi.stubEnv("HEALTH_SCHEDULER_SERVICE_ACCOUNT", "grantdeskhq-health-scheduler@example.iam.gserviceaccount.com");
    vi.stubEnv("HEALTH_SCHEDULER_AUDIENCE", "https://candidate.example");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ aud: "https://candidate.example", email: "grantdeskhq-health-scheduler@example.iam.gserviceaccount.com", email_verified: "true", exp: String(Math.floor(Date.now() / 1000) + 300), iss: "https://accounts.google.com" })));
    const request = { headers: { authorization: "Bearer verified-token" } } as IncomingMessage;
    await expect(requireHealthScheduler(request)).resolves.toMatchObject({ job: "reliability" });
  });

  it("rejects a wrong audience", async () => {
    vi.stubEnv("HEALTH_SCHEDULER_SERVICE_ACCOUNT", "grantdeskhq-health-scheduler@example.iam.gserviceaccount.com");
    vi.stubEnv("HEALTH_SCHEDULER_AUDIENCE", "https://candidate.example");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ aud: "https://wrong.example", email: "grantdeskhq-health-scheduler@example.iam.gserviceaccount.com", email_verified: "true", exp: String(Math.floor(Date.now() / 1000) + 300), iss: "https://accounts.google.com" })));
    await expect(requireHealthScheduler({ headers: { authorization: "Bearer wrong-token" } } as IncomingMessage)).rejects.toMatchObject({ statusCode: 401 } satisfies Partial<HttpError>);
  });
});
