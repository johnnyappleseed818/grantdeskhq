import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsManager, isPrivateAnalyticsRoute } from "../lib/analytics";

const analyticsConfig = {
  googleAnalyticsMeasurementId: "G-TEST12345",
  clarityProjectId: "clarity123"
};

describe("consent-aware visitor analytics", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => analyticsConfig }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.getElementById("grantdeskhq-google-analytics")?.remove();
    document.getElementById("grantdeskhq-microsoft-clarity")?.remove();
    delete window.gtag;
    delete window.clarity;
    delete window.dataLayer;
  });

  it("does not load either tracking script before consent", async () => {
    render(<MemoryRouter><AnalyticsManager /></MemoryRouter>);
    expect(await screen.findByRole("dialog", { name: "Help us improve GrantDeskHQ" })).toBeInTheDocument();
    expect(document.getElementById("grantdeskhq-google-analytics")).toBeNull();
    expect(document.getElementById("grantdeskhq-microsoft-clarity")).toBeNull();
  });

  it("loads both configured tools only after analytics consent", async () => {
    render(<MemoryRouter><AnalyticsManager /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Allow analytics" }));
    await waitFor(() => expect(document.getElementById("grantdeskhq-google-analytics")).toHaveAttribute("src", expect.stringContaining("G-TEST12345")));
    expect(document.getElementById("grantdeskhq-microsoft-clarity")).toHaveAttribute("src", expect.stringContaining("clarity123"));
  });

  it("keeps private product routes out of Google Analytics page views", () => {
    expect(isPrivateAnalyticsRoute("/workspace")).toBe(true);
    expect(isPrivateAnalyticsRoute("/compile/report-123")).toBe(true);
    expect(isPrivateAnalyticsRoute("/gtm")).toBe(true);
    expect(isPrivateAnalyticsRoute("/pricing")).toBe(false);
  });
});
