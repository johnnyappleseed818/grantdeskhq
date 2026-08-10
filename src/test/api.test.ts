import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../lib/api";

describe("API response handling", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns parsed JSON for a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })));
    await expect(apiRequest<{ status: string }>("/api/health", "token")).resolves.toEqual({ status: "ok" });
  });

  it("turns a plain-text gateway timeout into a clear retry message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream request timeout", { status: 504 })));
    await expect(apiRequest("/api/reports/compile", "token")).rejects.toThrow(
      "Report generation was temporarily interrupted. Your source files were not changed."
    );
  });

  it("preserves a structured API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "A source package is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    })));
    await expect(apiRequest("/api/reports/compile", "token")).rejects.toThrow("A source package is required.");
  });
});
