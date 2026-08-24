import { describe, expect, it } from "vitest";
import { buildInitialContentEngineState, editContentDraft, reconcileContentEngine, reconcileContentInventory, updateContentEngineState } from "../lib/gtmContentEngine";

describe("canonical content opportunity engine", () => {
  it("creates a bounded, review-only backlog even with no Search Console query rows", () => {
    const state = buildInitialContentEngineState("2026-08-24T00:00:00.000Z");
    expect(state.enabled).toBe(true);
    expect(state.autoPublishEnabled).toBe(false);
    expect(state.opportunities.length).toBeGreaterThanOrEqual(28);
    expect(state.drafts.filter((draft) => draft.status === "READY_FOR_REVIEW")).toHaveLength(2);
    expect(state.opportunities.some((item) => item.recommendedAction === "EXPAND_EXISTING")).toBe(true);
  });

  it("preserves founder review states across a scheduled reconciliation", () => {
    const state = updateContentEngineState(buildInitialContentEngineState(), { kind: "opportunity", id: "content-reporting-calendar", status: "SKIPPED" });
    const reconciled = reconcileContentEngine(state, "2026-08-24T12:00:00.000Z");
    expect(reconciled.opportunities.find((item) => item.id === "content-reporting-calendar")?.status).toBe("SKIPPED");
  });

  it("requires founder review and blocks direct publication", () => {
    const state = buildInitialContentEngineState();
    const approved = updateContentEngineState(state, { kind: "draft", id: "draft-supporting-evidence", status: "APPROVED" });
    expect(approved.drafts[0].status).toBe("APPROVED");
    expect(() => updateContentEngineState(state, { kind: "draft", id: "draft-supporting-evidence", status: "PUBLISHED" })).toThrow(/publication is disabled/i);
  });

  it("keeps distribution manual and only persists a founder-reviewed state", () => {
    const state = buildInitialContentEngineState();
    const posted = updateContentEngineState(state, { kind: "distribution", id: "distribution-linkedin-evidence", status: "POSTED" });
    expect(posted.distributionTasks.find((task) => task.id === "distribution-linkedin-evidence")?.status).toBe("POSTED");
    expect(posted.distributionTasks.every((task) => task.draftText.length > 0)).toBe(true);
  });

  it("rejects an unknown canonical record instead of silently accepting a bad action", () => {
    expect(() => updateContentEngineState(buildInitialContentEngineState(), { kind: "distribution", id: "unknown-task", status: "SKIPPED" })).toThrow(/not found/i);
  });

  it("persists a substantive founder edit without changing review or publish state", () => {
    const state = buildInitialContentEngineState("2026-08-24T00:00:00.000Z");
    const body = state.drafts[0].body + "\n\nA reviewed team keeps unresolved evidence visible until it is resolved.";
    const updated = editContentDraft(state, "draft-supporting-evidence", { title: "Evidence checklist for funder reports", metaDescription: "A reviewed evidence checklist for funder reports.", body, ctaCopy: "Try one award free" });
    expect(updated.drafts[0]).toMatchObject({ title: "Evidence checklist for funder reports", ctaCopy: "Try one award free", status: "READY_FOR_REVIEW" });
    expect(updated.drafts[0].body).toContain("unresolved evidence");
  });

  it("retains both existing ready-for-review drafts with complete, readable bodies", () => {
    const drafts = buildInitialContentEngineState().drafts.filter((draft) => draft.status === "READY_FOR_REVIEW");
    expect(drafts.map((draft) => draft.title)).toEqual(expect.arrayContaining([
      "What documents do you need for a funder report? A practical evidence checklist",
      "Who should own post-award grant reporting? A nonprofit operating model"
    ]));
    expect(drafts.every((draft) => draft.body.length > 1_000 && draft.canonicalUrl.startsWith("https://grantdeskhq.com/blog/"))).toBe(true);
  });

  it("replenishes only when active review inventory falls below the floor and never revives skipped content", () => {
    let state = buildInitialContentEngineState("2026-08-24T00:00:00.000Z");
    state = updateContentEngineState(state, { kind: "draft", id: "draft-supporting-evidence", status: "SKIPPED" });
    state = updateContentEngineState(state, { kind: "opportunity", id: "content-quickbooks-grants", status: "SKIPPED" });
    const replenished = reconcileContentInventory(state, "2026-08-24T12:00:00.000Z");
    expect(replenished.generated).toBeGreaterThan(0);
    expect(replenished.state.drafts.filter((draft) => draft.status === "READY_FOR_REVIEW").length).toBeGreaterThanOrEqual(2);
    expect(replenished.state.drafts.find((draft) => draft.id === "draft-supporting-evidence")?.status).toBe("SKIPPED");
    expect(replenished.state.opportunities.find((opportunity) => opportunity.id === "content-quickbooks-grants")?.status).toBe("SKIPPED");
    const generated = replenished.state.drafts.filter((draft) => draft.updatedAt === "2026-08-24T12:00:00.000Z");
    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((draft) => draft.ctaCopy === "Try your first award free" && draft.body.includes("Try your first award free"))).toBe(true);
  });
});
