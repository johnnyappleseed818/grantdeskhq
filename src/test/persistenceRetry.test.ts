import { describe, expect, it } from "vitest";
import { firestoreWriteErrorCategory, persistenceRetryDelay } from "../../server/persistence";

describe("persistenceRetryDelay", () => {
  it("backs off when Firestore returns Retry-After: 0", () => {
    expect(persistenceRetryDelay("0", 1, 500, 0)).toBe(500);
    expect(persistenceRetryDelay("0", 2, 500, 0)).toBe(1_000);
  });

  it("honors a positive bounded provider delay", () => {
    expect(persistenceRetryDelay("2", 1, 500, 0)).toBe(2_000);
    expect(persistenceRetryDelay("30", 1, 500, 0)).toBe(10_000);
  });

  it("retains only the safe Firestore status category in write diagnostics", () => {
    expect(firestoreWriteErrorCategory({ error: { status: "INVALID_ARGUMENT", message: "sensitive provider detail" } })).toBe("INVALID_ARGUMENT");
    expect(firestoreWriteErrorCategory({ error: { status: "not safe" } })).toBe("UNCLASSIFIED");
  });
});
