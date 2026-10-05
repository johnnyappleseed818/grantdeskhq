import { afterEach, describe, expect, it, vi } from "vitest";
import { listReports, projectSavedReportSummary } from "../../server/persistence.ts";
import type { AuthenticatedUser } from "../../server/auth.ts";

const ownerA: AuthenticatedUser = { uid: "tenant-owner-a", email: "owner-a@example.test", emailVerified: true, name: "Owner A" };
const ownerB: AuthenticatedUser = { uid: "tenant-owner-b", email: "owner-b@example.test", emailVerified: true, name: "Owner B" };
const summary = { id: "report_0123456789abcdef0123456789abcdef", organizationName: "Example Nonprofit", grantName: "Community Grant", reportingPeriod: "Q3 2026", status: "review_required", createdAt: "2026-10-05T00:00:00.000Z", updatedAt: "2026-10-05T01:00:00.000Z", sourceCount: 3, evidenceCoveragePercent: 87.5, unresolvedItems: 2 };

function fields(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === "number" ? (Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }) : { stringValue: String(value) }]));
}

afterEach(() => vi.unstubAllGlobals());

describe("saved report list projection", () => {
  it("returns exactly the summary contract and omits persisted document payloads", () => {
    const listed = projectSavedReportSummary({ ...summary, ownerUid: ownerA.uid, sourcesJson: "source-contents".repeat(50_000), coreSourcesJson: "core-source-contents", resultJson: "result-contents".repeat(50_000), coreResultJson: "core-result-contents", auditJson: "audit-contents".repeat(50_000), manifestJson: "manifest-contents".repeat(50_000) });
    expect(listed).toEqual(summary);
    expect(Object.keys(listed).sort()).toEqual(["createdAt", "evidenceCoveragePercent", "grantName", "id", "organizationName", "reportingPeriod", "sourceCount", "status", "unresolvedItems", "updatedAt"]);
    expect(JSON.stringify({ reports: Array.from({ length: 6 }, () => listed) }).length).toBeLessThan(2_500);
  });

  it("queries only the authenticated tenant collection and projects every persisted document", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.includes("metadata.google.internal")) return Response.json({ access_token: "test-token", expires_in: 3600 });
      if (target.includes("/organizations/org_tenant-owner-a/reports")) return Response.json({ documents: [{ fields: fields({ ...summary, ownerUid: ownerA.uid, sourcesJson: "private", coreSourcesJson: "private", resultJson: "private", coreResultJson: "private", auditJson: "private" }) }] });
      if (target.includes("/organizations/org_tenant-owner-b/reports")) return Response.json({ documents: [] });
      throw new Error(`Unexpected request: ${target}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listReports(ownerA)).resolves.toEqual([summary]);
    await expect(listReports(ownerB)).resolves.toEqual([]);
    const firestoreCalls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("firestore.googleapis.com"));
    expect(firestoreCalls).toEqual(expect.arrayContaining([expect.stringContaining("/organizations/org_tenant-owner-a/reports"), expect.stringContaining("/organizations/org_tenant-owner-b/reports")]));
    expect(firestoreCalls.every((url) => !url.includes("collectionGroup"))).toBe(true);
  });
});
