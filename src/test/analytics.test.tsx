import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsManager, isPrivateAnalyticsRoute, trackAnalyticsEvent } from "../lib/analytics";

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

  it("queues standard gtag argument objects and records one manual public page view", async () => {
    render(<MemoryRouter><AnalyticsManager /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Allow analytics" }));
    await waitFor(() => expect(window.dataLayer?.length).toBeGreaterThan(3));
    const commands = (window.dataLayer || []).map((entry) => Array.from(entry as ArrayLike<unknown>));
    expect(commands.filter(([command, name]) => command === "event" && name === "page_view")).toHaveLength(1);
    expect(commands.some(([command, measurementId]) => command === "config" && measurementId === "G-TEST12345")).toBe(true);
  });

  it("does not queue conversion events without consent and sends allowlisted events after consent", async () => {
    trackAnalyticsEvent("pricing_view", { page_type: "pricing" });
    expect(window.dataLayer).toBeUndefined();
    render(<MemoryRouter><AnalyticsManager /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Allow analytics" }));
    await waitFor(() => expect(window.gtag).toBeDefined());
    trackAnalyticsEvent("checkout_started", { plan_key: "growth" });
    const commands = (window.dataLayer || []).map((entry) => Array.from(entry as ArrayLike<unknown>));
    expect(commands.some(([command, name, properties]) => command === "event" && name === "checkout_started" && (properties as { plan_key?: string }).plan_key === "growth")).toBe(true);
  });

  it("loads the GrantDeskHQ Clarity project when the API has not supplied an override", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ googleAnalyticsMeasurementId: "G-TEST12345" })
    }));
    render(<MemoryRouter><AnalyticsManager /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Allow analytics" }));
    await waitFor(() => expect(document.getElementById("grantdeskhq-microsoft-clarity")).toHaveAttribute(
      "src",
      "https://www.clarity.ms/tag/xzcynx2076"
    ));
  });

  it("keeps private product routes out of Google Analytics page views", () => {
    expect(isPrivateAnalyticsRoute("/workspace")).toBe(true);
    expect(isPrivateAnalyticsRoute("/compile/report-123")).toBe(true);
    expect(isPrivateAnalyticsRoute("/gtm")).toBe(true);
    expect(isPrivateAnalyticsRoute("/pricing")).toBe(false);
  });
});
