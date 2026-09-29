// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { listInstantlyHandoffReservations, readInstantlyRecords } from "../../server/persistence.ts";

const firestoreRecord = (id: string) => ({ fields: { recordJson: { stringValue: JSON.stringify({ id, email: `${id}@example.test`, instantlySyncStatus: "IN_CAMPAIGN" }) } } });
const handoff = (id: string) => ({ fields: { id: { stringValue: id }, idempotencyKey: { stringValue: id }, normalizedEmail: { stringValue: `${id}@example.test` }, campaignId: { stringValue: "campaign" }, handoffStatus: { stringValue: "HANDOFF_STARTED" }, leaseExpiry: { stringValue: "2099-01-01T00:00:00.000Z" }, createdAt: { stringValue: "2026-09-29T00:00:00.000Z" }, updatedAt: { stringValue: "2026-09-29T00:00:00.000Z" } } });

describe("Instantly persistence pagination", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads persisted memberships and handoff reservations beyond Firestore's first page", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes("metadata.google.internal")) return Response.json({ access_token: "test-token", expires_in: 3600 });
      if (value.includes("gtm/instantly/records") && value.includes("pageToken=record-page-2")) return Response.json({ documents: [firestoreRecord("record-2")] });
      if (value.includes("gtm/instantly/records")) return Response.json({ documents: [firestoreRecord("record-1")], nextPageToken: "record-page-2" });
      if (value.includes("gtm/instantly/handoffs") && value.includes("pageToken=handoff-page-2")) return Response.json({ documents: [handoff("handoff-2")] });
      if (value.includes("gtm/instantly/handoffs")) return Response.json({ documents: [handoff("handoff-1")], nextPageToken: "handoff-page-2" });
      throw new Error(`Unexpected request: ${value}`);
    });
    vi.stubGlobal("fetch", fetch);

    await expect(readInstantlyRecords(250)).resolves.toMatchObject([{ id: "record-1" }, { id: "record-2" }]);
    await expect(listInstantlyHandoffReservations(250)).resolves.toMatchObject([{ idempotencyKey: "handoff-1" }, { idempotencyKey: "handoff-2" }]);
    const firestoreCalls = fetch.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("firestore.googleapis.com"));
    expect(firestoreCalls.filter((url) => url.includes("gtm/instantly/records"))).toHaveLength(2);
    expect(firestoreCalls.filter((url) => url.includes("gtm/instantly/handoffs"))).toHaveLength(2);
  });
});
