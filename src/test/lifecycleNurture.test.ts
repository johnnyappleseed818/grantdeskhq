import { describe, expect, it } from "vitest";
import { dueForNurture, lifecycleNurtureTask } from "../../server/lifecycleNurture";

const createdAt = "2026-08-24T08:00:00.000Z";
const candidate = (event: string, promotionalNurtureAllowed = true) => ({ uid: "synthetic-user", email: "synthetic@example.test", event, occurredAt: createdAt, promotionalNurtureAllowed });

describe("lifecycle nurture policy", () => {
  it("creates a distinct activation reminder after account creation", () => {
    const task = lifecycleNurtureTask(candidate("account_created"));
    expect(task).toMatchObject({ kind: "activation_reminder", classification: "promotional" });
    expect(task?.body).toContain("Try your first award free");
    expect(dueForNurture(task!, new Date("2026-08-25T08:01:00.000Z"))).toBe(true);
  });

  it("uses a report-specific upgrade reminder only after actual report generation", () => {
    const task = lifecycleNurtureTask(candidate("report_generated"));
    expect(task).toMatchObject({ kind: "report_upgrade" });
    expect(task?.body).toContain("Free First Award");
  });

  it("suppresses promotional nurture after an opt out while preserving payment notices", () => {
    expect(lifecycleNurtureTask(candidate("report_generated", false))).toBeNull();
    expect(lifecycleNurtureTask(candidate("payment_failed", false))).toMatchObject({ kind: "payment_failed", classification: "service" });
  });

  it("does not create a nudge for paid state", () => {
    expect(lifecycleNurtureTask(candidate("subscription_started"))).toBeNull();
  });
});
