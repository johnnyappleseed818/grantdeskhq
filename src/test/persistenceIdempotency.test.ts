// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { compilationReportId, saveCompilation } from "../../server/persistence";
import { prototypeFixture } from "../data/prototypeFixture";

describe("report compilation idempotency", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses the same tenant-scoped report ID when a request is retried", () => {
    const requestId = "3dd8a462-480c-4ed7-a4a3-6fcb92d1427a";
    const first = compilationReportId("user-a", requestId);
    expect(compilationReportId("user-a", requestId)).toBe(first);
    expect(compilationReportId("user-b", requestId)).not.toBe(first);
    expect(first).toMatch(/^report_[a-f0-9]{32}$/);
  });

  it("retries a transient 429 workspace save without changing the deterministic report id", async () => {
    vi.stubEnv("PERSISTENCE_RETRY_BASE_MS", "1");
    let firestoreWrites = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const value = String(url);
      if (value.includes("metadata.google.internal")) return Response.json({ access_token: "token", expires_in: 3600 });
      if (value.includes("storage.googleapis.com/upload")) return new Response(null, { status: 200 });
      if (value.includes("firestore.googleapis.com") && !init?.method) return new Response(null, { status: 404 });
      if (value.includes("firestore.googleapis.com") && init?.method === "PATCH") {
        firestoreWrites += 1;
        if (firestoreWrites === 1) return new Response("rate limited", { status: 429 });
        return Response.json({});
      }
      throw new Error(`Unexpected request: ${value}`);
    }));
    const requestId = "3dd8a462-480c-4ed7-a4a3-6fcb92d1427a";
    const saved = await saveCompilation(
      { uid: "user-a", email: "test@example.com", emailVerified: true, name: "Test" },
      {
        organizationName: "BridgeWorks Family Services",
        grantName: "Northstar Community Fund",
        reportingPeriod: "February 1 – July 31, 2027",
        requestId,
        files: [{ role: "awardAgreement", name: "Award.txt", mimeType: "text/plain", size: 1, data: "data:text/plain;base64,eA==" }]
      },
      prototypeFixture
    );

    // First organization write is retried after 429. The durable funnel event
    // records add writes, but must not change the deterministic report id.
    expect(firestoreWrites).toBeGreaterThanOrEqual(4);
    expect(saved.reportId).toBe(compilationReportId("user-a", requestId));
    expect(saved.manifest.canonicalBusinessStateHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
