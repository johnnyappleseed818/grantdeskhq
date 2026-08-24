import { describe, expect, it } from "vitest";
import { buildCompetitorSeoSnapshot, dedupeCompetitorPages, recommendSeoOpportunity, scoreSeoOpportunity } from "../lib/competitorSeo";
import { buildInitialContentEngineState, reconcileContentEngine, reconcileContentInventory, updateContentEngineState } from "../lib/gtmContentEngine";

describe("bounded competitor SEO intelligence", () => {
  it("keeps only public page metadata and dedupes a competitor snapshot", () => {
    const snapshot = buildCompetitorSeoSnapshot();
    expect(snapshot.pages.length).toBeGreaterThanOrEqual(10);
    expect(snapshot.pages.every((page) => page.url.startsWith("https://") && !Object.hasOwn(page, "body"))).toBe(true);
    expect(dedupeCompetitorPages([snapshot.pages[0], snapshot.pages[0]])).toHaveLength(1);
  });

  it("prioritizes high-fit commercial post-award opportunities without inventing volume", () => {
    const snapshot = buildCompetitorSeoSnapshot();
    const p0 = snapshot.opportunities.filter((item) => item.priority === "P0");
    expect(p0.length).toBeGreaterThanOrEqual(5);
    expect(snapshot.opportunities.slice(0, p0.length).every((item) => item.priority === "P0")).toBe(true);
    expect(p0.every((item) => item.postAwardFit >= 9 && item.freeFirstAwardFit >= 9)).toBe(true);
    expect(snapshot.note).toMatch(/volume is intentionally UNKNOWN/i);
    expect(scoreSeoOpportunity(p0[0])).toBeGreaterThanOrEqual(80);
  });

  it("uses the existing primary URL for an overlap instead of creating a duplicate", () => {
    const snapshot = buildCompetitorSeoSnapshot();
    const closeout = snapshot.opportunities.find((item) => item.id === "seo-grant-closeout-checklist-refresh");
    expect(closeout).toBeTruthy();
    expect(recommendSeoOpportunity(closeout!, ["/blog/grant-closeout-checklist"])).toBe("EXPAND_EXISTING");
  });

  it("makes competitor gaps available to the existing founder-review engine without publishing", () => {
    const state = buildInitialContentEngineState();
    expect(state.autoPublishEnabled).toBe(false);
    expect(state.competitorSeo.refreshCadence).toBe("MONTHLY");
    expect(state.opportunities.some((item) => item.id === "content-grant-reporting-software" && item.seoPriority === "P0")).toBe(true);
    expect(state.opportunities.filter((item) => item.status === "READY_FOR_REVIEW" && item.seoPriority).length).toBe(0);
  });

  it("keeps skipped competitor content skipped and respects the review ceiling", () => {
    let state = buildInitialContentEngineState();
    state = updateContentEngineState(state, { kind: "opportunity", id: "content-grant-reporting-software", status: "SKIPPED" });
    const reconciled = reconcileContentEngine(state);
    expect(reconciled.opportunities.find((item) => item.id === "content-grant-reporting-software")?.status).toBe("SKIPPED");
    const replenished = reconcileContentInventory(reconciled);
    expect(replenished.state.drafts.filter((draft) => draft.status === "READY_FOR_REVIEW").length).toBeLessThanOrEqual(6);
  });
});
